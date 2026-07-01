import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { mapProductRow, num, optIntCol, optStrCol, parseDimBody } from "./product-row";
import { computeProductQuote } from "./quote-compute";
import { sendOrderEmails } from "./order-email";
import { registerMeasureGuideRoutes } from "./server-measure-guide";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-04-10",
    })
  : null;

import { seedIsoline } from "./seed-isoline";
import m from "./scratch-matrices.js";

const ADMIN_TOKEN =
  process.env.ADMIN_TOKEN?.trim() ||
  crypto.randomBytes(32).toString("hex");

if (!process.env.ADMIN_TOKEN) {
  console.warn(
    "[admin] ADMIN_TOKEN není v .env — při každém restartu serveru se vygeneruje nový token. Pro Coolify doporučujeme nastavit pevný ADMIN_TOKEN."
  );
}

const IS_PROD = process.env.NODE_ENV === "production";
const MAX_ORDER_LINES = Math.min(
  200,
  Math.max(1, Number(process.env.MAX_ORDER_LINES) || 80)
);
const MAX_QTY_PER_LINE = Math.min(
  999,
  Math.max(1, Number(process.env.MAX_QTY_PER_LINE) || 99)
);

function clipStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function generateSlug(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Jednoduchá kontrola tvaru e-mailu (ne RFC kompletní). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function looksLikeEmail(s: string): boolean {
  if (s.length < 5 || s.length > 254) return false;
  return EMAIL_SHAPE.test(s);
}

const MAX_OPTIONS_JSON_BYTES = 8192;

async function notifyOrderWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.ORDER_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn("[order-webhook] HTTP", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.warn("[order-webhook]", e);
  }
}

function pgPoolOptions(): ConstructorParameters<typeof Pool>[0] {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return {};
  const sslFromUrl = /sslmode=require/i.test(connectionString);
  const sslFromEnv = process.env.PGSSLMODE === "require";
  const ssl =
    sslFromUrl || sslFromEnv
      ? { rejectUnauthorized: false }
      : undefined;
  return { 
    connectionString, 
    ssl, 
    connectionTimeoutMillis: 5000 
  };
}

