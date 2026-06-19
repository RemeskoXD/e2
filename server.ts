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
import { mapProductRow, num, optIntCol, optStrCol, parseDimBody } from "./product-row";
import { computeProductQuote } from "./quote-compute";
import { sendOrderEmails } from "./order-email";
import { registerMeasureGuideRoutes } from "./server-measure-guide";

import { seedIsoline } from "./seed-isoline";

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
  ]) {
    await db.query(sql).catch(() => {});
  }

  await runSafe(`
    CREATE TABLE IF NOT EXISTS "OrderItem" (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES "Product"(id),
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
    const token = req.headers.authorization?.split(" ")[1];
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
        }

        const orderNo = `Q-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const orderIns = await client.query(
          `INSERT INTO "Order" (order_no, customer_name, total_amount, status, items_count, customer_email, customer_phone, customer_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            orderNo,
            name,
            totalAmount,
            "Nová",
            itemsCount,
            email || null,
            phone || null,
            note || null,
          ]
        );
        const orderId = orderIns.rows[0].id as number;

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
        res.status(201).json({ order: orderIns.rows[0], order_no: orderNo });
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

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        const status =
          req.body?.status != null ? String(req.body.status).trim() : "";
        if (!Number.isFinite(id) || id < 1 || !status) {
          res.status(400).json({ error: "Neplatný požadavek" });
          return;
        }
        const r = await db.query(
          'UPDATE "Order" SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );
        if (!r.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );
        res.json({ ...(r.rows[0] as Record<string, unknown>), items: items.rows });
      } catch {
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

        const result = await db.query(
          `INSERT INTO "Product" (title, category, price, "oldPrice", badge, img, "desc", supplier_markup_percent, commission_percent,
            width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2, price_mode, fabric_group, validation_profile, hidden, gallery, colors, fabric_groups_config, extras, parameters, slug)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
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

        const result = await db.query(
          `UPDATE "Product" SET title=$1, category=$2, price=$3, "oldPrice"=$4, badge=$5, img=$6, "desc"=$7,
            supplier_markup_percent=$9, commission_percent=$10,
            width_mm_min=$11, width_mm_max=$12, height_mm_min=$13, height_mm_max=$14, max_area_m2=$15,
            price_mode=$16, fabric_group=$17, validation_profile=$18, hidden=$19, gallery=$20, colors=$21, fabric_groups_config=$22, extras=$23, parameters=$24, slug=$25
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
`;

        const widths = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200];
        
        const params = [
          {
            id: "provedeni",
            name: "Provedení",
            type: "select",
            options: [
              { label: "Standardní", value: "standard", priceVariant: 0, priceType: "fixed" },
              { label: "Domykatelné (Celostín)", value: "domykatelne", priceVariant: 33, priceType: "per_m2" }
            ]
          },
          {
            id: "lamela",
            name: "Typ a barva lamel",
            type: "select",
            options: [
              { label: "Základní barvy (lamela 25 x 0.18)", value: "zakladni", priceVariant: 0, priceType: "fixed" },
              { label: "Lamela 16 mm (základní barvy)", value: "l16", priceVariant: 74, priceType: "per_m2" },
              { label: "Barvy 780, 783, 1940, 8005, 8101, 8300, 8204, 8107", value: "color_group_1", priceVariant: 87, priceType: "per_m2" },
              { label: "Perforované lamely", value: "perforovane", priceVariant: 76, priceType: "per_m2" },
              { label: "Lamela 25x0.21 (vybrané barvy)", value: "l25_group1", priceVariant: 74, priceType: "per_m2" },
              { label: "Lamela 25x0.21 (SR/SM skupina)", value: "l25_group2", priceVariant: 207, priceType: "per_m2" },
              { label: "Imitace dřeva", value: "drevo", priceVariant: 169, priceType: "per_m2" },
              { label: "Imitace dřeva (v domykatelném provedení)", value: "drevo_domykatelne", priceVariant: 267, priceType: "per_m2" }
            ]
          },
          {
            id: "profil",
            name: "Barva profilů (horní a dolní)",
            type: "select",
            options: [
              { label: "Základní sladění (RAL 9010, atd.)", value: "zakladni", priceVariant: 0, priceType: "fixed" },
              { label: "Profily Al (pouze Isoline)", value: "al_isoline", priceVariant: 77, priceType: "per_m2" },
              { label: "Profily Al v RAL", value: "al_ral", priceVariant: 147, priceType: "per_bm" },
              { label: "Profily Al v imitaci dřeva", value: "al_drevo", priceVariant: 131, priceType: "per_bm" },
              { label: "Profily Fe v imitaci dřeva", value: "fe_drevo", priceVariant: 131, priceType: "per_bm" }
            ]
          },
          {
            id: "typ_listy",
            name: "Typ krycí lišty",
            type: "select",
            options: [
              { label: "Isoline (standardní plochý profil)", value: "isoline", priceVariant: 0, priceType: "fixed" },
              { label: "Isoline Loco (oblouková krycí lišta)", value: "loco", priceVariant: 0, priceType: "fixed" },
              { label: "Isoline Loco v imitaci dřeva", value: "loco_drevo", priceVariant: 87, priceType: "per_bm" }
            ]
          },
          {
            id: "podlozka",
            name: "Distanční podložka",
            type: "select",
            options: [
              { label: "Bez podložky", value: "0", priceVariant: 0, priceType: "fixed" },
              { label: "1 pár podložek (< 14 mm zaskl. lišta)", value: "1", priceVariant: 12, priceType: "fixed" },
              { label: "2 páry podložek (< 10 mm zaskl. lišta)", value: "2", priceVariant: 24, priceType: "fixed" }
            ]
          },
          {
            id: "bezpecnost",
            name: "Bezpečnostní prvek",
            type: "select",
            options: [
              { label: "Ne", value: "ne", priceVariant: 0, priceType: "fixed" },
              { label: "Ano", value: "ano", priceVariant: 12, priceType: "fixed" }
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
            parameters, gallery, colors, extras, fabric_groups_config, price_mode, hidden
          ) VALUES (
            $1, $2, $3, $4, null, $5, $6, $7,
            4.9, 0,
            200, 2200, 300, 2200, 2.4,
            $8, '[]', '[]', '[]', '[]', 'matrix_cell', false
          )
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            "desc" = EXCLUDED."desc",
            parameters = EXCLUDED.parameters,
            price_mode = 'matrix_cell'
          RETURNING id
        `, [
          "Horizontální žaluzie Isoline",
          "horizontalni-zaluzie-isoline",
          category,
          263,
          "",
          "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600&auto=format&fit=crop",
          "<p>Základní ceníková sestava: horní profil 42.5x25.6x25mm, válcovaný pozink plech. Sdružené řetízkové ovládání.</p>",
          JSON.stringify(params)
        ]);

        const productId = pRes.rows[0].id;

        await db.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);

        const lines = rawMatrix.trim().split('\\n');
        let brackets = [];
        for (const line of lines) {
          const parts = line.trim().split(/\\s+/).map(Number);
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
      } catch (e: any) {
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
        await executeQuery(`UPDATE "Product" SET slug = encode(gen_random_bytes(8), 'hex') WHERE slug IS NULL`, 'Fix empty slugs');

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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