async function ensureSchema(db: Pool) {
  const runSafe = async (sql: string, label: string) => {
    try {
      await db.query(sql);
    } catch (err: any) {
      if (err.message && (err.message.includes("must be owner") || err.message.includes("already exists") || err.message.includes("permission denied"))) {
        console.warn(`[ensureSchema] Non-blocking warning for "${label}": ${err.message}`);
      } else {
        console.error(`[ensureSchema] Error preparing schema for "${label}":`, err.message || err);
        throw err;
      }
    }
  };

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Category" (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      count VARCHAR(255),
      img TEXT
    );
  `, "Category");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "FabricGroup" (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      surcharge NUMERIC(10,2) NOT NULL DEFAULT 0,
      colors JSONB DEFAULT '[]'::jsonb
    );
  `, "FabricGroup");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Product" (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      price INTEGER,
      "oldPrice" INTEGER,
      badge VARCHAR(50),
      img TEXT,
      "desc" TEXT
    );
  `, "Product");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Order" (
      id SERIAL PRIMARY KEY,
      order_no VARCHAR(50) UNIQUE NOT NULL,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      customer_name VARCHAR(255) NOT NULL,
      total_amount INTEGER,
      status VARCHAR(50) DEFAULT 'Nová',
      items_count INTEGER
    );
  `, "Order");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Customer" (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      orders_count INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      registered TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, "Customer");

  await db.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`).catch(() => {});
  await db.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50)`).catch(() => {});

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(100) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, "AuditLog");
  await db.query(`CREATE INDEX IF NOT EXISTS idx_auditlog_entity ON "AuditLog"(entity_type, entity_id);`).catch(() => {});

  await db
    .query(
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`
    )
    .catch(() => {});
  await db
    .query(
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`
    )
    .catch(() => {});
  for (const sql of [
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS price_mode VARCHAR(32) DEFAULT 'matrix_cell'`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_group INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS validation_profile VARCHAR(32)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_groups_config JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS dimension_constraints JSONB DEFAULT NULL`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS is_action BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE`,
  ]) {
    await db.query(sql).catch(() => {});
  }
  
  // Backward compatibility: fill slugs for products that don't have one
  try {
    const prodsWithoutSlug = await db.query('SELECT id, title FROM "Product" WHERE slug IS NULL');
    for (const p of prodsWithoutSlug.rows) {
      const baseSlug = generateSlug(p.title);
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        try {
          await db.query('UPDATE "Product" SET slug = $1 WHERE id = $2', [slug, p.id]);
          break;
        } catch (err: any) {
          if (err.code === '23505') { // unique violation
            slug = `${baseSlug}-${counter}`;
            counter++;
          } else {
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not generate slugs for existing products:", err);
  }

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "ProductHeightPriceTier" (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
      height_mm_min INTEGER NOT NULL,
      height_mm_max INTEGER NOT NULL,
      price_per_m2_czk INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `, "ProductHeightPriceTier");

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_height_price_tier_product ON "ProductHeightPriceTier"(product_id);
  `).catch((err) => {
    console.warn("Could not create index on ProductHeightPriceTier (maybe user is not owner):", err.message || err);
  });

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "ProductPriceBracket" (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
      width_mm_max INTEGER NOT NULL,
      height_mm_max INTEGER NOT NULL,
      base_price_czk INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `, "ProductPriceBracket");

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_product_price_bracket_product ON "ProductPriceBracket"(product_id);
  `).catch((err) => {
    console.warn("Could not create index on ProductPriceBracket (maybe user is not owner):", err.message || err);
  });

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Review" (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
      author_name VARCHAR(255) NOT NULL,
      rating INTEGER NOT NULL,
      text TEXT,
      images JSONB DEFAULT '[]'::jsonb,
      approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, "Review");

  for (const sql of [
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50)`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS customer_note TEXT`,
    `ALTER TABLE "OrderItem" ALTER COLUMN product_id DROP NOT NULL`,
    `ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_product_id_fkey"`,
    `ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY (product_id) REFERENCES "Product"(id) ON DELETE SET NULL`
  ]) {
    await db.query(sql).catch(() => {});
  }

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "OrderItem" (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES "Product"(id) ON DELETE SET NULL,
      product_title VARCHAR(500),
      width_mm INTEGER NOT NULL,
      height_mm INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_czk INTEGER NOT NULL,
      line_total_czk INTEGER NOT NULL,
      options JSONB DEFAULT '{}'::jsonb
    );
  `, "OrderItem");

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_item_order ON "OrderItem"(order_id);
  `).catch((err) => {
    console.warn("Could not create index on OrderItem (maybe user is not owner):", err.message || err);
  });

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "MeasureGuidePage" (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      eyebrow VARCHAR(255) NOT NULL DEFAULT '',
      title VARCHAR(500) NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      card_title VARCHAR(500) NOT NULL DEFAULT '',
      card_subtitle TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT measure_guide_single_row CHECK (id = 1)
    );
  `, "MeasureGuidePage");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "MeasureGuideSection" (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      body_html TEXT NOT NULL DEFAULT '',
      video_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `, "MeasureGuideSection");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "Image" (
      id VARCHAR(64) PRIMARY KEY,
      mime_type VARCHAR(100) NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, "Image");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "StoreSettings" (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB DEFAULT '{}'::jsonb
    );
  `, "StoreSettings");

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "CustomerReview" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      city TEXT,
      content TEXT NOT NULL,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, "CustomerReview");

  // Init StoreSettings if empty
  const defaultBanners = JSON.stringify({
    banners: [
      {
        id: "1",
        image: "https://images.unsplash.com/photo-1615873968403-89e068629265?q=80&w=1600&auto=format&fit=crop",
        title: "Doprava zdarma",
        subtitle: "Při objednávce nad 5 000 Kč máte dopravu po celé ČR zcela zdarma.",
        buttonText: "Zobrazit produkty",
        link: "#/kategorie"
      },
      {
        id: "2",
        image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1600&auto=format&fit=crop",
        title: "Sleva 10% na vybrané produkty",
        subtitle: "Využijte časově omezené akce a nakupte prémiové stínění levněji.",
        buttonText: "Zobrazit slevy",
        link: "#/kategorie?cat=Promoakce"
      },
      {
        id: "3",
        image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1600&auto=format&fit=crop",
        title: "Kvalitní stínění na míru",
        subtitle: "Objevte naše moderní venkovní rolety, screeny a interiérové žaluzie pro váš domov.",
        buttonText: "Začít konfigurovat",
        link: "#/kategorie"
      }
    ],
    recommendedProducts: []
  });

  await db.query(`
    INSERT INTO "StoreSettings" (id, data)
    VALUES (1, $1)
    ON CONFLICT (id) DO NOTHING;
  `, [defaultBanners]).catch(console.error);

  await db
    .query(
      `INSERT INTO "MeasureGuidePage" (id, eyebrow, title, intro, card_title, card_subtitle)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        "MĚŘENÍ A PŘÍPRAVA",
        "Jak zaměřit před objednávkou",
        "Přesný postup pro čistý montážní otvor.",
        "Krok za krokem (přehled)",
        "Stejný princip platí pro rolety, žaluzie i vrata — liší se jen detaily u těsnění a vedení kabelů.",
      ]
    )
    .catch(() => {});

  const secCount = await db.query('SELECT COUNT(*)::int AS c FROM "MeasureGuideSection"');
  if ((secCount.rows[0] as { c: number }).c === 0) {
    const defaults: [string, string, number][] = [
      [
        "Venkovní rolety / screen",
        "<p>Doplňte přesný postup měření pro venkovní rolety a screenové clony. Můžete vložit video z panelu nástrojů (ikona videa) nebo odkaz níže v administraci.</p>",
        0,
      ],
      [
        "Žaluzie (interiér i fasáda)",
        "<p>Doplňte měření pro interiérové i fasádní žaluzie — rozteč otvorů, krycí šířky, hladina těsnění.</p>",
        1,
      ],
      [
        "Vrata",
        "<p>Doplňte specifika pro garážová a průmyslová vrata (světlost otvoru, boční a horní mezery).</p>",
        2,
      ],
    ];
    for (const [title, html, ord] of defaults) {
      await db
        .query(
          `INSERT INTO "MeasureGuideSection" (title, body_html, sort_order) VALUES ($1, $2, $3)`,
          [title, html, ord]
        )
        .catch(() => {});
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (IS_PROD && process.env.TRUST_PROXY !== "0") {
    app.set("trust proxy", 1);
  }

  const corsOrigins = process.env.CORS_ORIGIN?.trim();
  if (corsOrigins) {
    const list = corsOrigins.split(",").map((s) => s.trim()).filter(Boolean);
    app.use(
      cors({
        origin: list.length === 1 ? list[0] : list,
      })
    );
  } else {
    app.use(cors());
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 30 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Příliš mnoho pokusů o přihlášení. Zkuste to znovu za chvíli." },
  });

  const ordersLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 40 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Příliš mnoho objednávek z této sítě. Zkuste to později nebo nás kontaktujte.",
    },
  });

  const quoteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 200 : 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Příliš mnoho výpočtů cen. Zkuste to za chvíli." },
  });

  const reviewsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 20 : 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Příliš mnoho požadavků. Zkuste to za chvíli." },
  });

  if (stripe) {
    app.post(
      "/api/webhooks/stripe",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        const sig = req.headers["stripe-signature"];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!sig || !webhookSecret || !stripe) {
          res.status(400).send("Chybí webhook konfigurace");
          return;
        }

        let event;
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err: any) {
          console.error("Webhook signature verification failed.", err.message);
          res.status(400).send(`Webhook Error: ${err.message}`);
          return;
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.order_id;
          const orderNo = session.metadata?.order_no;

          if (orderId && orderNo) {
            const db = initDb();
            if (db) {
              const client = await db.connect();
              try {
                await client.query("BEGIN");
                
                // Zjistit aktuální stav objednávky
                const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1', [orderId]);
                const order = orderRes.rows[0];

                if (order && order.payment_status !== "Zaplaceno") {
                  await client.query(
                    'UPDATE "Order" SET payment_status = $1 WHERE id = $2',
                    ["Zaplaceno", orderId]
                  );

                  // Načíst položky pro odeslání emailu a webhooku do výroby (QAPI)
                  const itemsRes = await client.query('SELECT * FROM "OrderItem" WHERE order_id = $1', [orderId]);
                  
                  const webhookLines = itemsRes.rows.map((r) => ({
                    product_id: r.product_id,
                    title: r.product_title,
                    width_mm: r.width_mm,
                    height_mm: r.height_mm,
                    quantity: r.quantity,
                    line_total_czk: r.line_total_czk,
                  }));

                  void notifyOrderWebhook({
                    event: "order.paid",
                    order_no: orderNo,
                    order_id: Number(orderId),
                    customer_name: order.customer_name,
                    email: order.customer_email || "",
                    phone: order.customer_phone || null,
                    total_amount_czk: order.total_amount,
                    items_count: order.items_count,
                    lines: webhookLines,
                  });

                  void sendOrderEmails({
                    orderNo,
                    customerName: order.customer_name,
                    customerEmail: order.customer_email || "",
                    totalCzk: order.total_amount,
                    itemsCount: order.items_count,
                    lines: webhookLines,
                  });
                }
                
                await client.query("COMMIT");
                console.log(`[stripe] Objednávka ${orderNo} úspěšně zaplacena.`);
              } catch (err) {
                await client.query("ROLLBACK").catch(() => {});
                console.error("[stripe] Chyba při zpracování zaplacené objednávky", err);
              } finally {
                client.release();
              }
            }
          }
        }

        res.json({ received: true });
      }
    );
  }

  app.use(express.json({ limit: "50mb" }));

  if (IS_PROD) {
    if (!process.env.ADMIN_PASSWORD) {
      console.warn("[provoz] ADMIN_PASSWORD není nastaveno — přihlášení do adminu nebude fungovat.");
    }
    if (!process.env.DATABASE_URL) {
      console.warn("[provoz] DATABASE_URL chybí — API nad databází vrátí chyby.");
    }
  }

  let pool: Pool | null = null;
  let schemaPromise: Promise<void> | null = null;

  const initDb = () => {
    if (!pool && process.env.DATABASE_URL) {
      pool = new Pool(pgPoolOptions());

      const schema = process.env.DATABASE_SCHEMA?.trim() || "public";
      if (/^[a-zA-Z0-9_-]+$/.test(schema)) {
        pool.on("connect", (client) => {
          client.query(`SET search_path TO "${schema}"`).catch((err) => {
            console.error(`Failed to set search_path to ${schema}:`, err);
          });
        });
      }

      schemaPromise = ensureSchema(pool)
        .then(() => seedIsoline(pool as Pool))
        .catch((err) => console.error("ensureSchema:", err));
    }
    return pool;
  };

  const withDb = async (
    res: express.Response,
    fn: (db: Pool) => Promise<void>
  ) => {
    const db = initDb();
    if (!db) {
      res.status(500).json({ error: "Missing DATABASE_URL" });
      return;
    }
    if (schemaPromise) await schemaPromise;
    await fn(db);
  };

  const requireAdmin = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const headerToken = req.headers.authorization?.split(" ")[1];
    const queryToken = req.query.token as string;
    const token = headerToken || queryToken;
    if (token === ADMIN_TOKEN) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  app.post("/api/login", loginLimiter, (req, res) => {
    const { password } = req.body;
    if (password && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      res.json({ token: ADMIN_TOKEN });
    } else {
      res.status(401).json({ error: "Špatné heslo" });
    }
  });

  app.get("/api/health", async (req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.json({
        status: "ok",
        environment: IS_PROD ? "production" : "development",
        db: "not_configured",
        hint: "Missing DATABASE_URL",
      });
    }
    await withDb(res, async (db) => {
      try {
        const result = await db.query("SELECT NOW()");
        res.json({
          status: "ok",
          environment: IS_PROD ? "production" : "development",
          db: "connected",
          time: result.rows[0].now,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "DB Error" });
      }
    });
  });

  app.get("/api/products", async (req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "Missing DATABASE_URL" });
    }
    await withDb(res, async (db) => {
      try {
        let result;
        const baseQuery = `
          SELECT p.*, COALESCE(r.review_count, 0) as review_count, r.avg_rating 
          FROM "Product" p
          LEFT JOIN (
            SELECT product_id, COUNT(*) as review_count, AVG(rating)::numeric(10,1) as avg_rating
            FROM "Review"
            WHERE approved = true
            GROUP BY product_id
          ) r ON p.id = r.product_id
        `;
        try {
          result = await db.query(baseQuery + ' WHERE p.hidden IS NOT TRUE');
        } catch (e: any) {
          if (e.code === '42703' || (e.message && e.message.includes('hidden'))) {
            result = await db.query(baseQuery);
          } else {
            throw e;
          }
        }
        res.json(result.rows.map((r) => mapProductRow(r as Record<string, unknown>)));
      } catch (err: any) {
        console.error("Error fetching products:", err.message || err);
        res.json([]);
      }
    });
  });

  app.get("/api/images/:id", async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = req.params.id;
        const result = await db.query('SELECT mime_type, data FROM "Image" WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          res.status(404).send("Not found");
          return;
        }
        const img = result.rows[0] as { mime_type: string; data: string };
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        res.setHeader("Content-Type", img.mime_type);
        res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache
        res.send(buffer);
      } catch {
        res.status(500).send("Server error");
      }
    });
  });

  app.post("/api/admin/images", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { mimeType, data } = req.body;
        if (!mimeType || !data) {
          res.status(400).json({ error: "Chybí mimeType nebo data." });
          return;
        }
        const cryptoPath = await import("crypto");
        const id = "img_" + cryptoPath.default.randomBytes(8).toString("hex");
        await db.query('INSERT INTO "Image" (id, mime_type, data) VALUES ($1, $2, $3)', [id, mimeType, data]);
        res.json({ id, url: `/api/images/${id}` });
      } catch (e: any) {
        console.error("Upload error:", e);
        res.status(500).json({ error: "Nastala chyba při ukládání obrázku." });
      }
    });
  });

  app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query(
          'SELECT r.*, p.title as product_title FROM "Review" r JOIN "Product" p ON r.product_id = p.id ORDER BY r.created_at DESC'
        );
        res.json(result.rows);
      } catch (err) {
        console.error("Error fetching admin reviews:", err);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.patch("/api/admin/reviews/:id/approve", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { approved } = req.body;
    await withDb(res, async (db) => {
      try {
        await db.query('UPDATE "Review" SET approved = $1 WHERE id = $2', [!!approved, id]);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    await withDb(res, async (db) => {
      try {
        await db.query('DELETE FROM "Review" WHERE id = $1', [id]);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.get("/api/admin/products", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query('SELECT * FROM "Product"');
        res.json(result.rows.map((r) => mapProductRow(r as Record<string, unknown>)));
      } catch {
        res.json([]);
      }
    });
  });

  app.get("/api/categories", async (req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "Missing DATABASE_URL" });
    }
    await withDb(res, async (db) => {
      try {
        const result = await db.query('SELECT * FROM "Category"');
        res.json(result.rows);
      } catch (err: any) {
        console.error("Error fetching categories:", err.message || err);
        res.json([]);
      }
    });
  });

  /** Kalkulace z rozměrové tabulky + navýšení dodavatele + provize (zaokrouhleno na Kč). */
  app.post("/api/products/:id/quote", quoteLimiter, async (req, res) => {
    const id = req.params.id;
    const widthMm = Number(req.body?.widthMm ?? req.body?.width_mm);
    const heightMm = Number(req.body?.heightMm ?? req.body?.height_mm);
    if (!id) {
      return res.status(400).json({ error: "Neplatné ID produktu" });
    }
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 1 || heightMm < 1) {
      return res.status(400).json({ error: "Zadejte šířku a výšku v mm (kladná čísla)" });
    }
    await withDb(res, async (db) => {
      try {
        const body =
          req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
        const result = await computeProductQuote(db, id, widthMm, heightMm, body);
        if (result.ok === false) {
          res.status(result.status).json(result.body);
          return;
        }
        res.json(result.data);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Chyba výpočtu" });
      }
    });
  });

  // --- REVIEWS ---

  app.get("/api/products/:id/reviews", async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product ID" });
    await withDb(res, async (db) => {
      try {
        const result = await db.query(
          'SELECT id, author_name, rating, text, images, created_at FROM "Review" WHERE product_id = $1 AND approved = true ORDER BY created_at DESC',
          [productId]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("Error fetching reviews:", err);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.post("/api/products/:id/reviews", reviewsLimiter, async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product ID" });
    const { author_name, rating, text, images } = req.body;
    if (!author_name || !rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Vyplňte jméno a hodnocení (1-5 hvězdiček)." });
    }
    await withDb(res, async (db) => {
      try {
        await db.query(
          'INSERT INTO "Review" (product_id, author_name, rating, text, images, approved) VALUES ($1, $2, $3, $4, $5, false)',
          [productId, String(author_name), rating, text ? String(text) : null, JSON.stringify(Array.isArray(images) ? images : [])]
        );
        res.json({ success: true });
      } catch (err) {
        console.error("Error saving review:", err);
        res.status(500).json({ error: "Chyba při ukládání recenze." });
      }
    });
  });

  app.post("/api/reviews/upload", reviewsLimiter, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { mimeType, data } = req.body;
        if (!mimeType || !data) {
          res.status(400).json({ error: "Chybí mimeType nebo data." });
          return;
        }
        if (!mimeType.startsWith("image/")) {
          res.status(400).json({ error: "Nepovolený formát." });
          return;
        }
        const cryptoPath = await import("crypto");
        const id = "rev_" + cryptoPath.default.randomBytes(8).toString("hex");
        await db.query('INSERT INTO "Image" (id, mime_type, data) VALUES ($1, $2, $3)', [id, mimeType, data]);
        res.json({ id, url: `/api/images/${id}` });
      } catch (e: any) {
        console.error("Upload error:", e);
        res.status(500).json({ error: "Nastala chyba při ukládání obrázku." });
      }
    });
  });

  app.post("/api/orders", ordersLimiter, async (req, res) => {
    await withDb(res, async (db) => {
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
        string,
        unknown
      >;
      const customer = (body.customer && typeof body.customer === "object"
        ? (body.customer as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      let name = String(customer.name ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "Jméno zákazníka je povinné." });
        return;
      }
      name = clipStr(name, 255);
      let email = customer.email != null ? String(customer.email).trim() : "";
      email = clipStr(email, 255);
      if (!email || !looksLikeEmail(email)) {
        res.status(400).json({
          error: "Vyplňte platný e-mail — potřebujeme ho pro potvrzení a komunikaci k objednávce.",
        });
        return;
      }
      let phone = customer.phone != null ? String(customer.phone).trim() : "";
      phone = clipStr(phone, 50);
      let note = customer.note != null ? String(customer.note).trim() : "";
      note = clipStr(note, 4000);
      const paymentMethod = body.paymentMethod === 'transfer' ? 'transfer' : 'card';
      const items = body.items;
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "Košík je prázdný." });
        return;
      }
      if (items.length > MAX_ORDER_LINES) {
        res.status(400).json({
          error: `Objednávka může mít nejvýše ${MAX_ORDER_LINES} řádků. Zkontaktujte nás pro větší objednávky.`,
        });
        return;
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        let totalAmount = 0;
        let itemsCount = 0;
        const lineRows: Array<{
          product_id: string;
          product_title: string;
          width_mm: number;
          height_mm: number;
          quantity: number;
          unit_price_czk: number;
          line_total_czk: number;
          options: Record<string, unknown>;
        }> = [];

        for (const raw of items) {
          const it = raw as Record<string, unknown>;
          const productId = String(it.productId ?? it.product_id);
          const widthMm = Number(it.widthMm ?? it.width_mm);
          const heightMm = Number(it.heightMm ?? it.height_mm);
          let quantity = Math.max(1, Math.floor(Number(it.quantity) || 1));
          if (quantity > MAX_QTY_PER_LINE) {
            throw Object.assign(new Error("BAD_QTY"), {
              status: 400,
              msg: `Maximální množství na řádek je ${MAX_QTY_PER_LINE} ks.`,
            });
          }
          const options =
            it.options && typeof it.options === "object"
              ? (it.options as Record<string, unknown>)
              : {};
          const optionsJson = JSON.stringify(options);
          if (optionsJson.length > MAX_OPTIONS_JSON_BYTES) {
            throw Object.assign(new Error("BAD_OPTS"), {
              status: 400,
              msg: "Příliš rozsáhlé parametry u položky košíku.",
            });
          }
          if (!productId) {
            throw Object.assign(new Error("BAD_ITEM"), {
              status: 400,
              msg: "Neplatná položka košíku (produkt).",
            });
          }
          if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 1 || heightMm < 1) {
            throw Object.assign(new Error("BAD_ITEM"), {
              status: 400,
              msg: "Neplatné rozměry u položky.",
            });
          }
          const qres = await computeProductQuote(client, productId, widthMm, heightMm, options);
          if (qres.ok === false) {
            const errMsg =
              typeof (qres.body as { error?: string }).error === "string"
                ? (qres.body as { error: string }).error
                : "Výpočet ceny selhal.";
            throw Object.assign(new Error("QUOTE_FAIL"), { status: qres.status, msg: errMsg });
          }
          const totalUnit = Number(qres.data.total_czk);
          const title = String(qres.data.product_title ?? "");
          const lineTotal = Math.round(totalUnit * quantity);
          totalAmount += lineTotal;
          itemsCount += quantity;
          lineRows.push({
            product_id: productId,
            product_title: title,
            width_mm: Math.round(widthMm),
            height_mm: Math.round(heightMm),
            quantity,
            unit_price_czk: Math.round(totalUnit),
            line_total_czk: lineTotal,
            options,
          });
        }        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const prefix = `Q-${yyyy}${mm}${dd}`;

        const lastOrderRes = await client.query(
          `SELECT order_no FROM "Order" WHERE order_no LIKE $1 ORDER BY id DESC LIMIT 1`,
          [`${prefix}%`]
        );
        let sequence = 1;
        if (lastOrderRes.rows.length > 0) {
           const lastNo = lastOrderRes.rows[0].order_no;
           const lastSeqStr = lastNo.slice(-4);
           const lastSeqNum = parseInt(lastSeqStr, 10);
           if (!isNaN(lastSeqNum)) {
               sequence = lastSeqNum + 1;
           } else {
               const countRes = await client.query(`SELECT COUNT(*) as count FROM "Order" WHERE order_no LIKE $1`, [`${prefix}%`]);
               sequence = parseInt(countRes.rows[0].count, 10) + 1;
           }
        }
        const seqStr = String(sequence).padStart(4, '0');
        const orderNo = `${prefix}${seqStr}`;

        const orderIns = await client.query(
          `INSERT INTO "Order" (order_no, customer_name, total_amount, status, items_count, customer_email, customer_phone, customer_note, payment_method, payment_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            orderNo,
            name,
            totalAmount,
            "Nová",
            itemsCount,
            email || null,
            phone || null,
            note || null,
            paymentMethod,
            "Nezaplaceno"
          ]
        );
        const orderId = orderIns.rows[0].id as number;

        await client.query(
          `INSERT INTO "AuditLog" (entity_type, entity_id, action, old_value, new_value)
           VALUES ($1, $2, $3, $4, $5)`,
          ['order', orderId, 'vytvoření', '', 'Nová']
        );

        for (const row of lineRows) {
          await client.query(
            `INSERT INTO "OrderItem" (order_id, product_id, product_title, width_mm, height_mm, quantity, unit_price_czk, line_total_czk, options)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [
              orderId,
              row.product_id,
              row.product_title,
              row.width_mm,
              row.height_mm,
              row.quantity,
              row.unit_price_czk,
              row.line_total_czk,
              JSON.stringify(row.options),
            ]
          );
        }

        await client.query(
          `INSERT INTO "Customer" (name, email, phone, orders_count, total_spent)
           VALUES ($1, $2, $3, 1, $4)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             phone = COALESCE(NULLIF(EXCLUDED.phone, ''), "Customer".phone),
             orders_count = "Customer".orders_count + 1,
             total_spent = COALESCE("Customer".total_spent, 0) + EXCLUDED.total_spent`,
          [name, email, phone || null, totalAmount]
        );

        await client.query("COMMIT");
        console.log(
          `[order] ${orderNo} | ${totalAmount} Kč bez DPH | ${itemsCount} ks | ${name} <${email}>`
        );
        const webhookLines = lineRows.map((r) => ({
          product_id: r.product_id,
          title: r.product_title,
          width_mm: r.width_mm,
          height_mm: r.height_mm,
          quantity: r.quantity,
          line_total_czk: r.line_total_czk,
        }));
        let checkoutUrl: string | null = null;
        if (paymentMethod === "card" && stripe) {
          try {
            const host = req.headers.origin || (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0] : "http://localhost:5173");
            const session = await stripe.checkout.sessions.create({
              payment_method_types: ["card"],
              line_items: lineRows.map((r) => ({
                price_data: {
                  currency: "czk",
                  product_data: {
                    name: r.product_title,
                    description: `${r.width_mm}x${r.height_mm} mm`,
                  },
                  unit_amount: Math.round(r.unit_price_czk * 100),
                },
                quantity: r.quantity,
              })),
              mode: "payment",
              success_url: `${host}/#/objednavka-uspesna?session_id={CHECKOUT_SESSION_ID}&order_no=${orderNo}`,
              cancel_url: `${host}/#/kosik`,
              client_reference_id: String(orderId),
              metadata: {
                order_id: String(orderId),
                order_no: orderNo,
              },
            });
            checkoutUrl = session.url;
          } catch (err) {
            console.error("Stripe session creation failed", err);
          }
        } else {
          setImmediate(() => {
            void notifyOrderWebhook({
              event: "order.created",
              order_no: orderNo,
              order_id: orderId,
              customer_name: name,
              email,
              phone: phone || null,
              total_amount_czk: totalAmount,
              items_count: itemsCount,
              lines: webhookLines,
            });
            void sendOrderEmails({
              orderNo,
              customerName: name,
              customerEmail: email,
              totalCzk: totalAmount,
              itemsCount,
              lines: lineRows.map((r) => ({
                title: r.product_title,
                width_mm: r.width_mm,
                height_mm: r.height_mm,
                quantity: r.quantity,
                line_total_czk: r.line_total_czk,
              })),
            });
          });
        }
        res.status(201).json({ order: orderIns.rows[0], order_no: orderNo, checkoutUrl });
      } catch (e: unknown) {
        await client.query("ROLLBACK").catch(() => {});
        const err = e as { status?: number; msg?: string };
        if (typeof err.status === "number" && typeof err.msg === "string") {
          res.status(err.status).json({ error: err.msg });
        } else {
          console.error(e);
          res.status(500).json({ error: "Objednávku se nepodařilo uložit." });
        }
      } finally {
        client.release();
      }
    });
  });

  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query(
          'SELECT * FROM "Order" ORDER BY date DESC'
        );
        res.json(result.rows);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  /** Souhrnné statistiky a data pro dashboard (7d graf, poslední objednávky). */
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const [prod, cat, ord, cust, series, recent] = await Promise.all([
          db.query('SELECT COUNT(*)::int AS c FROM "Product"'),
          db.query('SELECT COUNT(*)::int AS c FROM "Category"'),
          db.query(`
            SELECT
              COUNT(*)::int AS order_count,
              COALESCE(SUM(total_amount), 0)::bigint AS total_czk
            FROM "Order"
          `),
          db.query('SELECT COUNT(*)::int AS c FROM "Customer"'),
          db.query(`
            WITH days AS (
              SELECT generate_series(
                CURRENT_DATE - INTERVAL '6 days',
                CURRENT_DATE,
                '1 day'::interval
              )::date AS day
            )
            SELECT d.day::text AS day,
              COALESCE(SUM(o.total_amount), 0)::bigint AS total_czk,
              COUNT(o.id)::int AS order_count
            FROM days d
            LEFT JOIN "Order" o ON o.date::date = d.day
            GROUP BY d.day
            ORDER BY d.day
          `),
          db.query(`
            SELECT id, order_no, date, customer_name, customer_email, total_amount, status, items_count
            FROM "Order"
            ORDER BY date DESC
            LIMIT 8
          `),
        ]);
        const orow = ord.rows[0] as { order_count?: number; total_czk?: string | number } | undefined;
        const chart = (
          series.rows as Array<{
            day: string;
            total_czk: string | number;
            order_count: number;
          }>
        ).map((r) => {
          const d = new Date(r.day + "T12:00:00");
          const name = d.toLocaleDateString("cs-CZ", { weekday: "short" });
          return {
            day: r.day,
            name,
            trzby: Number(r.total_czk) || 0,
            objednavky: r.order_count || 0,
          };
        });
        res.json({
          products_count: Number((prod.rows[0] as { c?: number })?.c ?? 0),
          categories_count: Number((cat.rows[0] as { c?: number })?.c ?? 0),
          orders_count: Number(orow?.order_count ?? 0),
          orders_total_czk: Number(orow?.total_czk ?? 0),
          customers_count: Number((cust.rows[0] as { c?: number })?.c ?? 0),
          chart_last_7_days: chart,
          recent_orders: recent.rows,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );
        res.json({ ...(o.rows[0] as Record<string, unknown>), items: items.rows });
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.get("/api/admin/orders/:id/export-lagarta", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const lagartaItems = items.rows.filter((item: any) => 
          (item.product_title || '').toLowerCase().includes('lagarta')
        );

        if (lagartaItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje produkty Lagarta" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '02_formular_plise_zaluzie_Lagarta_z_QAPI.xls');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        const workbook = XLSX.readFile(templatePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        sheet['B3'] = { v: "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2", t: 's' };
        sheet['F3'] = { v: new Date(order.date).toLocaleDateString('cs-CZ'), t: 's' };
        sheet['J3'] = { v: order.order_no, t: 's' };
        sheet['B5'] = { v: "+420 774 060 193", t: 's' };

        let currentRow = 8;
        lagartaItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          const model = params.model || '';
          
          const barvaMap: Record<string, string> = {
            bila: 'Bílá (RAL 9016)',
            kremova: 'Krémová (RAL 1015)',
            hneda: 'Hnědá (RAL 8017)',
            stribrna: 'Stříbrná (RAL 9006)',
            antracit: 'Antracit (RAL 7016)',
            cerna: 'Černá (RAL 9005)',
            zlaty_dub: 'Zlatý dub (Golden Oak)',
            dark_walnut: 'Ořech (Dark Walnut)',
            winchester: 'Winchester',
            imitace: 'Imitace dřeva (zlatý dub, ořech, winchester)'
          };
          let barva_profilu = barvaMap[params.barva_profilu] || params.barva_profilu || '';
          if (params.barva_profilu === 'ral' && params.vlastni_ral_kod) {
            barva_profilu = `RAL ${params.vlastni_ral_kod}`;
          }

          const pLatka = item.options?.latka || item.options?.fabric || params.latka || '';
          const pLatkaHorni = params.latka_horni || pLatka;
          const pLatkaDolni = params.latka_dolni || '';
          
          let latkaHorni = '';
          let latkaDolni = '';
          if (model === 'PM4' || model === 'PM5') {
            latkaHorni = pLatkaHorni;
            latkaDolni = pLatkaDolni;
          } else {
            latkaHorni = pLatkaHorni;
          }
          
          // Rozdělení látky na Název a Barvu (např. "Sonia FR - 105 White")
          let latkaHorniNazev = latkaHorni;
          let latkaHorniBarva = '';
          if (latkaHorni.includes(' - ')) {
            const parts = latkaHorni.split(' - ');
            latkaHorniNazev = parts[0];
            latkaHorniBarva = parts.slice(1).join(' - ');
          }

          let latkaDolniNazev = latkaDolni;
          let latkaDolniBarva = '';
          if (latkaDolni.includes(' - ')) {
            const parts = latkaDolni.split(' - ');
            latkaDolniNazev = parts[0];
            latkaDolniBarva = parts.slice(1).join(' - ');
          }

          const strana = params.strana_ovladani || '';
          let stranaLetter = '';
          if (strana === 'prava') stranaLetter = 'P';
          else if (strana === 'leva') stranaLetter = 'L';
          
          const typLetter = 'a'; // Zákazník už nevybírá, vždy je to Madlo
          
          let ovladani = '';
          if (stranaLetter) ovladani = `${stranaLetter} ${typLetter}`;
          else ovladani = typLetter;

          let montaz = '';
          const typUchyceni = params.typ_uchyceni || '';
          if (typUchyceni === 'zasklivaci_lista') montaz = 'a';
          else if (typUchyceni === 'konzola') montaz = 'b';
          else montaz = params.montaz || '';
          
          const m2 = ((w * h) / 1000000).toFixed(2);
          const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
          const customerDetails = `${order.customer_name}, Tel: ${order.customer_phone || '-'}, E-mail: ${order.customer_email || '-'}, Adresa: ${addr || '-'}`;
          
          // Dáme m2 hned na začátek poznámky, aby to bylo jasně viditelné
          let poznamka = `Plocha: ${m2} m2 | Zákazník: ${customerDetails}`;
          if (params.poznamka) poznamka += ` | Pozn. zákazníka: ${params.poznamka}`;

          const writeCell = (colChar: string, val: any) => {
            if (val == null || val === '') return;
            const ref = `${colChar}${currentRow + 1}`;
            sheet[ref] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
          };

          writeCell('A', index + 1 + '.');
          writeCell('B', w);
          writeCell('C', h);
          writeCell('D', qty);
          writeCell('E', model);
          writeCell('F', barva_profilu);
          writeCell('G', latkaHorniNazev);
          writeCell('H', latkaHorniBarva);
          writeCell('I', latkaDolniNazev);
          writeCell('J', latkaDolniBarva);
          writeCell('K', ovladani);
          writeCell('L', montaz);
          writeCell('M', poznamka);
          
          currentRow++;
        });

        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:S50');
        if (currentRow > range.e.r) {
          range.e.r = currentRow;
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });

        res.setHeader('Content-Disposition', `attachment; filename="Objednavka_Lagarta_${order.order_no}.xls"`);
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.send(buf);

      } catch (err) {
        console.error('Lagarta export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });

  app.get("/api/admin/orders/:id/export-horizontalni-zaluzie", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const horizontalItems = items.rows.filter((item: any) => 
          (item.product_title || '').toLowerCase().includes('horizontální žaluzie')
        );

        if (horizontalItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje Horizontální žaluzie" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '01_formular_horizontalni_zaluzie_Isoline_Loco_Prim_Eco.xls');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        const workbook = XLSX.readFile(templatePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
        
        sheet['B1'] = { v: "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2", t: 's' };
        sheet['B3'] = { v: addr, t: 's' };
        sheet['B5'] = { v: "+420 774 060 193", t: 's' };
        sheet['I3'] = { v: new Date(order.date).toLocaleDateString('cs-CZ'), t: 's' };
        sheet['N3'] = { v: order.order_no, t: 's' };

        let currentRow = 9; // data starts at row 10 (index 9)
        horizontalItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          const typZaluzie = params.typ_profilu === 'prim' ? 'Isoline PRIM' : 'Isoline';
          const materialProfilu = params.typ_profilu === 'prim' ? 'Fe' : 'Al';
          const montazniPodpera = params.typ_profilu === 'prim' ? 'ANO' : 'NE';
          
          let barvaProfilu = params.barva_profilu || '';
          if (barvaProfilu === 'al_ral' && params.vlastni_ral_kod) {
            barvaProfilu = `Vlastní RAL: ${params.vlastni_ral_kod}`;
          }
          let typLamely = '25x0.21';
          let barvaLamely = params.lamela_typ || '';

          const m2 = ((w * h) / 1000000).toFixed(2);
          const customerDetails = `${order.customer_name}, Tel: ${order.customer_phone || '-'}, E-mail: ${order.customer_email || '-'}`;
          
          let poznamka = `Plocha: ${m2} m2 | Zákazník: ${customerDetails}`;
          if (params.poznamka) poznamka += ` | Pozn. zákazníka: ${params.poznamka}`;

          const writeCell = (colChar: string, val: any) => {
            if (val == null || val === '') return;
            const ref = `${colChar}${currentRow + 1}`;
            sheet[ref] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
          };

          writeCell('A', index + 1 + '.');
          writeCell('C', w);
          writeCell('D', h);
          writeCell('E', qty);
          writeCell('F', params.ovladani_strana || '');
          writeCell('G', materialProfilu);
          writeCell('H', params.doplnek_prim || '');
          writeCell('I', typZaluzie);
          writeCell('J', barvaProfilu);
          writeCell('M', typLamely);
          writeCell('N', barvaLamely);
          writeCell('O', params.celostin === 'ano' ? 'ANO' : 'NE');
          writeCell('P', params.delka_ovladani || '');
          writeCell('Q', params.typ_okna || '');
          writeCell('R', params.podlozka || '0');
          writeCell('S', params.barva_sladeni === 'ano' ? 'ANO' : 'NE');
          writeCell('T', params.bezpecnost === 'ano' ? 'ANO' : 'NE');
          writeCell('U', montazniPodpera);
          writeCell('V', poznamka);
          
          currentRow++;
        });

        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:V50');
        if (currentRow > range.e.r) {
          range.e.r = currentRow;
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });

        res.setHeader('Content-Disposition', `attachment; filename="Objednavka_Zaluzie_${order.order_no}.xls"`);
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.send(buf);

      } catch (err) {
        console.error('Horizontalni zaluzie export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });


  app.get("/api/admin/orders/:id/export-textilni-roletky", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const textilniItems = items.rows.filter((item: any) => 
          (item.product_title || '').toLowerCase().includes('textilní rolet') ||
          (item.product_title || '').toLowerCase().includes('textilni rolet')
        );

        if (textilniItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje žádné Textilní roletky" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '05_formular_textilni_roletky_Jazz.xlsx');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        // We use ExcelJS to preserve images and formatting!
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        const sheet = workbook.worksheets[0];

        const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
        
        sheet.getCell('D1').value = "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2";
        sheet.getCell('D3').value = addr;
        sheet.getCell('D5').value = "+420 774 060 193";
        sheet.getCell('M3').value = new Date(order.date).toLocaleDateString('cs-CZ');
        sheet.getCell('R3').value = order.order_no;

        let currentRow = 10; // Data starts at row 10 in ExcelJS (1-indexed)
        textilniItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          
          let typRoletky = "Textilní roletka";
          if ((item.product_title || '').toLowerCase().includes('jazz expert')) {
            typRoletky = "JAZZ Expert";
          } else if ((item.product_title || '').toLowerCase().includes('optima den a noc')) {
            typRoletky = "Optima Den a noc";
          } else if ((item.product_title || '').toLowerCase().includes('optima')) {
            typRoletky = "Optima";
          }
          
          const montazniProfil = params.montazni_profil === 'ano' ? 'ANO' : 'NE';
          let provedeni = '';
          if (params.montazni_profil_typ === 'samostatne') provedeni = '1 - samostatně';
          else if (params.montazni_profil_typ === 'kompletni') provedeni = '2 - kompletní';
          
          let barvaProfilu = '';
          if (params.barva_profilu_montaz === 'bila') barvaProfilu = 'A - bílá';
          else if (params.barva_profilu_montaz === 'hneda') barvaProfilu = 'B - hnědá';
          else if (params.barva_profilu_montaz === 'antracit') barvaProfilu = 'C - antracit';

          let odvijeni = '';
          if (params.odvijeni === 'ke_zdi') odvijeni = '1 - ke zdi';
          else if (params.odvijeni === 'ode_zdi') odvijeni = '2 - ode zdi';
          
          let uchyceni = '';
          if (params.uchyceni === 'stena_kridlo') uchyceni = '1 - stěna, křídlo';
          else if (params.uchyceni === 'strop') uchyceni = '2 - strop';
          
          const m2 = ((w * h) / 1000000).toFixed(2);
          const customerDetails = `${order.customer_name}, Tel: ${order.customer_phone || '-'}, E-mail: ${order.customer_email || '-'}`;
          
          let poznamka = `Plocha: ${m2} m2 | Zákazník: ${customerDetails}`;
          if (params.poznamka) poznamka += ` | Pozn. zákazníka: ${params.poznamka}`;

          // Copy formatting from previous row if needed, but since it's a template we just set values.
          sheet.getCell(`A${currentRow}`).value = index + 1 + '.';
          sheet.getCell(`C${currentRow}`).value = typRoletky;
          sheet.getCell(`E${currentRow}`).value = qty;
          sheet.getCell(`F${currentRow}`).value = w;
          sheet.getCell(`G${currentRow}`).value = h;
          sheet.getCell(`H${currentRow}`).value = params.ovladani_strana || '';
          sheet.getCell(`I${currentRow}`).value = 'Ř';
          // Skip elektronika (J) and délka (K)
          sheet.getCell(`L${currentRow}`).value = montazniProfil;
          sheet.getCell(`M${currentRow}`).value = provedeni;
          sheet.getCell(`N${currentRow}`).value = barvaProfilu;
          sheet.getCell(`O${currentRow}`).value = params.lamela_typ || '';
          sheet.getCell(`P${currentRow}`).value = params.barva_komponentu || '';
          sheet.getCell(`Q${currentRow}`).value = odvijeni;
          sheet.getCell(`R${currentRow}`).value = uchyceni;
          sheet.getCell(`S${currentRow}`).value = 'NE';
          sheet.getCell(`T${currentRow}`).value = poznamka;
          
          currentRow++;
        });

        res.setHeader('Content-Disposition', `attachment; filename="Objednavka_TextilniRoletky_${order.order_no}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await workbook.xlsx.write(res);
        res.end();

      } catch (err) {
        console.error('Textilni roletky export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });

  app.get("/api/admin/orders/:id/export-site-okenni", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const okenniItems = items.rows.filter((item: any) => 
          item.product_slug === 'site-proti-hmyzu-okenni' || (item.product_title || '').toLowerCase().includes('okenní sítě proti hmyzu')
        );

        if (okenniItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje Okenní sítě proti hmyzu" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '07_formular_pevne_site_proti_hmyzu_okenni.xlsx');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        const sheet = workbook.worksheets[0];

        const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
        sheet.getCell('D3').value = "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2";
        sheet.getCell('D4').value = addr;
        sheet.getCell('D5').value = "+420 774 060 193";
        sheet.getCell('H3').value = new Date(order.date).toLocaleDateString('cs-CZ');
        sheet.getCell('L3').value = order.order_no;
        sheet.getCell('L5').value = order.order_no;

        let currentRow = 9; // Data starts at row 9
        okenniItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          
          let typOkna = params.typ_okna || '';
          let profilLabel = '';
          let uchyceniText = '';
          if (typOkna === 'pvc') {
            profilLabel = 'ISSO OE 19x8';
            uchyceniText = 'Otočný držák';
          } else if (typOkna === 'euro') {
            profilLabel = 'OE 24x24';
            if (params.uchyceni_euro === 'pruzinovy_kolik') uchyceniText = 'Pružinový kolík';
            else uchyceniText = 'Obrtlík';
          } else if (typOkna === 'hlinik') {
            profilLabel = 'OE 32x11 LUX';
            uchyceniText = 'Z držák';
          }
          
          const barvaMap: Record<string, string> = {
            ral_9016: 'RAL 9016',
            ral_8019: 'RAL 8019',
            ral_7016: 'RAL 7016',
            ral_8003: 'RAL 8003',
            ral_9006: 'RAL 9006',
            db_703: 'DB-703',
            ral_7016_structure: 'RAL 7016 STRUCTURE',
            walnut: 'WALNUT',
            natural_oak: 'NATURAL OAK',
            gold_oak: 'GOLD OAK',
            amaretto_cherry: 'AMARETTO CHERRY',
            douglas: 'DOUGLAS',
            pine: 'PINE',
            dark_nut: 'DARK NUT',
            sapeli: 'SAPELI'
          };
          let barvaProfilu = barvaMap[params.barva_profilu] || params.barva_profilu || '';
          
          let sitovina = params.sitovina || '';
          if (sitovina === 'seda') sitovina = 'Š - šedá';
          else if (sitovina === 'cerna') sitovina = 'Č - černá';
          else if (sitovina === 'protipylova') sitovina = 'P - Protipylová černá';
          else if (sitovina === 'nano') sitovina = 'N - s nanovláknem černá';
          else if (sitovina === 'petscreen_cerna') sitovina = 'PSČ - pet screen černá';
          else if (sitovina === 'petscreen_seda') sitovina = 'PSŠ - pet screen šedá';
          else if (sitovina === 'transparentni') sitovina = 'Transparentní černá';

          let vyskaDrzaku = '';
          if (typOkna === 'pvc') vyskaDrzaku = (params.uchyceni_pvc || '0') + ' mm';
          else if (typOkna === 'hlinik') vyskaDrzaku = (params.uchyceni_hlinik || '0') + ' mm';

          let rohyVnejsi = '';
          let rohyVnitrni = '';
          if (typOkna === 'euro') {
            if (params.provedeni_rohu_euro === 'vnitrni') rohyVnitrni = 'X';
            else rohyVnejsi = 'X';
          }

          let okenniPricka = '';
          let prickaPocet = '';
          let prickaV1 = '';
          let prickaV2 = '';
          if (params.okenni_pricka === 'ano') {
            prickaPocet = params.pocet_pricek || '1';
            prickaV1 = params.vyska_pricky_1 || '';
            prickaV2 = prickaPocet === '2' ? (params.vyska_pricky_2 || '') : '';
          }
          
          sheet.getCell(`A${currentRow}`).value = index + 1 + '.';
          sheet.getCell(`C${currentRow}`).value = profilLabel;
          sheet.getCell(`E${currentRow}`).value = qty;
          sheet.getCell(`F${currentRow}`).value = w;
          sheet.getCell(`G${currentRow}`).value = h;
          sheet.getCell(`H${currentRow}`).value = barvaProfilu;
          sheet.getCell(`K${currentRow}`).value = sitovina;
          sheet.getCell(`L${currentRow}`).value = uchyceniText;
          sheet.getCell(`M${currentRow}`).value = vyskaDrzaku;
          sheet.getCell(`O${currentRow}`).value = rohyVnejsi;
          sheet.getCell(`P${currentRow}`).value = rohyVnitrni;
          sheet.getCell(`Q${currentRow}`).value = prickaPocet;
          sheet.getCell(`R${currentRow}`).value = prickaV1;
          sheet.getCell(`S${currentRow}`).value = prickaV2;
          
          currentRow++;
        });

        res.setHeader('Content-Disposition', `attachment; filename="Objednavka_SiteOkenni_${order.order_no}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await workbook.xlsx.write(res);
        res.end();

      } catch (err) {
        console.error('Okenni site export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });

  app.get("/api/admin/orders/:id/export-site-dverni", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const dverniItems = items.rows.filter((item: any) => 
          item.product_slug === 'dverni-site-proti-hmyzu' || (item.product_title || '').toLowerCase().includes('dveřní sítě proti hmyzu')
        );

        if (dverniItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje Dveřní sítě proti hmyzu" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '07_formular_pevne_site_proti_hmyzu_dverni.xlsx');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        const sheet = workbook.worksheets[0];

        const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
        sheet.getCell('D1').value = "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2";
        sheet.getCell('D3').value = addr;
        sheet.getCell('D5').value = "+420 774 060 193";
        sheet.getCell('H3').value = new Date(order.date).toLocaleDateString('cs-CZ');
        sheet.getCell('N1').value = order.order_no; 
        sheet.getCell('N3').value = order.order_no;
        sheet.getCell('N5').value = order.order_no;

        let currentRow = 9; // Data starts at row 9
        dverniItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          
          let typDveri = params.typ_dveri || '';
          let profilLabel = '';
          if (typDveri === 'bez_ramu_de50_lux') profilLabel = 'DE 50x20 LUX';
          else if (typDveri.includes('de50')) profilLabel = 'DE 50x20';
          else if (typDveri.includes('de40')) {
            if (typDveri.includes('ram_r3')) profilLabel = 'DE 40x20 Lux + R3';
            else if (typDveri.includes('ram_r4')) profilLabel = 'DE 40x20 Lux + R4';
            else profilLabel = 'DE 40x20 Lux';
          }
          
          const barvaMap: Record<string, string> = {
            zaklad_bila: 'Bílá RAL 9016',
            zaklad_hneda: 'Hnědá RAL 8019',
            zaklad_7016: 'RAL 7016',
            zaklad_8003: 'RAL 8003',
            zaklad_9006: 'RAL 9006',
            ral_struktura: 'RAL 7016 STR / DB 703',
            ral_nestandard: 'RAL (Nestandard)',
            imitace_dreva: 'Imitace dřeva',
            renolit_jedno: 'Renolit jednostr.',
            renolit_obou: 'Renolit oboustr.'
          };
          let barvaProfilu = barvaMap[params.barva_profilu] || params.barva_profilu || '';
          
          let sitovina = params.sitovina_lux || params.sitovina_de50 || params.sitovina || '';
          if (sitovina.includes('seda')) sitovina = 'Š - šedá';
          else if (sitovina.includes('cerna')) sitovina = 'Č - černá';
          else if (sitovina === 'protipylova') sitovina = 'P - Protipylová';
          else if (sitovina === 'nano') sitovina = 'N - s nanovláknem';
          else if (sitovina === 'transparentni') sitovina = 'Transparentní';

          let nytovaniText = params.nytovani_pantu === 'ano' ? `ANO (${params.strana_pantu_exterier})` : 'NE';
          let pocetStandard = params.panty_pocet_standard || '0';
          let pocetSamozav = params.panty_pocet_samozaviraci || '0';
          
          let okopova = params.okopova_pricka === 'ano' ? 'ANO' : 'NE';
          
          let madloMagnet = '';
          if (params.madlo_navic && params.madlo_navic !== '0') madloMagnet += `${params.madlo_navic}ks madlo navíc `;
          if (params.magnet === 'cely_profil') madloMagnet += `Magnet celá výška `;
          if (params.prulez_zvire === 'kocka') madloMagnet += `Průlez kočka `;
          if (params.prulez_zvire === 'pes') madloMagnet += `Průlez pes `;

          let profilKartacek = params.profil_s_kartackem === 'ano' ? 'X' : '';

          let dverniPricka = '';
          let dverniV1 = '';
          let dverniV2 = '';
          if (params.dverni_pricka_typ !== 'bez_pricky') {
            if (params.dverni_pricka_typ === '1ks_standard') {
              dverniPricka = '1';
              dverniV1 = '1/3';
            } else if (params.dverni_pricka_typ === '1ks_vlastni') {
              dverniPricka = '1';
              dverniV1 = params.pricka_poloha_1 || '';
            } else if (params.dverni_pricka_typ === '2ks_standard') {
              dverniPricka = '2';
              dverniV1 = '1/3';
              dverniV2 = '2/3';
            } else if (params.dverni_pricka_typ === '2ks_vlastni') {
              dverniPricka = '2';
              dverniV1 = params.pricka_poloha_1 || '';
              dverniV2 = params.pricka_poloha_2 || '';
            }
          }
          
          sheet.getCell(`A${currentRow}`).value = index + 1 + '.';
          sheet.getCell(`C${currentRow}`).value = profilLabel;
          sheet.getCell(`E${currentRow}`).value = qty;
          sheet.getCell(`F${currentRow}`).value = w;
          sheet.getCell(`G${currentRow}`).value = h;
          sheet.getCell(`H${currentRow}`).value = barvaProfilu;
          sheet.getCell(`I${currentRow}`).value = sitovina;
          sheet.getCell(`J${currentRow}`).value = nytovaniText;
          sheet.getCell(`K${currentRow}`).value = pocetStandard;
          sheet.getCell(`L${currentRow}`).value = pocetSamozav;
          sheet.getCell(`M${currentRow}`).value = okopova;
          sheet.getCell(`N${currentRow}`).value = madloMagnet;
          sheet.getCell(`O${currentRow}`).value = profilKartacek;
          sheet.getCell(`P${currentRow}`).value = dverniPricka;
          sheet.getCell(`Q${currentRow}`).value = dverniV1;
          sheet.getCell(`R${currentRow}`).value = dverniV2;
          
          currentRow++;
        });

        res.setHeader('Content-Disposition', `attachment; filename="Objednavka_SiteDverni_${order.order_no}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await workbook.xlsx.write(res);
        res.end();

      } catch (err) {
        console.error('Dverni site export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const id = Number(req.params.id);
        const status =
          req.body?.status != null ? String(req.body.status).trim() : "";
        if (!Number.isFinite(id) || id < 1 || !status) {
          res.status(400).json({ error: "Neplatný požadavek" });
          return;
        }

        const oldOrderRes = await client.query('SELECT status FROM "Order" WHERE id = $1', [id]);
        if (!oldOrderRes.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const oldStatus = oldOrderRes.rows[0].status;

        if (oldStatus !== status) {
          await client.query(
            `INSERT INTO "AuditLog" (entity_type, entity_id, action, old_value, new_value)
             VALUES ($1, $2, $3, $4, $5)`,
            ['order', id, 'status_change', oldStatus, status]
          );
        }

        const r = await client.query(
          'UPDATE "Order" SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );
        
        const items = await client.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );
        
        await client.query("COMMIT");
        res.json({ ...(r.rows[0] as Record<string, unknown>), items: items.rows });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Patch order error:", err);
        res.status(500).json({ error: "Server error" });
      } finally {
        client.release();
      }
    });
  });

  app.get("/api/admin/orders/:id/audit", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatný požadavek" });
          return;
        }
        const result = await db.query(
          'SELECT * FROM "AuditLog" WHERE entity_type = $1 AND entity_id = $2 ORDER BY timestamp DESC',
          ['order', id]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("Audit log fetch error:", err);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.get("/api/admin/products/:id/brackets", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const r = await db.query(
          `SELECT * FROM "ProductPriceBracket" WHERE product_id = $1
           ORDER BY sort_order ASC, width_mm_max ASC, height_mm_max ASC`,
          [id]
        );
        res.json(r.rows);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/products/:id/brackets", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      const id = req.params.id;
      const rows = req.body?.rows;
      if (!id || !Array.isArray(rows)) {
        res.status(400).json({ error: "Neplatná data (očekávám pole rows)." });
        return;
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query('DELETE FROM "ProductPriceBracket" WHERE product_id = $1', [id]);
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Record<string, unknown>;
          const wMax = Number(row.width_mm_max ?? row.widthMmMax);
          const hMax = Number(row.height_mm_max ?? row.heightMmMax);
          const price = Number(row.base_price_czk ?? row.basePriceCzk);
          const sort = Number(row.sort_order ?? row.sortOrder ?? i);
          if (!Number.isFinite(wMax) || !Number.isFinite(hMax) || !Number.isFinite(price)) {
            continue;
          }
          await client.query(
            `INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, Math.round(wMax), Math.round(hMax), Math.round(price), Math.round(sort)]
          );
        }
        await client.query("COMMIT");
        const r = await client.query(
          `SELECT * FROM "ProductPriceBracket" WHERE product_id = $1
           ORDER BY sort_order ASC, width_mm_max ASC`,
          [id]
        );
        res.json(r.rows);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(e);
        res.status(500).json({ error: "Uložení mřížky selhalo." });
      } finally {
        client.release();
      }
    });
  });

  app.get("/api/admin/products/:id/tiers", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const r = await db.query(
          `SELECT * FROM "ProductHeightPriceTier" WHERE product_id = $1
           ORDER BY sort_order ASC, height_mm_max ASC`,
          [id]
        );
        res.json(r.rows);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/products/:id/tiers", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      const id = req.params.id;
      const rows = req.body?.rows;
      if (!id || !Array.isArray(rows)) {
        res.status(400).json({ error: "Neplatná data (očekávám pole rows)." });
        return;
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query('DELETE FROM "ProductHeightPriceTier" WHERE product_id = $1', [id]);
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Record<string, unknown>;
          const hMin = Number(row.height_mm_min ?? row.heightMmMin);
          const hMax = Number(row.height_mm_max ?? row.heightMmMax);
          const price = Number(row.price_per_m2_czk ?? row.pricePerM2Czk);
          const sort = Number(row.sort_order ?? row.sortOrder ?? i);
          if (!Number.isFinite(hMin) || !Number.isFinite(hMax) || !Number.isFinite(price)) {
            continue;
          }
          await client.query(
            `INSERT INTO "ProductHeightPriceTier" (product_id, height_mm_min, height_mm_max, price_per_m2_czk, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, Math.round(hMin), Math.round(hMax), Math.round(price), Math.round(sort)]
          );
        }
        await client.query("COMMIT");
        const r = await client.query(
          `SELECT * FROM "ProductHeightPriceTier" WHERE product_id = $1
           ORDER BY sort_order ASC, height_mm_max ASC`,
          [id]
        );
        res.json(r.rows);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(e);
        res.status(500).json({ error: "Uložení ceníku selhalo." });
      } finally {
        client.release();
      }
    });
  });

  app.get("/api/admin/customers", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query(
          'SELECT * FROM "Customer" ORDER BY registered DESC'
        );
        res.json(result.rows);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.post("/api/admin/db-sync", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        await db.query(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`).catch(()=>{});
        await db.query(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`).catch(()=>{});
        for (const sql of [
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS price_mode VARCHAR(32) DEFAULT 'matrix_cell'`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_group INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS validation_profile VARCHAR(32)`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_groups_config JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS dimension_constraints JSONB DEFAULT NULL`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS is_action BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE`,
        ]) {
          await db.query(sql).catch(() => {});
        }
        res.json({ success: true, message: "Databázové tabulky byly úspěšně aktualizovány (žádná data nebyla smazána)." });
      } catch (err) {
        console.error("DB Sync error:", err);
        res.status(500).json({ error: "Chyba při aktualizaci databáze" });
      }
    });
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const {
          title,
          category,
          price,
          oldPrice,
          badge,
          img,
          desc,
        } = req.body;
        const supplier_markup_percent = Number(req.body.supplier_markup_percent) || 0;
        const commission_percent = Number(req.body.commission_percent) || 0;
        const dim = parseDimBody(req.body as Record<string, unknown>);
        const bodyRec = req.body as Record<string, unknown>;
        const price_mode_ins =
          bodyRec.price_mode != null && String(bodyRec.price_mode).trim() !== ""
            ? String(bodyRec.price_mode).trim()
            : "matrix_cell";
        const fabric_group_ins = optIntCol(bodyRec, "fabric_group");
        const validation_profile_ins = optStrCol(bodyRec, "validation_profile");
        const hidden_ins = Boolean(bodyRec.hidden);
        const gallery_ins = JSON.stringify(Array.isArray(bodyRec.gallery) ? bodyRec.gallery : []);
        const colors_ins = JSON.stringify(Array.isArray(bodyRec.colors) ? bodyRec.colors : []);
        const extras_ins = JSON.stringify(Array.isArray(bodyRec.extras) ? bodyRec.extras : []);
        const parameters_ins = JSON.stringify(Array.isArray(bodyRec.parameters) ? bodyRec.parameters : []);
        const fabric_groups_config_ins = JSON.stringify(Array.isArray(bodyRec.fabric_groups_config) ? bodyRec.fabric_groups_config : null);
        const baseSlug = generateSlug(title);
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await db.query('SELECT id FROM "Product" WHERE slug = $1', [slug]);
          if (existing.rows.length === 0) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        const in_stock_ins = Boolean(bodyRec.in_stock);
        const is_action_ins = Boolean(bodyRec.is_action);

        const result = await db.query(
          `INSERT INTO "Product" (title, category, price, "oldPrice", badge, img, "desc", supplier_markup_percent, commission_percent,
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, price_mode, fabric_group, validation_profile, hidden, gallery, colors, fabric_groups_config, extras, parameters, slug, in_stock, is_action)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING *`,
          [
            title,
            category,
            price,
            oldPrice ?? null,
            badge,
            img,
            desc,
            supplier_markup_percent,
            commission_percent,
            dim?.width_mm_min ?? null,
            dim?.width_mm_max ?? null,
            dim?.height_mm_min ?? null,
            dim?.height_mm_max ?? null,
            dim?.max_area_m2 ?? null,
            price_mode_ins,
            fabric_group_ins,
            validation_profile_ins,
            hidden_ins,
            gallery_ins,
            colors_ins,
            fabric_groups_config_ins,
            extras_ins,
            parameters_ins,
            slug,
            in_stock_ins,
            is_action_ins,
          ]
        );
        res.json(mapProductRow(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { id } = req.params;
        const {
          title,
          category,
          price,
          oldPrice,
          badge,
          img,
          desc,
        } = req.body;
        const supplier_markup_percent = Number(req.body.supplier_markup_percent) || 0;
        const commission_percent = Number(req.body.commission_percent) || 0;
        const dim = parseDimBody(req.body as Record<string, unknown>);
        const bodyRec = req.body as Record<string, unknown>;
        const price_mode_upd =
          bodyRec.price_mode != null && String(bodyRec.price_mode).trim() !== ""
            ? String(bodyRec.price_mode).trim()
            : "matrix_cell";
        const fabric_group_upd = optIntCol(bodyRec, "fabric_group");
        const validation_profile_upd = optStrCol(bodyRec, "validation_profile");
        const hidden_upd = Boolean(bodyRec.hidden);
        const gallery_upd = JSON.stringify(Array.isArray(bodyRec.gallery) ? bodyRec.gallery : []);
        const colors_upd = JSON.stringify(Array.isArray(bodyRec.colors) ? bodyRec.colors : []);
        const extras_upd = JSON.stringify(Array.isArray(bodyRec.extras) ? bodyRec.extras : []);
        const parameters_upd = JSON.stringify(Array.isArray(bodyRec.parameters) ? bodyRec.parameters : []);
        const fabric_groups_config_upd = JSON.stringify(Array.isArray(bodyRec.fabric_groups_config) ? bodyRec.fabric_groups_config : null);
        const baseSlug = generateSlug(title);
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await db.query('SELECT id FROM "Product" WHERE slug = $1 AND id != $2', [slug, id]);
          if (existing.rows.length === 0) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        const in_stock_upd = Boolean(bodyRec.in_stock);
        const is_action_upd = Boolean(bodyRec.is_action);

        const result = await db.query(
          `UPDATE "Product" SET title=$1, category=$2, price=$3, "oldPrice"=$4, badge=$5, img=$6, "desc"=$7,
            supplier_markup_percent=$9, commission_percent=$10,
            width_mm_min=$11, width_mm_max=$12, height_mm_min=$13, height_mm_max=$14, max_area_m2=$15,
            price_mode=$16, fabric_group=$17, validation_profile=$18, hidden=$19, gallery=$20, colors=$21, fabric_groups_config=$22, extras=$23, parameters=$24, slug=$25, in_stock=$26, is_action=$27
           WHERE id=$8 RETURNING *`,
          [
            title,
            category,
            price,
            oldPrice ?? null,
            badge,
            img,
            desc,
            id,
            supplier_markup_percent,
            commission_percent,
            dim?.width_mm_min ?? null,
            dim?.width_mm_max ?? null,
            dim?.height_mm_min ?? null,
            dim?.height_mm_max ?? null,
            dim?.max_area_m2 ?? null,
            price_mode_upd,
            fabric_group_upd,
            validation_profile_upd,
            hidden_upd,
            gallery_upd,
            colors_upd,
            fabric_groups_config_upd,
            extras_upd,
            parameters_upd,
            slug,
            in_stock_upd,
            is_action_upd,
          ]
        );
        if (!result.rows[0]) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.json(mapProductRow(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = req.params.id;
        await db.query('DELETE FROM "Product" WHERE id=$1', [id]);
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  
  app.post("/api/admin/import-isoline", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const rawMatrix = `
300 263 283 304 323 359 377 395 422 441 456 476 525 537 558 578 593 616 656 680 695
400 277 297 316 335 381 397 422 448 469 487 518 558 582 599 621 641 660 713 738 759
500 284 305 328 351 393 416 441 473 494 514 536 591 616 636 656 680 702 756 779 802
600 301 323 341 369 416 437 464 499 528 550 575 634 658 660 704 732 753 814 859 872
700 309 333 361 390 441 467 490 534 557 576 611 677 702 724 752 779 805 866 912 946
800 324 359 376 407 456 486 512 557 585 605 637 706 736 763 794 819 844 915 962 1013
900 333 365 393 422 476 509 537 585 619 646 678 747 778 810 839 870 897 970 1003 1083
1000 346 377 411 445 499 531 564 619 646 680 713 789 821 855 886 915 949 1025 1065 1116
1100 357 390 426 458 518 554 585 641 676 710 744 822 858 892 925 959 994 1071 1120 1171
1200 372 407 442 476 539 578 612 678 708 744 809 863 900 939 975 1009 1045 1127 1171 1208
1300 381 422 463 495 561 596 636 697 737 777 816 901 942 981 1021 1054 1096 1182 1228 1322
1400 392 432 472 512 578 621 659 720 763 804 844 939 977 1018 1059 1096 1137 1228 1283 1390
1500 404 447 487 531 599 641 683 749 797 838 883 977 1021 1064 1102 1157 1190 1282 1329 1446
1600 416 463 509 553 621 662 710 778 826 870 918 1016 1063 1106 1152 1194 1239 1321 1397 1487
1700 426 472 519 568 640 683 733 809 855 900 949 1050 1096 1140 1190 1236 1282 1386 1449 1538
1800 441 486 536 584 660 718 759 836 885 935 983 1090 1138 1186 1233 1287 1333 1437 1508 1592
1900 448 499 553 599 678 730 779 859 909 962 1012 1122 1177 1223 1256 1326 1376 1485 1565 1660
2000 463 512 566 621 700 753 804 884 946 998 1045 1162 1219 1268 1316 1374 1427 1537 1623 1729
2100 473 530 581 637 722 777 832 912 977 1028 1075 1205 1256 1310 1367 1422 1484 1594 1660 1796
2200 483 537 597 652 737 795 852 946 1003 1058 1118 1238 1293 1350 1417 1462 1514 1639 1733 1862
2300 494 552 616 666 753 812 872 979 1027 1088 1157 1273 1331 1392 1464 1507 1546 1684 1811 1929
2400 505 559 633 680 768 833 896 1012 1051 1118 1197 1305 1370 1431 1514 1549 1578 1729 1882 1995
`;

        const widths = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200];
        
        const params = [
          {
            id: "typ_okna",
            name: "Materiál okna",
            type: "color_array",
            options: [
              { label: "Plastové okno", value: "pvc", img: "/images/icon_okno_pvc.png" },
              { label: "Dřevěné okno", value: "drevo", img: "/images/icon_okno_drevo.png" },
              { label: "Hliníkové okno", value: "hlinik", img: "/images/icon_okno_hlinik.png" }
            ]
          },
          {
            id: "typ_profilu",
            name: "Typ žaluzie",
            type: "color_array",
            options: [
              { label: "Isoline (Rovný profil)", value: "isoline", img: "/images/icon_isoline_rovny.png", hint: "Klasický hranatý profil (42,5 x 25,6 x 25 mm). Horní i dolní profil z válcovaného pozinkovaného plechu." },
              { label: "Isoline PRIM (Obloukový profil)", value: "prim", img: "/images/icon_isoline_prim.png", qapiRecommended: true, hint: "Moderní zaoblený design profilu (47,3 x 24 x 24,7 mm). Horní i dolní profil z válcovaného pozinkovaného plechu." }
            ]
          },
          {
            id: "lamela_typ",
            name: "Barva lamely (tloušťka 0.21 mm)",
            hint: "Vyberte si požadovaný barevný odstín lamely. Hex kódy jsou pouze orientační náhledy barev.",
            type: "color_array",
            options: [
              { label: "BASIC 101", value: "101", hex: "#FFFFFF", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 102", value: "102", hex: "#FAF5ED", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 105", value: "105", hex: "#EBE3D5", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 106", value: "106", hex: "#E3DAC9", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 107", value: "107", hex: "#E8DEC6", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 109", value: "109", hex: "#D6C6A1", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 110", value: "110", hex: "#C4AC82", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 111", value: "111", hex: "#BA9F72", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 113", value: "113", hex: "#E9C2A6", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 115", value: "115", hex: "#F2D8B3", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 117", value: "117", hex: "#F5DEB3", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 119", value: "119", hex: "#F7E1D7", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 120", value: "120", hex: "#D9CDBF", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 121", value: "121", hex: "#D4C2B0", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 123", value: "123", hex: "#C2A892", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 124", value: "124", hex: "#B3957A", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 125", value: "125", hex: "#A48261", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 130", value: "130", hex: "#946E4A", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 131", value: "131", hex: "#7E5C3B", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 132", value: "132", hex: "#68482A", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 135", value: "135", hex: "#B8B5B0", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 136", value: "136", hex: "#A39F98", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 137", value: "137", hex: "#8A8680", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 138", value: "138", hex: "#706C67", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 139", value: "139", hex: "#5C5854", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 146", value: "146", hex: "#42403E", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 150", value: "150", hex: "#A9D08E", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 153", value: "153", hex: "#9DC3E6", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 154", value: "154", hex: "#F4B084", priceVariant: 74, priceType: "per_m2" },
              { label: "BASIC 155", value: "155", hex: "#FFC000", priceVariant: 74, priceType: "per_m2" }
            ]
          },
          {
            id: "barva_profilu",
            name: "Barva profilu",
            hint: "U Isoline profilu je navíc možnost lakování do speciálních RAL barev.",
            type: "select",
            options: [
              { label: "Základní: RAL 9010 - bílá", value: "zakl_9010", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 8017 - tm. hnědá", value: "zakl_8017", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 9006 - stříbrná", value: "zakl_9006", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 8004 - hnědá", value: "zakl_8004", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 8003 - hnědá", value: "zakl_8003", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 1013 - slonová kost", value: "zakl_1013", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: RAL 7016 - antracit", value: "zakl_7016", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: zlatá (odpovídá lamele č. 714)", value: "zakl_gold1", priceVariant: 0, priceType: "fixed" },
              { label: "Základní: bronzová (odpovídá lamele č. 700)", value: "zakl_gold2", priceVariant: 0, priceType: "fixed" },
              { label: "Imitace dřeva: 21 - zlatý dub", value: "ren_21", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 22 - třešeň amaretto", value: "ren_22", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 23 - borovice horská", value: "ren_23", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 24 - tmavý dub", value: "ren_24", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 25 - vlašský ořech", value: "ren_25", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 26 - sapeli", value: "ren_26", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 27 - přírodní dub", value: "ren_27", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 28 - tmavý ořech", value: "ren_28", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 29 - douglas", value: "ren_29", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 30 - oregon 4", value: "ren_30", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 31 - rustikální dub", value: "ren_31", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 32 - bahenní dub", value: "ren_32", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 33 - antracit", value: "ren_33", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 35 - přírodní ořech", value: "ren_35", priceVariant: 131, priceType: "per_bm" },
              { label: "Imitace dřeva: 36 - winchester", value: "ren_36", priceVariant: 131, priceType: "per_bm" },
              { label: "RAL 8023 - hnědá (pouze Isoline)", value: "ral_8023", priceVariant: 147, priceType: "per_bm", excludedModels: ["prim"] },
              { label: "Jiná vlastní RAL (pouze Isoline)", value: "al_ral", priceVariant: 147, priceType: "per_bm", excludedModels: ["prim"] }
            ]
          },
          {
            id: "vlastni_ral_kod",
            name: "Zadejte kód RAL barvy",
            type: "text",
            condition: {
              dependsOnParamId: "barva_profilu",
              allowedValues: ["al_ral"]
            }
          },
          {
            id: "ovladani_strana",
            name: "Ovládání",
            hint: "Na které straně žaluzie chcete mít ovládací řetízek.",
            type: "select",
            options: [
              { label: "Vpravo", value: "P" },
              { label: "Vlevo", value: "L" }
            ]
          },
          {
            id: "celostin",
            name: "Domykatelné provedení (Celostín)",
            hint: "U domykatelné žaluzie je po dovření lamel minimalizován prostup světla. Otvory pro strunu jsou schované excentricky v zadní části lamel.",
            img: "/images/celostin.jpg",
            type: "select",
            options: [
              { label: "Ne", value: "ne", priceVariant: 0, priceType: "fixed" },
              { label: "Ano", value: "ano", priceVariant: 33, priceType: "per_m2" }
            ]
          },
          {
            id: "barva_sladeni",
            name: "Barevné sladění",
            hint: "Základní sladění je v bílé barvě. Individuální sladění umožňuje komponenty sladit do barvy lamely.",
            type: "select",
            options: [
              { label: "Ne (Základní sladění - komponenty v bílé barvě)", value: "ne", priceVariant: 0, priceType: "fixed" },
              { label: "Ano (Celkové individuální sladění)", value: "ano", priceVariant: 33, priceType: "per_m2" }
            ]
          },
          {
            id: "podlozka",
            name: "Distanční podložka",
            hint: "Používá se, pokud je zasklívací lišta vašeho okna příliš mělká (pod 16 mm). Vkládá se pod horní profil, aby žaluzie nenarážela do skla.",
            img: "/images/podlozka.jpg",
            type: "select",
            options: [
              { label: "Bez podložky", value: "0", priceVariant: 0, priceType: "fixed" },
              { label: "1 pár podložek (< 14 mm zaskl. lišta)", value: "1", priceVariant: 12, priceType: "fixed" },
              { label: "2 páry podložek (< 10 mm zaskl. lišta)", value: "2", priceVariant: 24, priceType: "fixed" },
              { label: "3 páry podložek", value: "3", priceVariant: 36, priceType: "fixed" },
              { label: "4 páry podložek", value: "4", priceVariant: 48, priceType: "fixed" }
            ]
          },
          {
            id: "doplnek_prim",
            name: "Doplněk ovládání (Pouze PRIM)",
            type: "select",
            condition: {
              dependsOnParamId: "typ_profilu",
              allowedValues: ["prim"]
            },
            options: [
              { label: "Brzda", value: "brzda", priceVariant: 34, priceType: "fixed" },
              { label: "Bez doplňku", value: "ne", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "delka_ovladani",
            name: "Délka ovládání (řetízku)",
            type: "select",
            options: [
              { label: "Standardní (cca 2/3 výšky žaluzie)", value: "standard" },
              { label: "Jiná délka (uveďte v poznámce v košíku)", value: "jina" },
              { label: "Nekonečný řetízek 50 cm", value: "50", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 75 cm", value: "75", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 100 cm", value: "100", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 125 cm", value: "125", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 150 cm", value: "150", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 175 cm", value: "175", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 200 cm", value: "200", excludedModels: ["isoline"] },
              { label: "Nekonečný řetízek 225 cm", value: "225", excludedModels: ["isoline"] }
            ]
          }
        ];


        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Horizontální žaluzie'`);
        let category = 'Horizontální žaluzie';
        if (catRes.rows.length === 0) {
            const catRes2 = await db.query(`SELECT name FROM "Category" WHERE name ILIKE '%žaluzie%' LIMIT 1`);
            if (catRes2.rows.length > 0) category = catRes2.rows[0].name;
            else {
               await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Horizontální žaluzie', 1, '')`);
            }
        }

        const pRes = await db.query(`
          INSERT INTO "Product" (
            title, slug, category, price, "oldPrice", badge, img, "desc", 
            supplier_markup_percent, commission_percent, 
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, 
            parameters, gallery, colors, extras, fabric_groups_config, price_mode, validation_profile, hidden
          ) VALUES (
            $1, $2, $3, $4, null, $5, $6, $7,
            4.9, 0,
            200, 2200, 300, 2400, 2.4,
            $8, '[]', '[]', '[]', '[]', 'matrix_cell', 'isoline_merged', false
          )
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            "desc" = EXCLUDED."desc",
            parameters = EXCLUDED.parameters,
            max_area_m2 = 2.4,
            height_mm_max = 2400,
            width_mm_min = 200,
            price_mode = 'matrix_cell',
            validation_profile = 'isoline_merged'
          RETURNING id
        `, [
          "Horizontální žaluzie",
          "horizontalni-zaluzie",
          category,
          263,
          "",
          "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600&auto=format&fit=crop",
          `<h3>Základní ceníková sestava</h3><p>Tento produkt kombinuje dva typy horizontálních žaluzií - s rovným profilem (Isoline) i luxusním obloukovým (PRIM). Obě varianty jsou interiérové, ovládané řetízkem a s fixací silonovou strunou.</p><ul><li><strong>Isoline:</strong> Rovný profil 42,5 x 25,6 mm, max. plocha 2.4 m²</li><li><strong>Isoline PRIM:</strong> Obloukový profil 47,3 x 24 mm, max. plocha 2.4 m²</li></ul><br /><h3>Technické detaily a provedení</h3><p><strong>Domykatelné provedení (Celostín):</strong> Žaluzie, u které je po dovření lamel minimalizován prostup světla. Otvory pro textilní pásku a fixační strunu jsou umístěny excentricky (nelze použít s 16 mm lamelou).</p><p><strong>Vyměření:</strong> Výrobní šířka a výška je vždy rozměr mezi zasklívacími lištami. Při mělké zasklívací liště je nutné použít distanční podložky pod koncovky.</p><p><em>DŮLEŽITÉ UPOZORNĚNÍ: E-shop vás automaticky upozorní, pokud vaše rozměry přesáhnou maximální povolenou plochu 2.4 m². Větší žaluzie z důvodu záruky nevyrábíme.</em></p>`,
          JSON.stringify(params)
        ]);

        const productId = pRes.rows[0].id;

        await db.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);

        const lines = rawMatrix.trim().split('\n');
        let brackets = [];
        for (const line of lines) {
          const parts = line.trim().split(/\s+/).map(Number);
          if (parts.length < 21) continue;
          
          const height = parts[0];
          for (let i = 0; i < widths.length; i++) {
            const width = widths[i];
            const price = parts[i + 1];
            if (price) {
              brackets.push(`(${productId}, ${width}, ${height}, ${price})`);
            }
          }
        }

        if (brackets.length > 0) {
          await db.query(`
            INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk)
            VALUES ${brackets.join(', ')}
          `);
        }

        res.json({ success: true, message: `Imported product ID: ${productId} with ${brackets.length} brackets.` });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  app.post("/api/admin/import-optima", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const rawMatrix = `
500 1050 1121 1192 1262 1334 1406 1477 1547 1619 1689 1760 1833 1902 1973 2045 2116
600 1096 1171 1245 1319 1394 1469 1543 1618 1692 1765 1841 1917 1991 2065 2140 2213
700 1141 1220 1298 1375 1454 1532 1610 1688 1765 1844 1923 2000 2078 2156 2234 2313
800 1186 1268 1349 1431 1514 1596 1676 1758 1840 1922 2003 2085 2167 2249 2330 2412
900 1233 1318 1403 1489 1574 1658 1743 1828 1913 1999 2084 2170 2255 2340 2424 2510
1000 1280 1368 1456 1545 1633 1724 1812 1900 1989 2077 2165 2254 2342 2432 2520 2608
1100 1323 1417 1508 1601 1693 1785 1877 1969 2061 2154 2246 2339 2432 2523 2616 2707
1200 1370 1465 1561 1657 1754 1848 1945 2041 2136 2232 2328 2422 2519 2614 2710 2805
1300 1417 1516 1614 1714 1814 1911 2012 2111 2209 2310 2409 2507 2607 2706 2805 2906
1400 1462 1565 1667 1769 1872 1975 2078 2181 2285 2386 2490 2592 2695 2797 2899 3002
1500 1507 1613 1720 1826 1933 2040 2146 2252 2357 2464 2570 2677 2783 2889 2996 3101
1600 1554 1664 1774 1883 1992 2102 2211 2321 2433 2542 2652 2761 2870 2980 3091 3202
1700 1600 1713 1824 1939 2052 2165 2281 2393 2505 2619 2733 2846 2959 3073 3185 3299
1800 1645 1761 1879 1995 2113 2229 2346 2463 2579 2698 2814 2930 3046 3163 3280 3398
1900 1690 1812 1932 2051 2172 2292 2413 2533 2653 2774 2894 3015 3134 3254 3375 3495
2000 1736 1862 1985 2107 2232 2356 2479 2603 2728 2852 2975 3099 3223 3346 3471 3595
2100 1783 1909 2037 2164 2292 2419 2547 2675 2802 2928 3056 3184 3311 3438 3567 3694
2200 1827 1960 2091 2221 2352 2483 2614 2743 2875 3006 3137 3268 3399 3530 3661 3791
2300 1874 2008 2143 2276 2412 2547 2680 2816 2950 3083 3217 3354 3488 3622 3755 3891
`;

        const widths = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
        
        const params = [
          {
            id: "barva_komponentu",
            name: "Barva komponentů (box, lišty, řetízek)",
            hint: "Sladění barvy profilu a řetízku s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "ovladani_strana",
            name: "Strana ovládání",
            type: "select",
            options: [
              { label: "Pravá", value: "P" },
              { label: "Levá", value: "L" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "Standardní", value: "standard", priceVariant: 0, priceType: "fixed" },
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          }
        ];

        const fabricGroups = [
          { name: "Skupina 1 (Adriana, Melisa)", surcharge_percent: 0, max_width_mm: 2000, max_height_mm: 2300, 
            colors: [
              { name: "Adriana Bílá", hex: "#f0f0f0" },
              { name: "Adriana Béžová", hex: "#f5f5dc" },
              { name: "Melisa Šedá", hex: "#d3d3d3" },
              { name: "Melisa Antracit", hex: "#383e42" }
            ] 
          },
          { name: "Skupina 2 (Melisa BO)", surcharge_percent: 10, max_width_mm: 2000, max_height_mm: 1200, 
            colors: [
              { name: "Melisa BO Bílá", hex: "#fdfdfd" },
              { name: "Melisa BO Béžová", hex: "#e8d3a2" },
              { name: "Melisa BO Hnědá", hex: "#8b5a2b" }
            ] 
          },
          { name: "Skupina 3 (Stella BO, Melisa BO B/S)", surcharge_percent: 15, max_width_mm: 2000, max_height_mm: 1300, 
            colors: [
              { name: "Stella BO Bílá", hex: "#ffffff" },
              { name: "Stella BO Šedá", hex: "#a9a9a9" },
              { name: "Melisa BO B/S", hex: "#dfc19c" }
            ] 
          },
          { name: "Skupina 4 (Tropic)", surcharge_percent: 20, max_width_mm: 1950, max_height_mm: 1700, 
            colors: [
              { name: "Tropic Zelená", hex: "#8fbc8f" },
              { name: "Tropic Žlutá", hex: "#f0e68c" },
              { name: "Tropic Modrá", hex: "#add8e6" }
            ] 
          },
          { name: "Skupina 5 (Screen nehořlavá)", surcharge_percent: 45, max_width_mm: 1950, max_height_mm: 1200, 
            colors: [
              { name: "Screen Bílá", hex: "#eae0c8" },
              { name: "Screen Šedá", hex: "#c0c0c0" },
              { name: "Screen Černá", hex: "#222222" }
            ] 
          },
        ];

        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Textilní roletky'`);
        let category = 'Textilní roletky';
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Textilní roletky', 1, '')`);
        }

        const pRes = await db.query(`
          INSERT INTO "Product" (
            title, slug, category, price, "oldPrice", badge, img, "desc", 
            supplier_markup_percent, commission_percent, 
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, 
            parameters, gallery, colors, extras, fabric_groups_config, price_mode, hidden
          ) VALUES (
            $1, $2, $3, $4, null, $5, $6, $7,
            4.9, 0,
            330, 2000, 500, 2300, null,
            $8, '[]', '[]', '[]', $9, 'matrix_cell', false
          )
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            "desc" = EXCLUDED."desc",
            parameters = EXCLUDED.parameters,
            fabric_groups_config = EXCLUDED.fabric_groups_config,
            height_mm_max = 2300,
            width_mm_max = 2000,
            price_mode = 'matrix_cell'
          RETURNING id
        `, [
          "Textilní roletka Optima",
          "textilni-roletka-optima",
          category,
          1050,
          "",
          "/images/optima_cover.png",
          `<h3>Základní ceníková sestava</h3><ul><li><strong>Látka:</strong> 100% polyester, vzor dle výběru</li><li><strong>Box:</strong> hliníkový profil (bílá, hnědá, stříbrná)</li><li><strong>Hřídel:</strong> hliníkový profil, průměr 25 mm</li><li><strong>Vodící lišta:</strong> hliníková</li><li><strong>Závaží látky:</strong> hliníkové</li><li><strong>Ovládání:</strong> řetízkem</li><li><strong>Uchycení:</strong> křídlo okna</li></ul><br /><h3>Technické detaily a montáž</h3><p>Roletka je v provedení s krytem návinu látky a s vodícími lištami po stranách. Konstrukce roletky umožňuje různé nastavení výšky stažení látky.</p><p><strong>Neinvazivní montáž:</strong> Pomocí oboustranné lepící pásky na křídlo (nezmenšuje světlost). Vhodné pro pergoly.</p><p><em>Upozornění: Z důvodu výrobních rozměrů nelze vyrobit roletku s šířkou a výškou současně nad 1950 mm. Maximální rozměry jsou také limitovány zvolenou látkou!</em></p>`,
          JSON.stringify(params),
          JSON.stringify(fabricGroups)
        ]);

        const productId = pRes.rows[0].id;

        await db.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);

        const lines = rawMatrix.trim().split('\n');
        let brackets = [];
        for (const line of lines) {
          const parts = line.trim().split(/\s+/).map(Number);
          if (parts.length < 17) continue;
          
          const height = parts[0];
          for (let i = 0; i < widths.length; i++) {
            const width = widths[i];
            const price = parts[i + 1];
            if (price) {
              brackets.push(`(${productId}, ${width}, ${height}, ${price})`);
            }
          }
        }

        if (brackets.length > 0) {
          await db.query(`
            INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk)
            VALUES ${brackets.join(', ')}
          `);
        }

        res.json({ success: true, message: `Imported product ID: ${productId} with ${brackets.length} brackets.` });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  app.post("/api/admin/import-optima-den-noc", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const rawMatrix = `
500 1370 1461 1554 1646 1736 1828 1922 2013 2104 2198 2288
600 1422 1518 1613 1709 1806 1901 1996 2093 2187 2285 2380
700 1476 1576 1675 1776 1874 1974 2074 2174 2271 2373 2471
800 1528 1632 1735 1840 1944 2047 2150 2254 2357 2461 2565
900 1582 1689 1796 1904 2013 2119 2227 2333 2441 2549 2656
1000 1635 1746 1857 1969 2080 2191 2303 2414 2525 2637 2748
1100 1688 1804 1919 2033 2149 2264 2380 2495 2610 2726 2841
1200 1740 1862 1978 2098 2217 2338 2455 2574 2695 2814 2934
1300 1794 1918 2041 2163 2287 2410 2532 2655 2778 2900 3024
1400 1847 1974 2101 2229 2355 2481 2609 2736 2863 2990 3118
1500 1901 2031 2162 2293 2423 2554 2685 2817 2947 3078 3209
1600 1954 2088 2223 2357 2491 2628 2763 2896 3031 3166 3301
1700 2007 2144 2283 2422 2560 2702 2840 2977 3114 3254 3394
1800 2060 2201 2342 2487 2627 2775 2916 3057 3197 3343 3487
1900 2114 2257 2402 2551 2695 2849 2994 3137 3281 3431 3579
2000 2167 2314 2462 2616 2763 2923 3070 3217 3365 3519 3672
2100 2220 2371 2522 2680 2830 2996 3148 3298 3449 3608 3765
2200 2272 2427 2582 2744 2898 3069 3224 3378 3533 3696 3858
2300 2326 2483 2642 2809 2967 3143 3301 3459 3616 3784 3951
`;

        const widths = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];
        
        const params = [
          {
            id: "barva_komponentu",
            name: "Barva komponentů (box, lišty, řetízek)",
            hint: "Sladění barvy profilu a řetízku s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "ovladani_strana",
            name: "Strana ovládání",
            type: "select",
            options: [
              { label: "Pravá", value: "P" },
              { label: "Levá", value: "L" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "Standardní", value: "standard", priceVariant: 0, priceType: "fixed" },
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          }
        ];

        const fabricGroups = [
          { 
            name: "Skupina 1", surcharge_percent: 0, max_width_mm: 1500, max_height_mm: 2300, 
            colors: [
              { name: "Alyssia Bílá", max_height_mm: 1500, hex: "#ffffff" },
              { name: "Alyssia Krémová", max_height_mm: 1500, hex: "#fffdd0" },
              { name: "Grace Bílá", max_height_mm: 1500, hex: "#f0f0f0" },
              { name: "Samantha Hnědá", max_height_mm: 2300, hex: "#d2b48c" },
              { name: "Samantha Šedá", max_height_mm: 2300, hex: "#a9a9a9" }
            ]
          },
          { 
            name: "Skupina 2", surcharge_percent: 5, max_width_mm: 1500, max_height_mm: 1500, 
            colors: [
              { name: "Grace V", max_height_mm: 1500, hex: "#d3d3d3" },
              { name: "Grace VIII", max_height_mm: 1500, hex: "#383e42" }
            ] 
          },
          { 
            name: "Skupina 3", surcharge_percent: 15, max_width_mm: 1500, max_height_mm: 1500, 
            colors: [
              { name: "Alyssia II", max_height_mm: 1500, hex: "#c2b280" },
              { name: "Grace II", max_height_mm: 1500, hex: "#8fbc8f" },
              { name: "Grace IV", max_height_mm: 1500, hex: "#f0e68c" }
            ] 
          },
          { 
            name: "Skupina 4", surcharge_percent: 30, max_width_mm: 1500, max_height_mm: 2300, 
            colors: [
              { name: "Alyssia III", max_height_mm: 1500, hex: "#add8e6" },
              { name: "Grace III", max_height_mm: 2300, hex: "#855e42" },
              { name: "Grace VII", max_height_mm: 2300, hex: "#111111" }
            ] 
          },
          { 
            name: "Skupina 5", surcharge_percent: 50, max_width_mm: 1500, max_height_mm: 1300, 
            colors: [
              { name: "Grace VI", max_height_mm: 1300, hex: "#d4af37" }
            ] 
          },
        ];

        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Textilní roletky'`);
        let category = 'Textilní roletky';
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Textilní roletky', 1, '')`);
        }

        const pRes = await db.query(`
          INSERT INTO "Product" (
            title, slug, category, price, "oldPrice", badge, img, "desc", 
            supplier_markup_percent, commission_percent, 
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, 
            parameters, gallery, colors, extras, fabric_groups_config, price_mode, hidden
          ) VALUES (
            $1, $2, $3, $4, null, $5, $6, $7,
            4.9, 0,
            330, 1500, 500, 2300, null,
            $8, '[]', '[]', '[{"key":"colorSectionTitle","value":"Vyberte model látky"}]', $9, 'matrix_cell', false
          )
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            "desc" = EXCLUDED."desc",
            parameters = EXCLUDED.parameters,
            fabric_groups_config = EXCLUDED.fabric_groups_config,
            height_mm_max = 2300,
            width_mm_max = 1500,
            price_mode = 'matrix_cell'
          RETURNING id
        `, [
          "Textilní roletka Optima Den a noc",
          "textilni-roletka-optima-den-a-noc",
          category,
          1370,
          "",
          "/images/optima_den_noc_cover.png",
          `<h3>Základní ceníková sestava</h3><ul><li><strong>Látka:</strong> 100% polyester, vzor dle výběru</li><li><strong>Box:</strong> hliníkový profil (bílá, hnědá, stříbrná)</li><li><strong>Hřídel:</strong> hliníkový profil, průměr 18 mm</li><li><strong>Vodící lišta:</strong> hliníková</li><li><strong>Závaží látky:</strong> hliníkové</li><li><strong>Ovládání:</strong> nekonečný řetízek se závažím</li><li><strong>Uchycení:</strong> křídlo okna</li></ul><br /><h3>Technické detaily a montáž</h3><p>Roletka je v provedení s krytem návinu látky a s vodícími lištami po stranách. Konstrukce roletky umožňuje různé nastavení výšky stažení látky.</p><p><strong>Neinvazivní montáž:</strong> Pomocí oboustranné lepící pásky na křídlo (nezmenšuje světlost).</p><p><em>Upozornění: Každá látka má z důvodu své tloušťky a typu odlišný limit pro maximální výšku návinu! E-shop Vás na tyto limity upozorní podle Vašeho výběru.</em></p>`,
          JSON.stringify(params),
          JSON.stringify(fabricGroups)
        ]);

        const productId = pRes.rows[0].id;

        await db.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);

        const lines = rawMatrix.trim().split('\n');
        let brackets = [];
        for (const line of lines) {
          const parts = line.trim().split(/\s+/).map(Number);
          if (parts.length < 12) continue;
          
          const height = parts[0];
          for (let i = 0; i < widths.length; i++) {
            const width = widths[i];
            const price = parts[i + 1];
            if (price) {
              brackets.push(`(${productId}, ${width}, ${height}, ${price})`);
            }
          }
        }

        if (brackets.length > 0) {
          await db.query(`
            INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk)
            VALUES ${brackets.join(', ')}
          `);
        }

        res.json({ success: true, message: `Imported product ID: ${productId} with ${brackets.length} brackets.` });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  app.post("/api/admin/update-optima-params", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const optimaParams = [
          {
            id: "barva_komponentu",
            name: "Barva komponentů (box, lišty, řetízek)",
            hint: "Sladění barvy profilu a řetízku s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "ovladani_strana",
            name: "Strana ovládání",
            type: "select",
            options: [
              { label: "Pravá", value: "P" },
              { label: "Levá", value: "L" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "Standardní", value: "standard", priceVariant: 0, priceType: "fixed" },
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          }
        ];

        const optimaDenNocParams = [
          {
            id: "barva_komponentu",
            name: "Barva komponentů (box, lišty, řetízek)",
            hint: "Sladění barvy profilu a řetízku s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "ovladani_strana",
            name: "Strana ovládání",
            type: "select",
            options: [
              { label: "Pravá", value: "P" },
              { label: "Levá", value: "L" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "Standardní", value: "standard", priceVariant: 0, priceType: "fixed" },
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          }
        ];

        // Update Optima
        await db.query(`UPDATE "Product" SET parameters = $1 WHERE slug = 'textilni-roletka-optima'`, [JSON.stringify(optimaParams)]);
        
        // Update Optima Den/Noc
        await db.query(`UPDATE "Product" SET parameters = $1 WHERE slug = 'textilni-roletka-optima-den-a-noc'`, [JSON.stringify(optimaDenNocParams)]);

        // Update the import script inside server.ts manually using regex later, 
        // but this endpoint handles the DB right now for quick fix.
        res.json({ success: true, message: 'Params updated' });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  
  app.post("/api/admin/import-jazz-expert", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const rawMatrix = `
500 404 428 453 478 504 529 554 579 604 629 654 679 704 728 753 778
600 416 443 470 497 525 552 577 604 631 659 686 711 738 766 793 820
700 426 455 484 514 542 572 600 630 659 688 716 746 774 805 833 862
800 440 470 500 531 562 594 624 655 687 718 748 779 811 841 872 902
900 449 481 515 549 582 615 648 681 714 747 780 813 845 879 914 946
1000 463 497 531 566 602 636 672 707 742 777 812 845 883 918 951 987
1100 473 509 547 584 621 659 694 732 770 807 842 882 918 955 991 1029
1200 483 523 561 602 641 680 719 757 797 836 874 915 952 993 1032 1071
1300 496 536 578 619 660 702 743 784 823 865 906 948 989 1030 1071 1112
1400 507 550 594 636 680 722 766 809 852 895 940 981 1025 1068 1111 1154
1500 518 562 608 654 699 744 790 835 879 924 971 1015 1061 1106 1151 1197
1600 530 577 624 672 719 766 812 860 906 954 1002 1049 1096 1143 1191 1238
1700 540 590 639 688 737 787 836 886 935 983 1033 1083 1131 1181 1230 1280
1800 553 603 655 706 757 809 860 913 962 1013 1066 1115 1168 1219 1269 1321
1900 563 617 671 724 777 831 884 937 989 1044 1097 1151 1203 1257 1310 1364
2000 575 630 686 742 797 851 906 962 1018 1073 1128 1183 1239 1293 1349 1404
2100 586 643 702 757 815 873 929 988 1045 1102 1159 1218 1276 1333 1390 1448
2200 598 658 716 776 835 895 954 1013 1072 1133 1192 1251 1310 1370 1429 1489
2300 608 671 732 793 856 917 978 1040 1100 1162 1224 1285 1346 1408 1469 1529
2400 621 683 747 811 873 939 1002 1065 1128 1192 1255 1318 1382 1446 1508 1572
2500 631 698 763 830 894 958 1025 1090 1155 1221 1286 1351 1418 1482 1548 1613
`;

        const widths = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
        
        const params = [
          {
            id: "barva_komponentu",
            name: "Barva komponentů (držáky, závaží, řetízek)",
            hint: "Barva držáků, závaží a řetízku. Doporučujeme sladit s barvou rámu okna nebo interiéru pro dokonalý vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Žlutá", value: "zluta", hex: "#ffff00", priceVariant: 0, priceType: "fixed" },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Béžová", value: "bezova", hex: "#f5f5dc", priceVariant: 0, priceType: "fixed" },
              { label: "Šedá", value: "seda", hex: "#808080", priceVariant: 0, priceType: "fixed" },
              { label: "Oranžová", value: "oranzova", hex: "#ffa500", priceVariant: 0, priceType: "fixed" },
              { label: "Světle zelená", value: "svetle_zelena", hex: "#90ee90", priceVariant: 0, priceType: "fixed" },
              { label: "Tmavě zelená", value: "tmave_zelena", hex: "#006400", priceVariant: 0, priceType: "fixed" },
              { label: "Modrá", value: "modra", hex: "#0000ff", priceVariant: 0, priceType: "fixed" },
              { label: "Světle modrá", value: "svetle_modra", hex: "#add8e6", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "ovladani_strana",
            name: "Strana ovládání",
            hint: "Zvolte stranu, na které chcete mít ovládací řetízek (pohled zevnitř místnosti).",
            type: "select",
            options: [
              { label: "Pravá", value: "P", image: "/images/configurator/jazz_expert/ovladani_prava_1782659318932.png" },
              { label: "Levá", value: "L", image: "/images/configurator/jazz_expert/ovladani_leva_1782659328067.png" }
            ]
          },
          {
            id: "montazni_profil",
            name: "Montážní profil",
            hint: "Hliníkový profil usnadňuje přesnou a pevnou instalaci roletky.",
            type: "select",
            options: [
              { label: "Ne", value: "ne", priceVariant: 0, priceType: "fixed" },
              { label: "Ano", value: "ano", priceVariant: 186, priceType: "per_bm", image: "/images/configurator/jazz_expert/montazni_profil_1782659311351.png" }
            ]
          },
          {
            id: "montazni_profil_typ",
            name: "Způsob dodání profilu",
            hint: "Samostatně: profil a roletka vám přijdou zvlášť. Kompletní: roletka je již složená a nacvaknutá na profilu, což vám výrazně urychlí finální montáž.",
            type: "select",
            condition: {
              dependentParamId: "montazni_profil",
              expectedValues: ["ano"]
            },
            options: [
              { label: "Samostatně", value: "samostatne", priceVariant: 0, priceType: "fixed" },
              { label: "Kompletní", value: "kompletni", priceVariant: 77, priceType: "fixed" }
            ]
          },
          {
            id: "barva_profilu_montaz",
            name: "Barva montážního profilu",
            hint: "Barva hliníkového montážního profilu. Ideální je vybrat stejnou barvu, jakou mají komponenty roletky (držáky).",
            type: "color_array",
            condition: {
              dependentParamId: "montazni_profil",
              expectedValues: ["ano"]
            },
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Antracit", value: "antracit", hex: "#2a2e33", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "odvijeni",
            name: "Odvíjení látky",
            hint: "Určuje, zda se látka spouští blíže k oknu (Ke zdi), nebo dále do místnosti přes návin (Ode zdi).",
            type: "select",
            options: [
              { label: "Ke zdi (Standard)", value: "ke_zdi", priceVariant: 0, priceType: "fixed", image: "/images/configurator/jazz_expert/odvijeni_ke_zdi_1782659263280.png" },
              { label: "Ode zdi", value: "ode_zdi", priceVariant: 0, priceType: "fixed", image: "/images/configurator/jazz_expert/odvijeni_ode_zdi_1782659273850.png" }
            ]
          },
          {
            id: "uchyceni",
            name: "Způsob uchycení",
            hint: "Vyberte způsob montáže: horizontálně do stropu, nebo vertikálně do zdi či křídla okna.",
            type: "select",
            options: [
              { label: "Stěna, křídlo okna", value: "stena_kridlo", priceVariant: 0, priceType: "fixed", image: "/images/configurator/jazz_expert/uchyceni_stena_1782659282820.png" },
              { label: "Strop", value: "strop", priceVariant: 0, priceType: "fixed", image: "/images/configurator/jazz_expert/uchyceni_strop_1782659291729.png" }
            ]
          },
          {
            id: "bezpecnost",
            name: "Bezpečnostní prvek",
            hint: "Bezpečnostní úchyt, který se připevní na stěnu či rám. Drží řetízek pevně napnutý, čímž zabraňuje volnému houpání a chrání děti před zamotáním (vyžadováno normou).",
            type: "select",
            options: [
              { label: "Ne", value: "ne", priceVariant: 0, priceType: "fixed" },
              { label: "Ano", value: "ano", priceVariant: 12, priceType: "fixed" }
            ]
          }
        ];

        const fabricGroups = [
          { name: "Skupina 1 (Adriana, Melisa)", surcharge_percent: 0, max_width_mm: 1950, max_height_mm: 2500, 
            colors: [
              { name: "Adriana Bílá", hex: "#f0f0f0" },
              { name: "Adriana Béžová", hex: "#f5f5dc" },
              { name: "Adriana Žlutá", hex: "#ffff00" },
              { name: "Melisa Hnědá", hex: "#8b4513" },
              { name: "Melisa Zelená", hex: "#008000" }
            ]
          },
          { name: "Skupina 2 (Melisa BO)", surcharge_percent: 20, max_width_mm: 1950, max_height_mm: 2500, 
            colors: [
              { name: "Melisa BO Bílá", hex: "#ffffff" },
              { name: "Melisa BO Béžová", hex: "#fffdd0" },
              { name: "Melisa BO Šedá", hex: "#808080" }
            ]
          },
          { name: "Skupina 3 (Stella BO, Melisa BO B/B, B/S)", surcharge_percent: 30, max_width_mm: 1950, max_height_mm: 2500, 
            colors: [
              { name: "Stella BO Bílá", hex: "#ffffff" },
              { name: "Stella BO Hnědá", hex: "#8b4513" },
              { name: "Stella BO Šedá", hex: "#808080" }
            ]
          },
          { name: "Skupina 4 (Tropic)", surcharge_percent: 45, max_width_mm: 1950, max_height_mm: 2500, 
            colors: [
              { name: "Tropic Bílá", hex: "#f5f5f5" },
              { name: "Tropic Béžová", hex: "#e8c396" },
              { name: "Tropic Šedá", hex: "#a9a9a9" }
            ]
          },
          { name: "Skupina 5 (Screen nehořlavá)", surcharge_percent: 80, max_width_mm: 1800, max_height_mm: 2250, 
            colors: [
              { name: "Screen Bílá", hex: "#f0f0f0" },
              { name: "Screen Šedá", hex: "#808080" },
              { name: "Screen Černá", hex: "#000000" }
            ]
          }
        ];

        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Textilní roletky'`);
        let category = 'Textilní roletky';
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Textilní roletky', 1, '')`);
        }

        const pRes = await db.query(`
          INSERT INTO "Product" (
            title, slug, category, price, "oldPrice", badge, img, "desc", 
            supplier_markup_percent, commission_percent, 
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, 
            parameters, gallery, colors, extras, fabric_groups_config, price_mode, hidden, validation_profile
          ) VALUES (
            $1, $2, $3, $4, null, $5, $6, $7,
            4.9, 0,
            350, 2000, 500, 2500, null,
            $8, '[]', '[]', '[{"key":"colorSectionTitle","value":"Vyberte model látky"}]', $9, 'matrix_cell', false, 'jazz_expert'
          )
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            "desc" = EXCLUDED."desc",
            parameters = EXCLUDED.parameters,
            fabric_groups_config = EXCLUDED.fabric_groups_config,
            height_mm_max = 2500,
            width_mm_max = 2000,
            price_mode = 'matrix_cell',
            validation_profile = 'jazz_expert'
          RETURNING id
        `, [
          "Textilní roleta volně vysící",
          "textilni-roleta-volne-vysici",
          category,
          1000,
          "",
          "/images/jazz_expert.png",
          `<h3>Základní ceníková sestava JAZZ EXPERT</h3><ul><li><strong>Látka:</strong> 100% polyester dle výběru</li><li><strong>Hřídel:</strong> hliníkový profil, průměr 25 mm</li><li><strong>Držáky:</strong> plastové</li><li><strong>Závaží:</strong> hliníkové</li><li><strong>Ovládání:</strong> řetízkem</li><li><strong>Uchycení:</strong> strop, zeď</li></ul><br /><h3>Technické informace</h3><p>Roletka je v provedení bez krytu návinu, volně visící. Konstrukce roletky umožňuje různé nastavení výšky stažení látky. Invazivní montáž pomocí šroubů na křídlo (nezmenšuje světlost), do ostění, nebo nad okno.</p>`,
          JSON.stringify(params),
          JSON.stringify(fabricGroups)
        ]);

        const productId = pRes.rows[0].id;

        await db.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);

        const lines = rawMatrix.trim().split('\n');
        let brackets = [];
        for (const line of lines) {
          const parts = line.trim().split(/\s+/).map(Number);
          if (parts.length < 2) continue;
          
          const height = parts[0];
          for (let i = 0; i < widths.length; i++) {
            const width = widths[i];
            const price = parts[i + 1];
            if (price) {
              brackets.push(`(${productId}, ${width}, ${height}, ${price})`);
            }
          }
        }

        if (brackets.length > 0) {
          await db.query(`
            INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk)
            VALUES ${brackets.join(', ')}
          `);
        }

        res.json({ success: true, productId });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e) });
      }
    });
  });

app.post("/api/admin/import-plise-lagarta", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const slug = 'plise-zaluzie-lagarta';
        


        const fabricGroups = [
          { 
            name: "Cenová skupina 1 (Basic, Basic Reflex FR)", surcharge_percent: 0, matrix: m.g1, 
            colors: [
              // Basic
              { name: "Basic 1029", img: "/barva/barvaplise/4995-10.jpg" },
              { name: "Basic 1048", img: "/barva/barvaplise/5012-10.jpg" },
              { name: "Basic 2371", img: "/barva/barvaplise/5004-10.jpg" },
              { name: "Basic 2372", img: "/barva/barvaplise/5000-10.jpg" },
              { name: "Basic 2381", img: "/barva/barvaplise/4997-10.jpg" },
              { name: "Basic 3072", img: "/barva/barvaplise/5010-10.jpg" },
              { name: "Basic 4160", img: "/barva/barvaplise/5006-10.jpg" },
              { name: "Basic 4163", img: "/barva/barvaplise/5002-10.jpg" },
              { name: "Basic 5201", img: "/barva/barvaplise/5003-10.jpg" },
              { name: "Basic 5226", img: "/barva/barvaplise/4999-10.jpg" },
              { name: "Basic 6065", img: "/barva/barvaplise/4994-10.jpg" },
              { name: "Basic 6113", img: "/barva/barvaplise/5007-10.jpg" },
              { name: "Basic 9179", img: "/barva/barvaplise/5008-10.jpg" },
              { name: "Basic 9180", img: "/barva/barvaplise/5001-10.jpg" },
              { name: "Basic 9186", img: "/barva/barvaplise/4996-10.jpg" },
              { name: "Basic 9243", img: "/barva/barvaplise/5009-10.jpg" },
              { name: "Basic 9244", img: "/barva/barvaplise/5011-10.jpg" },
              { name: "Basic 9245", img: "/barva/barvaplise/5005-10.jpg" },
              { name: "Basic 9248", img: "/barva/barvaplise/4998-10.jpg" },
              // Basic Reflex FR
              { name: "Basic Reflex FR 1029", img: "/barva/barvaplise/5032-10.jpg" },
              { name: "Basic Reflex FR 1048", img: "/barva/barvaplise/5024-10.jpg" },
              { name: "Basic Reflex FR 2371", img: "/barva/barvaplise/5019-10.jpg" },
              { name: "Basic Reflex FR 2372", img: "/barva/barvaplise/5026-10.jpg" },
              { name: "Basic Reflex FR 2373", img: "/barva/barvaplise/5036-10.jpg" },
              { name: "Basic Reflex FR 2381", img: "/barva/barvaplise/5031-10.jpg" },
              { name: "Basic Reflex FR 3072", img: "/barva/barvaplise/5026-10.jpg" },
              { name: "Basic Reflex FR 4160", img: "/barva/barvaplise/5021-10.jpg" },
              { name: "Basic Reflex FR 4163", img: "/barva/barvaplise/5038-10.jpg" },
              { name: "Basic Reflex FR 5201", img: "/barva/barvaplise/5022-10.jpg" },
              { name: "Basic Reflex FR 5226", img: "/barva/barvaplise/5035-10.jpg" },
              { name: "Basic Reflex FR 6065", img: "/barva/barvaplise/5023-10.jpg" },
              { name: "Basic Reflex FR 6113", img: "/barva/barvaplise/5028-10.jpg" },
              { name: "Basic Reflex FR 9179", img: "/barva/barvaplise/5030-10.jpg" },
              { name: "Basic Reflex FR 9180", img: "/barva/barvaplise/5037-10.jpg" },
              { name: "Basic Reflex FR 9186", img: "/barva/barvaplise/5033-10.jpg" },
              { name: "Basic Reflex FR 9243", img: "/barva/barvaplise/5025-10.jpg" },
              { name: "Basic Reflex FR 9244", img: "/barva/barvaplise/5027-10.jpg" },
              { name: "Basic Reflex FR 9245", img: "/barva/barvaplise/5020-10.jpg" },
              { name: "Basic Reflex FR 9248", img: "/barva/barvaplise/5034-10.jpg" }
            ] 
          },
          { 
            name: "Cenová skupina 2 (Basic Semi, Stripes, Wood, Press Reflex)", surcharge_percent: 0, matrix: m.g2, 
            colors: [
              // Basic Semi
              { name: "Basic Semi 001B", img: "/barva/barvaplise/5042-10.jpg" },
              { name: "Basic Semi 004B", img: "/barva/barvaplise/5041-10.jpg" },
              { name: "Basic Semi 008B", img: "/barva/barvaplise/5040-10.jpg" },
              // Stripes
              { name: "Stripes 1029", hex: "#d0d0d0" },
              { name: "Stripes 2087", img: "/barva/barvaplise/5115-10.jpg" },
              { name: "Stripes 2365", img: "/barva/barvaplise/5114-10.jpg" },
              { name: "Stripes 5123", img: "/barva/barvaplise/5120-10.jpg" },
              { name: "Stripes 5177", img: "/barva/barvaplise/5116-10.jpg" },
              { name: "Stripes 9084", img: "/barva/barvaplise/5119-10.jpg" },
              { name: "Stripes 9147", img: "/barva/barvaplise/5118-10.jpg" },
              // Wood
              { name: "Wood 1006", img: "/barva/barvaplise/5129-10.jpg" },
              { name: "Wood 2087", img: "/barva/barvaplise/5127-10.jpg" },
              { name: "Wood 2178", img: "/barva/barvaplise/5127-10.jpg" },
              { name: "Wood 327", img: "/barva/barvaplise/5130-10.jpg" },
              { name: "Wood 9091", img: "/barva/barvaplise/5128-10.jpg" },
              // Press Reflex
              { name: "Press Reflex 1029", img: "/barva/barvaplise/5092-10.jpg" },
              { name: "Press Reflex 2454", img: "/barva/barvaplise/5091-10.jpg" },
              { name: "Press Reflex 2456", img: "/barva/barvaplise/5099-10.jpg" },
              { name: "Press Reflex 4203", img: "/barva/barvaplise/5094-10.jpg" },
              { name: "Press Reflex 4205", img: "/barva/barvaplise/5098-10.jpg" },
              { name: "Press Reflex 6128", img: "/barva/barvaplise/5097-10.jpg" },
              { name: "Press Reflex 6130", img: "/barva/barvaplise/5093-10.jpg" },
              { name: "Press Reflex 9236", img: "/barva/barvaplise/5095-10.jpg" },
              { name: "Press Reflex 9282", img: "/barva/barvaplise/5100-10.jpg" },
              { name: "Press Reflex 9283", img: "/barva/barvaplise/5096-10.jpg" }
            ] 
          },
          { 
            name: "Cenová skupina 3 (Bamboo, Living, Basic Blackout, Honeycomb)", surcharge_percent: 0, matrix: m.g3, 
            colors: [
              // Bamboo
              { name: "Bamboo 1069", img: "/barva/barvaplise/4967-10.jpg" },
              { name: "Bamboo 1096", img: "/barva/barvaplise/4971-10.jpg" },
              { name: "Bamboo 5175", img: "/barva/barvaplise/4970-10.jpg" },
              { name: "Bamboo 8134", img: "/barva/barvaplise/4973-10.jpg" },
              { name: "Bamboo 8173", img: "/barva/barvaplise/4972-10.jpg" },
              { name: "Bamboo 9125", img: "/barva/barvaplise/4968-10.jpg" },
              { name: "Bamboo 9155", img: "/barva/barvaplise/4969-10.jpg" },
              // Bamboo Reflex
              { name: "Bamboo Reflex 2275", img: "/barva/barvaplise/4992-10.jpg" },
              { name: "Bamboo Reflex 2276", img: "/barva/barvaplise/4984-10.jpg" },
              { name: "Bamboo Reflex 2294", img: "/barva/barvaplise/4989-10.jpg" },
              { name: "Bamboo Reflex 2295", img: "/barva/barvaplise/4985-10.jpg" },
              { name: "Bamboo Reflex 4139", img: "/barva/barvaplise/4988-10.jpg" },
              { name: "Bamboo Reflex 5175", img: "/barva/barvaplise/4987-10.jpg" },
              { name: "Bamboo Reflex 9125", img: "/barva/barvaplise/4991-10.jpg" },
              { name: "Bamboo Reflex 9155", img: "/barva/barvaplise/4986-10.jpg" },
              { name: "Bamboo Reflex 1069", img: "/barva/barvaplise/4990-10.jpg" },
              // Living
              { name: "Living 1122", img: "/barva/barvaplise/5074-10.jpg" },
              { name: "Living 2465", img: "/barva/barvaplise/5071-10.jpg" },
              { name: "Living 2474", img: "/barva/barvaplise/5073-10.jpg" },
              { name: "Living 8190", img: "/barva/barvaplise/5072-10.jpg" },
              { name: "Living 9298", img: "/barva/barvaplise/5070-10.jpg" },
              { name: "Living 9306", img: "/barva/barvaplise/5069-10.jpg" },
              // Basic Blackout
              { name: "Basic Blackout 1029", img: "/barva/barvaplise/5015-10.jpg" },
              { name: "Basic Blackout 2320", img: "/barva/barvaplise/5017-10.jpg" },
              { name: "Basic Blackout 9090", img: "/barva/barvaplise/5014-10.jpg" },
              { name: "Basic Blackout 9178", img: "/barva/barvaplise/5016-10.jpg" },
              // Honeycomb
              { name: "HoneyComb Silver stripe 301", img: "/barva/barvaplise/6687-10.jpg" },
              { name: "HoneyComb Silver stripe 302", img: "/barva/barvaplise/6686-10.jpg" },
              { name: "HoneyComb Silver stripe 318", img: "/barva/barvaplise/6688-10.jpg" },
              { name: "HoneyComb Silver stripe 320", img: "/barva/barvaplise/6685-10.jpg" }
            ] 
          },
          { 
            name: "Cenová skupina 4 (Zebra, Grass, Parquet)", surcharge_percent: 0, matrix: m.g4, 
            colors: [
              // Zebra
              { name: "Zebra 6100", img: "/barva/barvaplise/5137-10.jpg" },
              { name: "Zebra 6110", img: "/barva/barvaplise/5136-10.jpg" },
              // Grass
              { name: "Grass 6600", img: "/barva/barvaplise/5052-10.jpg" },
              { name: "Grass 6601", img: "/barva/barvaplise/5049-10.jpg" },
              { name: "Grass 6607", img: "/barva/barvaplise/5051-10.jpg" },
              // Parquet
              { name: "Parquet 8940", img: "/barva/barvaplise/5085-10.jpg" },
              { name: "Parquet 8942", img: "/barva/barvaplise/5083-10.jpg" }
            ] 
          },
          { 
            name: "Cenová skupina 5 (Bamboo Pearl, Shine, Wave, Binary, Living Blackout, Sparkle)", surcharge_percent: 0, matrix: m.g5, 
            colors: [
              // Bamboo Pearl
              { name: "Bamboo Pearl 1015", img: "/barva/barvaplise/4979-10.jpg" },
              { name: "Bamboo Pearl 1025", img: "/barva/barvaplise/4975-10.jpg" },
              { name: "Bamboo Pearl 1035", img: "/barva/barvaplise/4977-10.jpg" },
              { name: "Bamboo Pearl 1045", img: "/barva/barvaplise/4981-10.jpg" },
              { name: "Bamboo Pearl 1055", img: "/barva/barvaplise/4980-10.jpg" },
              { name: "Bamboo Pearl 1065", img: "/barva/barvaplise/4976-10.jpg" },
              { name: "Bamboo Pearl 1075", img: "/barva/barvaplise/4978-10.jpg" },
              { name: "Bamboo Pearl 1085", img: "/barva/barvaplise/4982-10.jpg" },
              // Shine
              { name: "Shine 8550", img: "/barva/barvaplise/5102-10.jpg" },
              { name: "Shine 8555", img: "/barva/barvaplise/5103-10.jpg" },
              // Wave
              { name: "Wave 9660", img: "/barva/barvaplise/5124-10.jpg" },
              { name: "Wave 9661", img: "/barva/barvaplise/5125-10.jpg" },
              // Binary
              { name: "Binary 9600", img: "/barva/barvaplise/5044-10.jpg" },
              // Living Blackout
              { name: "Living Blackout 201V", img: "/barva/barvaplise/5077-10.jpg" },
              { name: "Living Blackout 202V", img: "/barva/barvaplise/5080-10.jpg" },
              { name: "Living Blackout 203V", img: "/barva/barvaplise/5081-10.jpg" },
              { name: "Living Blackout 204V", img: "/barva/barvaplise/5078-10.jpg" },
              { name: "Living Blackout 205V", img: "/barva/barvaplise/5076-10.jpg" },
              { name: "Living Blackout 206V", img: "/barva/barvaplise/5079-10.jpg" },
              // Sparkle
              { name: "Sparkle 1300", hex: "#ffebcd" }
            ] 
          }
        ];

        const params = [
          {
            id: "model",
            name: "Model",
            hint: "Každý model má jiný způsob stahování a instalace. Nejprodávanější je PM2 (obousměrně stahovací), pro dvě různé látky (den a noc) zvolte PM4/PM5. Pro střešní okna PS3.",
            type: "color_array",
            options: [
              { label: "PM1", value: "PM1", hint: "Základní model pevně uchycený nahoře, stahuje se shora dolů.", img: "/images/icon_pm1.png" },
              { label: "PM2", value: "PM2", qapiRecommended: true, hint: "Nejoblíbenější! Lze stahovat shora i zespoda, látka plave na okně libovolně.", img: "/images/icon_pm2.png" },
              { label: "PM3", value: "PM3", hint: "Podobné jako PM2, ale se dvěma středovými profily.", img: "/images/icon_pm2.png" },
              { label: "PM3M", value: "PM3M", priceVariant: 200, priceType: "fixed", hint: "Model s pohodlnými magnety.", img: "/images/icon_pm2.png", hidden: true },
              { label: "PM4", value: "PM4", hint: "Základní 'Den a Noc'. Nahoře i dole upevněno, mezi tím dvě látky.", img: "/images/icon_den_noc.png", hidden: true },
              { label: "PM5", value: "PM5", hint: "Nejflexibilnější 'Den a Noc'. Plave na okně a obsahuje dvě látky.", img: "/images/icon_den_noc.png", hidden: true },
              { label: "PP1", value: "PP1", priceVariant: 255, priceType: "fixed", hint: "Zavěšené na lanku.", img: "/images/icon_pm1.png", hidden: true },
              { label: "PP2", value: "PP2", priceVariant: 425, priceType: "fixed", hint: "Zavěšené na lanku (obousměrně stahovací).", img: "/images/icon_pm2.png", hidden: true },
              { label: "PS3", value: "PS3", hint: "Speciálně navrženo do střešních oken s vodicími lištami.", img: "/images/icon_ps3.png" }
            ]
          },
          {
            id: "barva_profilu",
            name: "Barva profilu",
            hint: "Sladění profilu s rámem vašeho okna je základem dokonalého designu. Standardní barvy jsou bez příplatku. Imitace dřeva a lakování RAL jsou za příplatek.",
            type: "color_array",
            options: [
              { label: "Bílá (RAL 9016)", value: "bila", img: "/barva/barvaplise/Profil/6054-10.jpg", qapiRecommended: true },
              { label: "Krémová (RAL 1015)", value: "kremova", img: "/barva/barvaplise/Profil/6840-10.jpg", excludedModels: ["PS3"] },
              { label: "Hnědá (RAL 8017)", value: "hneda", img: "/barva/barvaplise/Profil/6055-10.jpg" },
              { label: "Stříbrná (RAL 9006)", value: "stribrna", img: "/barva/barvaplise/Profil/6056-10.jpg" },
              { label: "Antracit (RAL 7016)", value: "antracit", img: "/barva/barvaplise/Profil/6057-10.jpg" },
              { label: "Černá (RAL 9005)", value: "cerna", img: "/barva/barvaplise/Profil/6841-10.jpg", excludedModels: ["PS3"] },
              { label: "Zlatý dub (Golden Oak)", value: "zlaty_dub", priceVariant: 300, priceType: "fixed", img: "/barva/barvaplise/Profil/6059-10.jpg", excludedModels: ["PS3"] },
              { label: "Ořech (Dark Walnut)", value: "dark_walnut", priceVariant: 300, priceType: "fixed", img: "/barva/barvaplise/Profil/6060-10.jpg", excludedModels: ["PS3"] },
              { label: "Winchester", value: "winchester", priceVariant: 300, priceType: "fixed", img: "/barva/barvaplise/Profil/6062-10.jpg", excludedModels: ["PS3"] },
              { label: "Vlastní lakování RAL", value: "ral", hex: "#ffffff", hint: "Můžete si vybrat jakoukoliv barvu ze vzorníku RAL.", excludedModels: ["PS3"] }
            ]
          },
          {
            id: "vlastni_ral_kod",
            name: "Zadejte požadovaný kód RAL",
            type: "text",
            condition: {
              dependsOnParamId: "barva_profilu",
              allowedValues: ["ral"]
            }
          },
          {
            id: "lakovani_profilu_1",
            name: "Lakování profilů",
            type: "select",
            condition: {
              dependsOnParamId: "model",
              allowedValues: ["PM1", "PM3", "PS3"]
            },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano", value: "ano", priceVariant: 157, priceType: "per_bm" }
            ]
          },
          {
            id: "lakovani_profilu_2",
            name: "Lakování profilů",
            type: "select",
            condition: {
              dependsOnParamId: "model",
              allowedValues: ["PM2", "PM5"]
            },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano", value: "ano", priceVariant: 236, priceType: "per_bm" }
            ]
          },
          {
            id: "vodici_lista_ps3",
            name: "Vodící lišta pro model PS3",
            hint: "Vodící lišta pomáhá stabilizovat žaluzii ve střešním okně. Pokud zvolíte barvu RAL, bude i lišta lakována do RAL a automaticky se připočte lakování.",
            type: "select",
            condition: {
              dependsOnParamId: "model",
              allowedValues: ["PS3"]
            },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano", value: "ano", priceVariant: 311, priceType: "per_bm_height" }
            ]
          },
          {
            id: "lakovani_vodici_listy_ps3",
            name: "Lakování vodící lišty",
            type: "select",
            condition: {
              dependsOnParamId: "vodici_lista_ps3",
              allowedValues: ["ano"]
            },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano", value: "ano", priceVariant: 327, priceType: "per_bm_height" }
            ]
          },

          {
            id: "typ_uchyceni",
            name: "Typ uchycení",
            hint: "**Zasklívací lišty (Varianta a)** - Nejelegantnější montáž přímo k oknu (doporučujeme u rovných lišt). Žaluzie krásně splyne se sklem a nepřekáží při manipulaci s oknem.\n\n**Pomocí konzoly (Varianta b)** - Doporučujeme, pokud máte velmi úzké (méně než 15 mm) nebo výrazně zaoblené zasklívací lišty, případně trojskla s plytkou lištou. Montuje se na rám okna.",
            type: "select",
            options: [
              { label: "Zasklívací lišty", value: "zasklivaci_lista", img: "/images/icon_uchyceni_a.png" },
              { label: "Pomocí konzoly", value: "konzola", img: "/images/icon_uchyceni_b.png" }
            ]
          },
          {
            id: "strana_ovladani",
            name: "Strana ovládání",
            hint: "Zvolte, na které straně chcete mít ovládací mechanismus (platí zejména pro provázek).",
            type: "select",
            options: [
              { label: "Pravá", value: "prava" },
              { label: "Levá", value: "leva" }
            ]
          },
          {
            id: "prodlouzeni_ovladani",
            name: "Prodloužení ovládání",
            hint: "Pokud máte okna příliš vysoko, doporučujeme zakoupit prodloužené ovládání, kterým na madla pohodlně dosáhnete i ze země.",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "1000 mm", value: "1000", priceVariant: 548, priceType: "fixed" },
              { label: "1250 mm", value: "1250", priceVariant: 668, priceType: "fixed" },
              { label: "1500 mm", value: "1500", priceVariant: 772, priceType: "fixed" }
            ]
          }
        ];

        // Ensure category
        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Plisé žaluzie'`);
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Plisé žaluzie', 1, '')`);
        }

        const title = "Plisé žaluzie Lagarta";
        const desc = "<p>Proměňte svá okna s **Plisé žaluziemi Lagarta**, které nabízejí dokonalou harmonii mezi moderním designem a praktickou ochranou před sluncem. Na rozdíl od klasických žaluzií je plisé tvořeno elegantní skládanou látkou, kterou můžete stahovat jak shora dolů, tak zespoda nahoru (dle zvoleného modelu).</p><p>Díky možnosti volby z <strong>5 cenových skupin látek</strong> – od lehkých průsvitných materiálů až po zatemňovací (Blackout) nebo luxusní strukturované vzory – získáte přesně ten styl, který padne do vašeho interiéru. Vyberte si prémiový systém s magnetickým zámkem nebo dvoulátkový systém 'Den a Noc', a posuňte stínění na novou úroveň.</p>";
        const img = "/images/plise_lagarta_cover.png";

        await db.query(
          `INSERT INTO "Product" 
            (title, slug, category, "desc", price, price_mode, validation_profile, img, parameters, supplier_markup_percent, commission_percent, fabric_groups_config, dimension_constraints) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            "desc" = EXCLUDED."desc",
            price_mode = EXCLUDED.price_mode,
            validation_profile = EXCLUDED.validation_profile,
            parameters = EXCLUDED.parameters,
            fabric_groups_config = EXCLUDED.fabric_groups_config,
            dimension_constraints = EXCLUDED.dimension_constraints
          `,
          [
            title, slug, 'Plisé žaluzie', desc, 1000, 
            'matrix_cell', 'plise_lagarta', img, 
            JSON.stringify(params), 0, 0, 
            JSON.stringify(fabricGroups), 
            JSON.stringify({ width_mm_min: 160, width_mm_max: 2300, height_mm_min: 300, height_mm_max: 2600 })
          ]
        );

        res.json({ success: true, message: 'Plisé Lagarta imporovány!' });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  app.post("/api/admin/import-site-hmyz", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const slug = 'site-proti-hmyzu-okenni';
        
        const params = [
          {
            id: "typ_okna",
            name: "Typ okna (určuje profil sítě)",
            hint: "Typ okna je klíčový pro výběr správného tvaru rámu sítě. Plastová okna mají jinou tloušťku rámu než dřevěná EURO okna. Pokud si nejste jistí, změřte tloušťku rámu podle našeho návodu.",
            type: "color_array",
            options: [
              { label: "Plastové okno (profil ISSO OE 19x8)", value: "pvc", qapiRecommended: true, hint: "Nejčastější varianta. Tenký profil ideální pro standardní plastová okna.", img: "/images/icon_okno_pvc.png" },
              { label: "Dřevěné EURO okno / plast s okapničkou (profil OE 24x24)", value: "euro", hint: "Silnější profil určený pro dřevěná okna nebo plastová okna, která mají vystouplou okapničku.", img: "/images/icon_okno_euro.png" },
              { label: "Hliníkové okno (profil OE 32x11 LUX)", value: "hlinik", hint: "Široký, elegantní hliníkový profil speciálně tvarovaný pro okna z hliníku.", img: "/images/icon_okno_hlinik.png" }
            ]
          },
          {
            id: "barva_profilu",
            name: "Barva rámu",
            type: "color_array",
            options: [
              // LAKOVANÉ STANDARD
              { label: "RAL 9016", value: "ral_9016", img: "/barva/site/5849-10.jpg", qapiRecommended: true },
              { label: "RAL 8019", value: "ral_8019", img: "/barva/site/5852-10.jpg" },
              { label: "RAL 7016", value: "ral_7016", img: "/barva/site/5851-10.jpg" },
              { label: "RAL 8003", value: "ral_8003", img: "/barva/site/5850-10.jpg" },
              { label: "RAL 9006", value: "ral_9006", img: "/barva/site/5848-10.jpg" },
              { label: "DB-703 (od + 57 Kč/m²)", value: "db_703", img: "/barva/site/5846-10.jpg" },
              { label: "RAL 7016 STRUCTURE (od + 57 Kč/m²)", value: "ral_7016_structure", img: "/barva/site/5847-10.jpg" },

              // LAKOVANÉ IMITACE
              { label: "WALNUT (od + 162 Kč/m²)", value: "walnut", img: "/barva/site/5752-10.jpg" },
              { label: "NATURAL OAK (od + 162 Kč/m²)", value: "natural_oak", img: "/barva/site/přírodni dub.jpg" },
              { label: "GOLD OAK (od + 162 Kč/m²)", value: "gold_oak", img: "/barva/site/5750-10.jpg" },
              { label: "AMARETTO CHERRY (od + 162 Kč/m²)", value: "amaretto_cherry", img: "/barva/site/5751-10.jpg" },

              // RENOLITOVÁ FÓLIE
              { label: "DOUGLAS (od + 282 Kč/m²)", value: "douglas", img: "/barva/site/5745-10.jpg" },
              { label: "PINE (od + 282 Kč/m²)", value: "pine", img: "/barva/site/5746-10.jpg" },
              { label: "DARK NUT (od + 282 Kč/m²)", value: "dark_nut", img: "/barva/site/5747-10.jpg" },
              { label: "SAPELI (od + 282 Kč/m²)", value: "sapeli", img: "/barva/site/5744-10.jpg" }
            ]
          },
          {
            id: "sitovina_standard",
            name: "Typ síťoviny (Plastová okna)",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc"] },
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá (+ 142 Kč/m²)", value: "transparentni", priceVariant: 142, priceType: "per_m2", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá (+ 431 Kč/m²)", value: "protipylova", priceVariant: 431, priceType: "per_m2", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá (+ 475 Kč/m²)", value: "petscreen_seda", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá (+ 475 Kč/m²)", value: "petscreen_cerna", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" }
            ]
          },
          {
            id: "sitovina_lux",
            name: "Typ síťoviny (Hliníková a Dřevěná EURO okna)",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["hlinik", "euro"] },
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá (+ 142 Kč/m²)", value: "transparentni", priceVariant: 142, priceType: "per_m2", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá (+ 431 Kč/m²)", value: "protipylova", priceVariant: 431, priceType: "per_m2", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá (+ 475 Kč/m²)", value: "petscreen_seda", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá (+ 475 Kč/m²)", value: "petscreen_cerna", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" },
              { label: "Síťovina s nanovláknem - černá (+ 1078 Kč/m²)", value: "nano", priceVariant: 1078, priceType: "per_m2", hint: "Revoluční nanovlákno zachytí i ty nejmenší částice smogu. Nejvyšší možná ochrana.", img: "/images/icon_sit_nano.png" }
            ]
          },
          {
            id: "uchyceni_pvc",
            name: "Výška otočného držáku",
            hint: "Otočné držáky fixují síť za okenní těsnění. Správnou velikost vyberete tak, že změříte hloubku zapuštění rámu podle našeho návodu. (Pokud je zapuštění 15 mm, vyberte držák 15 mm).",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc"] },
            options: [
              { label: "0 mm", value: "0" }, { label: "4 mm", value: "4" }, { label: "6 mm", value: "6" },
              { label: "7 mm", value: "7" }, { label: "9 mm", value: "9" }, { label: "11 mm", value: "11" },
              { label: "12 mm", value: "12" }, { label: "13 mm", value: "13" }, { label: "15 mm", value: "15" },
              { label: "17 mm", value: "17" }, { label: "19 mm", value: "19" }, { label: "21 mm", value: "21" },
              { label: "23 mm", value: "23" }
            ]
          },
          {
            id: "uchyceni_hlinik",
            name: "Výška Z držáku nerez",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["hlinik"] },
            options: [
              { label: "8 mm", value: "8" }, { label: "10 mm", value: "10" }, { label: "12 mm", value: "12" },
              { label: "14 mm", value: "14" }, { label: "16 mm", value: "16" }, { label: "18 mm", value: "18" },
              { label: "20 mm", value: "20" }, { label: "22 mm", value: "22" }, { label: "24 mm", value: "24" },
              { label: "30 mm", value: "30" }
            ]
          },
          {
            id: "posuvny_z_drzak",
            name: "Posuvný Z držák (pro hliníková okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["hlinik"] },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+68 Kč)", value: "ano", priceVariant: 68, priceType: "fixed" }
            ]
          },
          {
            id: "uchyceni_euro",
            name: "Způsob uchycení (pro EURO okna)",
            hint: "Při použití obrtlíku nebo pružinového kolíku je nutno vrtat do rámu okna.",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["euro"] },
            options: [
              { label: "Obrtlík", value: "obrtlik" },
              { label: "Pružinový kolík", value: "pruzinovy_kolik" }
            ]
          },
          {
            id: "provedeni_rohu_euro",
            name: "Provedení rohů (pro EURO okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["euro"] },
            options: [
              { label: "Vnější rohy (standard)", value: "vnejsi" },
              { label: "Vnitřní rohy (+ 89 Kč)", value: "vnitrni", priceVariant: 89, priceType: "fixed" }
            ]
          },
          {
            id: "provedeni_sikmina",
            name: "Provedení šikmina (pro plastová okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc"] },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+ 407 Kč)", value: "ano", priceVariant: 407, priceType: "fixed" }
            ]
          },
          {
            id: "okenni_pricka",
            name: "Okenní příčka (pro zpevnění nebo velká okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc", "euro"] },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+ 69 Kč / 85 Kč v RAL)", value: "ano" }
            ]
          },
          {
            id: "pocet_pricek",
            name: "Počet okenních příček",
            type: "select",
            condition: { dependsOnParamId: "okenni_pricka", allowedValues: ["ano"] },
            options: [
              { label: "1 příčka", value: "1" },
              { label: "2 příčky", value: "2" }
            ]
          },
          {
            id: "vyska_pricky_1",
            name: "Umístění 1. příčky",
            hint: "Výška od spodní hrany sítě na střed příčky v milimetrech (např. 800).",
            type: "text",
            condition: { dependsOnParamId: "okenni_pricka", allowedValues: ["ano"] }
          },
          {
            id: "vyska_pricky_2",
            name: "Umístění 2. příčky",
            hint: "Výška od spodní hrany sítě na střed druhé příčky v milimetrech.",
            type: "text",
            condition: { dependsOnParamId: "pocet_pricek", allowedValues: ["2"] }
          }
        ];

        // Ensure category exists
        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Sítě proti hmyzu'`);
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Sítě proti hmyzu', 1, '')`);
        }

        const title = "Okenní sítě proti hmyzu";
        const desc = "<p>Ochraňte svůj domov před obtížným hmyzem pomocí našich <strong>prémiových okenních sítí</strong>. Vyrobené přesně na míru vašim oknům, ať už se jedná o moderní plastová okna, klasická dřevěná EURO okna, nebo stylová hliníková okna s okapničkou. Naše přesně tvarované profily ISSO OE perfektně zapadnou do struktury vašeho okna a stanou se téměř neviditelnými.</p><p>Vybírat můžete z několika druhů odolných síťovin – od standardní přes transparentní, protipylovou až po nezničitelný Pet Screen pro vaše mazlíčky. Rámy v mnoha barevných provedeních, včetně přesných imitací dřeva a odstínů RAL, zajistí dokonalé splynutí s exteriérem vašeho domu. Instalace je díky chytrému systému uchycení velmi jednoduchá a nevyžaduje vrtání do rámu okna.</p>";
        const img = "/images/okenni_sit_cover.png"; 

        await db.query(
          `INSERT INTO "Product" 
            (title, slug, category, "desc", price, price_mode, validation_profile, img, parameters, supplier_markup_percent, commission_percent, dimension_constraints) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            "desc" = EXCLUDED."desc",
            img = EXCLUDED.img,
            price_mode = EXCLUDED.price_mode,
            validation_profile = EXCLUDED.validation_profile,
            parameters = EXCLUDED.parameters,
            dimension_constraints = EXCLUDED.dimension_constraints
          `,
          [
            title, slug, 'Sítě proti hmyzu', desc, 562, 
            'custom', 'sit_hmyz', img, 
            JSON.stringify(params), 0, 0, 
            JSON.stringify({ width_mm_min: 100, width_mm_max: 1800, height_mm_min: 100, height_mm_max: 1800 })
          ]
        );

        res.json({ success: true, message: 'Sítě proti hmyzu naimportovány!' });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  
  
  app.post("/api/admin/import-dverni-site", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const slug = 'dverni-site-proti-hmyzu';
        
        const params = [
          {
            id: "typ_dveri",
            name: "Typ dveřní sítě",
            hint: "Bez rámu se síť montuje přímo na rám dveří pomocí pantů. Verze 's rámem' obsahuje vlastní obvodový rám sítě, který se instaluje do otvoru (je tak stabilnější a vypadá velmi elegantně).",
            type: "color_array",
            options: [
              { label: "Jednokřídlé bez rámu (DE 50x20)", value: "bez_ramu_de50", hint: "Základní profil bez těsnicího kartáčku. Při zaměření je nutné počítat 25 mm na místo pro panty a 20 mm pro magnet.", img: "/images/icon_bez_ramu.png" },
              { label: "Jednokřídlé bez rámu (DE 50x20 LUX)", value: "bez_ramu_de50_lux", hint: "Vylepšená verze DE 50x20 s těsnicím kartáčkem. Při zaměření počítat 25 mm na panty a 20 mm pro magnet.", img: "/images/icon_bez_ramu.png" },
              { label: "Jednokřídlé bez rámu (DE 40x20 Lux)", value: "bez_ramu_de40", qapiRecommended: true, hint: "Oblíbená volba, pevnější profil 40x20. Poznámka: U provedení bez rámu je nutné při zaměření počítat 20 mm navíc pro panty a 15 mm pro magnet.", img: "/images/icon_bez_ramu.png" },
              { label: "Dvoukřídlé bez rámu (DE 40x20 Lux)", value: "bez_ramu_de40_dvou", hint: "U provedení bez rámu je nutné při zaměření počítat 20 mm navíc pro panty a 15 mm pro magnet.", img: "/images/icon_dvoukridla.png" },
              { label: "Jednokřídlé s rámem R3 (DE 40x20 Lux + R3)", value: "ram_r3_de40", hint: "Vlastní rám R3 je vhodný, pokud nechcete vrtat panty do rámu vlastních dveří.", img: "/images/icon_s_ramem.png" },
              { label: "Jednokřídlé s rámem R4 (DE 40x20 Lux + R4)", value: "ram_r4_de40", hint: "Vlastní rám R4 má širší lemování, ideální na hrubší fasádu.", img: "/images/icon_s_ramem.png" },
              { label: "Dvoukřídlé s rámem R3 (DE 40x20 Lux + R3)", value: "ram_r3_de40_dvou", hint: "Rám pro dvoukřídlé dveře je z důvodu přepravy dodáván v rozloženém stavu.", img: "/images/icon_dvoukridla.png" },
              { label: "Dvoukřídlé s rámem R4 (DE 40x20 Lux + R4)", value: "ram_r4_de40_dvou", hint: "Rám pro dvoukřídlé dveře je z důvodu přepravy dodáván v rozloženém stavu.", img: "/images/icon_dvoukridla.png" }
            ]
          },
          {
            id: "barva_profilu",
            name: "Barva profilu",
            hint: "Vyberte povrchovou úpravu.",
            type: "color_array",
            options: [
              { label: "Bílá RAL 9016 mat", value: "zaklad_bila", hex: "#ffffff", qapiRecommended: true },
              { label: "Hnědá RAL 8019 mat", value: "zaklad_hneda", hex: "#45322e" },
              { label: "RAL 7016 mat (Antracit)", value: "zaklad_7016", hex: "#383e42" },
              { label: "RAL 8003 mat (Zlatý dub)", value: "zaklad_8003", hex: "#8b5a2b" },
              { label: "RAL 9006 mat (Stříbrná)", value: "zaklad_9006", hex: "#a5a5a5" },
              { label: "RAL 7016 struktura / DB 703 (od + 155 Kč/m²)", value: "ral_struktura", hex: "#383e42" },
              { label: "Nestandardní lakování RAL (+ 1035 Kč/m²)", value: "ral_nestandard" },
              { label: "Lakování imitace dřeva (od + 354 Kč/m²)", value: "imitace_dreva", hex: "#8b5a2b" },
              { label: "Renolit jednostranně (od + 478 Kč/m²)", value: "renolit_jedno", hex: "#8b5a2b" },
              { label: "Renolit oboustranně (od + 641 Kč/m²)", value: "renolit_obou", hex: "#8b5a2b" }
            ]
          },
          {
            id: "rohy",
            name: "Spojovací rohy rámu",
            hint: "Hliníkové (Al) rohy výrazně prodlužují životnost celé konstrukce sítě oproti běžným plastovým rohům.",
            type: "select",
            options: [
              { label: "Standardní plastové (v ceně)", value: "plast" },
              { label: "Zpevněné hliníkové (+ 407 Kč / křídlo)", value: "al_rohy", qapiRecommended: true, hint: "Pevné hliníkové rohy doporučujeme pro každodenně používané dveřní sítě." }
            ]
          },
          {
            id: "sitovina_de50",
            name: "Typ síťoviny (Základní profil DE 50x20)",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            condition: { dependsOnParamId: "typ_dveri", allowedValues: ["bez_ramu_de50"] },
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá (+ 142 Kč/m²)", value: "transparentni", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá (+ 431 Kč/m²)", value: "protipylova", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá (+ 475 Kč/m²)", value: "petscreen_seda", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá (+ 475 Kč/m²)", value: "petscreen_cerna", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" }
            ]
          },
          {
            id: "sitovina_lux",
            name: "Typ síťoviny (Prémiové LUX profily)",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            condition: { dependsOnParamId: "typ_dveri", allowedValues: ["bez_ramu_de50_lux", "bez_ramu_de40", "bez_ramu_de40_dvou", "ram_r3_de40", "ram_r4_de40", "ram_r3_de40_dvou", "ram_r4_de40_dvou"] },
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá (+ 142 Kč/m²)", value: "transparentni", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá (+ 431 Kč/m²)", value: "protipylova", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá (+ 475 Kč/m²)", value: "petscreen_seda", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá (+ 475 Kč/m²)", value: "petscreen_cerna", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" },
              { label: "Síťovina s nanovláknem - černá (+ 1078 Kč/m²)", value: "nano", hint: "Revoluční nanovlákno zachytí i ty nejmenší částice smogu. Nejvyšší možná ochrana.", img: "/images/icon_sit_nano.png" }
            ]
          },
          {
            id: "panty_material",
            name: "Materiál pantů",
            hint: "Dveřní sítě se otevírají na pantech. Hliníkové (Al) panty mají delší životnost.",
            type: "select",
            options: [
              { label: "PVC (plastové)", value: "pvc" },
              { label: "Al (hliníkové) (+ 73 Kč/ks)", value: "al", qapiRecommended: true }
            ]
          },
          {
            id: "panty_pocet_standard",
            name: "Počet ks standardních pantů",
            hint: "Výrobce doporučuje mít na dveřích celkem minimálně 3 panty (standardní + samozavírací). První 2 ks PVC pantů jsou zdarma.",
            type: "select",
            options: [
              { label: "0 ks", value: "0" },
              { label: "1 ks", value: "1" },
              { label: "2 ks", value: "2", qapiRecommended: true },
              { label: "3 ks", value: "3" },
              { label: "4 ks", value: "4" },
              { label: "5 ks", value: "5" }
            ]
          },
          {
            id: "panty_pocet_samozaviraci",
            name: "Počet ks samozavíracích pantů",
            hint: "Samozavírací panty obsahují pružinu, díky které se dveře samy zaklapnou.",
            type: "select",
            options: [
              { label: "0 ks", value: "0", qapiRecommended: true },
              { label: "1 ks (+ 56 Kč PVC / 84 Kč Al)", value: "1" },
              { label: "2 ks (+ 112 Kč PVC / 168 Kč Al)", value: "2" },
              { label: "3 ks (+ 168 Kč PVC / 252 Kč Al)", value: "3" },
              { label: "4 ks (+ 224 Kč PVC / 336 Kč Al)", value: "4" },
              { label: "5 ks (+ 280 Kč PVC / 420 Kč Al)", value: "5" }
            ]
          },
          {
            id: "nytovani_pantu",
options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (zdarma)", value: "ano" }
            ]
          },
          {
            id: "strana_pantu_exterier",
            name: "Strana pantů (při pohledu z exteriéru)",
            type: "select",
            condition: { dependsOnParamId: "nytovani_pantu", allowedValues: ["ano"] },
            options: [
              { label: "Levá", value: "leva" },
              { label: "Pravá", value: "prava" }
            ]
          },
          {
            id: "prulez_zvire",
            name: "Průlez pro zvířata (černá)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Pro kočku 210x250 (+ 1199 Kč)", value: "kocka", priceVariant: 1199, priceType: "fixed" },
              { label: "Pro psa 310x340 (+ 1332 Kč)", value: "pes", priceVariant: 1332, priceType: "fixed" }
            ]
          },
          {
            id: "dverni_pricka_typ",
            name: "Dveřní příčka",
            type: "select",
            options: [
              { label: "Bez příčky", value: "bez_pricky" },
              { label: "1 ks - v 1/3 (standard)", value: "1ks_standard", qapiRecommended: true },
              { label: "1 ks - vlastní poloha", value: "1ks_vlastni" },
              { label: "2 ks - v 1/3 a ve 2/3 (standard)", value: "2ks_standard" },
              { label: "2 ks - vlastní polohy", value: "2ks_vlastni" }
            ]
          },
          {
            id: "pricka_poloha_1",
            name: "Poloha 1. příčky (mm odspodu)",
            type: "number",
            condition: { dependsOnParamId: "dverni_pricka_typ", allowedValues: ["1ks_vlastni", "2ks_vlastni"] }
          },
          {
            id: "pricka_poloha_2",
            name: "Poloha 2. příčky (mm odspodu)",
            type: "number",
            condition: { dependsOnParamId: "dverni_pricka_typ", allowedValues: ["2ks_vlastni"] }
          },
          {
            id: "magnet",
            name: "Magnet",
            type: "select",
            options: [
              { label: "Standardní magnet (v ceně)", value: "standard" },
              { label: "Magnetická guma / pásek po celé výšce (od + 71 Kč/bm)", value: "cely_profil" }
            ]
          },
          {
            id: "madlo_navic",
            name: "Madlo navíc (ks)",
            type: "select",
            options: [
              { label: "0 ks", value: "0" },
              { label: "1 ks (+24 Kč)", value: "1", priceVariant: 24, priceType: "fixed" },
              { label: "2 ks (+48 Kč)", value: "2", priceVariant: 48, priceType: "fixed" },
              { label: "3 ks (+72 Kč)", value: "3", priceVariant: 72, priceType: "fixed" }
            ]
          },
          {
            id: "okopova_pricka",
            name: "Okopová příčka ve spodní části",
            hint: "Okopová příčka je širší hliníkový profil umístěný úplně dole. Zabraňuje tomu, abyste do sítě omylem kopli nohou při otevírání.",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (od + 169 Kč/bm šířky)", value: "ano", qapiRecommended: true, hint: "Velmi doporučujeme, zvláště pokud máte doma děti. Cena se přesně odvíjí od barvy a šířky dveří." }
            ]
          },
          {
            id: "prulez_zvire",
            name: "Průlez pro zvířata (černá)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Pro kočku 210x250 (+ 1199 Kč)", value: "kocka", priceVariant: 1199, priceType: "fixed" },
              { label: "Pro psa 310x340 (+ 1332 Kč)", value: "pes", priceVariant: 1332, priceType: "fixed" }
            ]
          },
          {
            id: "profil_s_kartackem",
            name: "Profil s kartáčkem (vodorovně/svisle)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+ 63 Kč/bm šířky)", value: "ano" }
            ]
          }
        ];

        // Ensure category exists
        const catRes = await db.query(`SELECT name FROM "Category" WHERE name = 'Sítě proti hmyzu'`);
        if (catRes.rows.length === 0) {
            await db.query(`INSERT INTO "Category" (name, count, img) VALUES ('Sítě proti hmyzu', 1, '')`);
        }

        const title = "Dveřní sítě proti hmyzu";
        const desc = "<p>Přizpůsobte si <strong>dveřní sítě proti hmyzu</strong> na míru a zbavte se nechtěných návštěvníků. Nabízíme vysoce kvalitní modely s rámem (luxusní provedení pro vyšší stabilitu a exkluzivní vzhled) i odlehčené varianty bez rámu, ideální pro čistý a nenápadný design.</p><p>K dispozici jsou špičkové profily <strong>DE 50x20</strong> a vylepšené prémie <strong>DE 40x20 Lux</strong>. Naše sítě poskytují naprosto plynulý chod, precizní magnetické dovírání a dlouholetou životnost i při každodenním náročném užívání. Zvolit si můžete standardní odolnou síťovinu, protipylové varianty pro alergiky nebo speciální transparentní verzi, která téměř není vidět. Obrovskou volnost máte také ve výběru povrchové úpravy od základu až po precizní imitaci dřeva či elegantní perleťové laky.</p>";
        const img = "/images/dverni_sit_cover.png"; 

        await db.query(
          `INSERT INTO "Product" 
            (title, slug, category, "desc", price, price_mode, validation_profile, img, parameters, supplier_markup_percent, commission_percent, dimension_constraints) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            "desc" = EXCLUDED."desc",
            img = EXCLUDED.img,
            price_mode = EXCLUDED.price_mode,
            validation_profile = EXCLUDED.validation_profile,
            parameters = EXCLUDED.parameters,
            dimension_constraints = EXCLUDED.dimension_constraints
          `,
          [
            title, slug, 'Sítě proti hmyzu', desc, 1474, 
            'custom', 'dverni_sit', img, 
            JSON.stringify(params), 0, 0, 
            JSON.stringify({ width_mm_min: 100, width_mm_max: 2000, height_mm_min: 100, height_mm_max: 2500 })
          ]
        );

        res.json({ success: true, message: 'Dveřní sítě naimportovány!' });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.post("/api/admin/categories", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { name, count, img } = req.body;
        const result = await db.query(
          'INSERT INTO "Category" (name, count, img) VALUES ($1, $2, $3) RETURNING *',
          [name, count, img]
        );
        res.json(result.rows[0]);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  // DB DIAGNOSTICS & REPAIR API
  app.get("/api/admin/db-check", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const missing = { tables: [] as string[], columns: [] as string[] };
        
        // Check tables
        const requiredTables = ["Category", "FabricGroup", "Product", "ProductPriceBracket", "ProductHeightPriceTier", "Order", "OrderItem", "Customer", "MeasureGuideSection", "Image", "StoreSettings", "CustomerReview"];
        for (const t of requiredTables) {
          const tRes = await db.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)', [t]);
          if (!tRes.rows[0].exists) missing.tables.push(t);
        }

        // Check columns in Product
        const requiredProductColumns = [
          "supplier_markup_percent", "commission_percent", "width_mm_min", "width_mm_max", "height_mm_min", "height_mm_max",
          "max_area_m2", "price_mode", "fabric_group", "validation_profile", "hidden", "gallery", "colors", "fabric_groups_config",
          "extras", "parameters", "slug"
        ];
        
        const cRes = await db.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', ['Product']);
        const existingColumns = cRes.rows.map(r => r.column_name);
        
        for (const c of requiredProductColumns) {
          if (!existingColumns.includes(c)) missing.columns.push(`Product.${c}`);
        }

        res.json({
          status: missing.tables.length === 0 && missing.columns.length === 0 ? "ok" : "issues_found",
          missing
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.post("/api/admin/db-fix", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const results: string[] = [];
        const errors: string[] = [];
        
        const executeQuery = async (sql: string, description: string) => {
          try {
            await db.query(sql);
            results.push(`SUCCESS: ${description}`);
          } catch (e: any) {
            errors.push(`FAILED: ${description} - ${e.message}`);
          }
        };

        await executeQuery(`CREATE TABLE IF NOT EXISTS "StoreSettings" (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB DEFAULT '{}'::jsonb)`, 'Create StoreSettings');
        await executeQuery(`CREATE TABLE IF NOT EXISTS "CustomerReview" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 5, city TEXT, content TEXT NOT NULL, image_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, 'Create CustomerReview');
        
        // Init StoreSettings if empty
        const defaultBanners = JSON.stringify({ banners: [], recommendedProducts: [] });
        await executeQuery(`INSERT INTO "StoreSettings" (id, data) VALUES (1, '${defaultBanners}') ON CONFLICT DO NOTHING`, 'Init StoreSettings');

        const alters = [
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS price_mode VARCHAR(32) DEFAULT 'matrix_cell'`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_group INTEGER`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS validation_profile VARCHAR(32)`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_groups_config JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '[]'::jsonb`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS dimension_constraints JSONB DEFAULT NULL`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS is_action BOOLEAN DEFAULT FALSE`,
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE`
        ];

        for (const sql of alters) {
          const colName = sql.split('EXISTS ')[1].split(' ')[0];
          await executeQuery(sql, `Add column ${colName} to Product`);
        }

        // Indexes
        await executeQuery(`CREATE INDEX IF NOT EXISTS "ProductHeightPriceTier_product_id_idx" ON "ProductHeightPriceTier" (product_id)`, 'Index ProductHeightPriceTier');
        await executeQuery(`CREATE INDEX IF NOT EXISTS "ProductPriceBracket_product_id_idx" ON "ProductPriceBracket" (product_id)`, 'Index ProductPriceBracket');
        await executeQuery(`CREATE INDEX IF NOT EXISTS "OrderItem_order_id_idx" ON "OrderItem" (order_id)`, 'Index OrderItem');

        // Slugs fix
        await executeQuery(`UPDATE "Product" SET slug = substring(md5(random()::text) from 1 for 16) WHERE slug IS NULL`, 'Fix empty slugs');

        res.json({
          status: errors.length === 0 ? "success" : "partial_success",
          results,
          errors
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // STORE SETTINGS API
  app.get("/api/store-settings", async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query('SELECT data FROM "StoreSettings" WHERE id = 1');
        if (result.rows.length > 0) {
          res.json(result.rows[0].data);
        } else {
          res.json({ banners: [], recommendedProducts: [] });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.post("/api/admin/store-settings", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const data = req.body;
        await db.query(
          'UPDATE "StoreSettings" SET data = $1 WHERE id = 1',
          [JSON.stringify(data)]
        );
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // CUSTOMER REVIEWS API
  app.get("/api/reviews", async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const result = await db.query('SELECT * FROM "CustomerReview" ORDER BY sort_order ASC, created_at DESC');
        res.json(result.rows);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.post("/api/admin/reviews", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { name, rating, city, content, image_url, sort_order } = req.body;
        const result = await db.query(
          `INSERT INTO "CustomerReview" (name, rating, city, content, image_url, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [name, rating, city, content, image_url, sort_order || 0]
        );
        res.json(result.rows[0]);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.put("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { name, rating, city, content, image_url, sort_order } = req.body;
        const result = await db.query(
          `UPDATE "CustomerReview"
           SET name = $1, rating = $2, city = $3, content = $4, image_url = $5, sort_order = $6
           WHERE id = $7 RETURNING *`,
          [name, rating, city, content, image_url, sort_order || 0, req.params.id]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: "Review not found" });
          return;
        }
        res.json(result.rows[0]);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        await db.query('DELETE FROM "CustomerReview" WHERE id = $1', [req.params.id]);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.put("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { id } = req.params;
        const { name, count, img } = req.body;
        const result = await db.query(
          'UPDATE "Category" SET name=$1, count=$2, img=$3 WHERE id=$4 RETURNING *',
          [name, count, img, id]
        );
        res.json(result.rows[0]);
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { id } = req.params;
        await db.query('DELETE FROM "Category" WHERE id=$1', [id]);
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.get("/api/fabric-groups", async (req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "Missing DATABASE_URL" });
    }
    await withDb(res, async (db) => {
      try {
        const result = await db.query('SELECT * FROM "FabricGroup"');
        res.json(result.rows);
      } catch {
        res.json([]);
      }
    });
  });

  app.post("/api/admin/fabric-groups", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { name, surcharge, colors } = req.body;
        const result = await db.query(
          'INSERT INTO "FabricGroup" (name, surcharge, colors) VALUES ($1, $2, $3) RETURNING *',
          [name, surcharge || 0, JSON.stringify(colors || [])]
        );
        res.json(result.rows[0]);
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/fabric-groups/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { id } = req.params;
        const { name, surcharge, colors } = req.body;
        const result = await db.query(
          'UPDATE "FabricGroup" SET name=$1, surcharge=$2, colors=$3 WHERE id=$4 RETURNING *',
          [name, surcharge || 0, JSON.stringify(colors || []), id]
        );
        res.json(result.rows[0]);
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.delete("/api/admin/fabric-groups/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const { id } = req.params;
        await db.query('DELETE FROM "FabricGroup" WHERE id=$1', [id]);
        res.json({ success: true });
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  registerMeasureGuideRoutes(app, withDb, requireAdmin, clipStr);

  app.get("/produkt/:slug", async (req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    await withDb(res, async (db) => {
      try {
        const { slug } = req.params;
        const result = await db.query('SELECT * FROM "Product" WHERE slug = $1 AND hidden = false', [slug]);
        const product = result.rows[0];
        
        const distPath = path.join(process.cwd(), "dist", "index.html");
        if (!fs.existsSync(distPath)) return next();
        
        let html = fs.readFileSync(distPath, "utf-8");
        
        if (product) {
          const ogTitle = `${product.title} | E-shop Qapi`;
          const ogDesc = product.desc ? product.desc.replace(/<[^>]+>/g, '').substring(0, 150) + '...' : '';
          const ogImage = product.img || '';
          
          const ogTags = `
            <title>${ogTitle}</title>
            <meta name="description" content="${ogDesc}" />
            <meta property="og:title" content="${ogTitle}" />
            <meta property="og:description" content="${ogDesc}" />
            <meta property="og:image" content="${ogImage}" />
            <meta property="og:type" content="product" />
            <meta property="og:url" content="https://roleta-qapi.cz/produkt/${slug}" />
          `;
          html = html.replace('</head>', `${ogTags}</head>`);
        }
        res.send(html);
      } catch (err) {
        next();
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else {
          // Cache static assets for 1 year since they have content hashes
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();



