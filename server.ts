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
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS dimension_constraints JSONB DEFAULT NULL`,
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
          `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS dimension_constraints JSONB DEFAULT NULL`,
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
2300 494 552 616 666 753 812 872 979 1027 1088 1157 1273 1331 1392 1464 1507 1546 1684 1811 1929
2400 505 559 633 680 768 833 896 1012 1051 1118 1197 1305 1370 1431 1514 1549 1578 1729 1882 1995
`;

        const widths = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200];
        
        const params = [
          {
            id: "typ_profilu",
            name: "Typ profilu",
            type: "color_array",
            options: [
              { label: "Isoline (Rovný profil)", value: "isoline", img: "/images/icon_isoline_rovny.png", hint: "Klasický hranatý profil s možností hliníkového provedení či lakování do RAL." },
              { label: "Isoline PRIM (Obloukový profil)", value: "prim", img: "/images/icon_isoline_prim.png", qapiRecommended: true, hint: "Moderní zaoblený design profilu." }
            ]
          },
          {
            id: "lamela_typ",
            name: "Design a typ lamel",
            hint: "Vyberte si šířku a povrchovou úpravu hliníkových lamel.",
            type: "select",
            options: [
              { label: "Základní barvy (lamela 25x0.18 mm)", value: "std_zaklad", priceVariant: 0, priceType: "per_m2" },
              { label: "Lamela 16 mm", value: "std_l16", priceVariant: 74, priceType: "per_m2" },
              { label: "Lamela 25x0.21 mm (Skupina 1)", value: "std_l25_g1", priceVariant: 74, priceType: "per_m2", hint: "Čísla: 101-155, 211-265, 311-371, 700, 714" },
              { label: "Lamela 25x0.21 mm (Skupina 2)", value: "std_l25_g2", priceVariant: 207, priceType: "per_m2", hint: "Čísla: SR 621-630, SM 801-869" },
              { label: "Speciální barvy (Skupina 3)", value: "std_barva_ex", priceVariant: 87, priceType: "per_m2", hint: "Čísla: 780, 783, 1940, 8005, 8101, 8300, 8204, 8107" },
              { label: "Perforované lamely", value: "std_perf", priceVariant: 76, priceType: "per_m2", hint: "Dírkované lamely propouštějící část světla (PR1, PR58, PR61, PR103, PR285)" },
              { label: "Imitace dřeva", value: "std_drevo", priceVariant: 169, priceType: "per_m2" }
            ]
          },
          {
            id: "celostin",
            name: "Domykatelné provedení (Celostín)",
            hint: "U domykatelné žaluzie je po dovření lamel minimalizován prostup světla. Otvory pro strunu jsou schované.",
            type: "select",
            options: [
              { label: "Ne (Standardní)", value: "ne" },
              { label: "Ano (Celostín)", value: "ano" }
            ]
          },
          {
            id: "barva_profilu_isoline",
            name: "Materiál a barva profilu (Isoline)",
            type: "select",
            condition: {
              dependsOnParamId: "typ_profilu",
              allowedValues: ["isoline"]
            },
            options: [
              { label: "Základní (dle vzorníku)", value: "zakladni", priceVariant: 0, priceType: "fixed" },
              { label: "Hliníkový profil (Al)", value: "al_isoline", priceVariant: 77, priceType: "per_m2" },
              { label: "Hliníkový profil (Al) lakovaný v RAL", value: "al_ral", priceVariant: 147, priceType: "per_bm" },
              { label: "Hliníkový profil (Al) v imitaci dřeva", value: "al_drevo", priceVariant: 131, priceType: "per_bm" },
              { label: "Železný profil (Fe) v imitaci dřeva", value: "fe_drevo", priceVariant: 131, priceType: "per_bm" }
            ]
          },
          {
            id: "barva_profilu_prim",
            name: "Materiál a barva profilu (PRIM)",
            type: "select",
            condition: {
              dependsOnParamId: "typ_profilu",
              allowedValues: ["prim"]
            },
            options: [
              { label: "Základní (dle vzorníku)", value: "zakladni", priceVariant: 0, priceType: "fixed" },
              { label: "Imitace dřeva", value: "prim_drevo", priceVariant: 131, priceType: "per_bm" }
            ]
          },
          {
            id: "ovladani_prim",
            name: "Ovládání",
            type: "select",
            condition: {
              dependsOnParamId: "typ_profilu",
              allowedValues: ["prim"]
            },
            options: [
              { label: "Standardní řetízek (bez brzdy)", value: "std", priceVariant: 0, priceType: "fixed" },
              { label: "S brzdou (poměr 1:1)", value: "brzda", priceVariant: 34, priceType: "fixed" }
            ]
          },
          {
            id: "podlozka",
            name: "Distanční podložka",
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
          "Horizontální žaluzie Isoline & PRIM",
          "horizontalni-zaluzie-isoline-prim-merged",
          category,
          263,
          "",
          "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600&auto=format&fit=crop",
          `<h3>Základní ceníková sestava</h3><p>Tento produkt kombinuje dva nejoblíbenější typy horizontálních žaluzií - s rovným profilem (Isoline) i luxusním obloukovým (PRIM). Obě varianty jsou interiérové, ovládané řetízkem a s fixací silonovou strunou.</p><ul><li><strong>Isoline:</strong> Rovný profil 42,5 x 25,6 mm, max. plocha 2.4 m²</li><li><strong>Isoline PRIM:</strong> Obloukový profil 47,3 x 24 mm, max. plocha 2.4 m²</li></ul><br /><h3>Technické detaily a provedení</h3><p><strong>Domykatelné provedení (Celostín):</strong> Žaluzie, u které je po dovření lamel minimalizován prostup světla. Otvory pro textilní pásku a fixační strunu jsou umístěny excentricky (nelze použít s 16 mm lamelou).</p><p><strong>Vyměření:</strong> Výrobní šířka a výška je vždy rozměr mezi zasklívacími lištami. Při mělké zasklívací liště je nutné použít distanční podložky pod koncovky.</p><p><em>DŮLEŽITÉ UPOZORNĚNÍ: E-shop vás automaticky upozorní, pokud vaše rozměry přesáhnou standardní limity pro zvolený typ profilu.</em></p>`,
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
            id: "barva_profilu",
            name: "Barva boxu a vodících lišt",
            hint: "Sladění barvy profilu s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "barva_retizku",
            name: "Barva řetízku",
            hint: "Vyberte barvu ovládacího řetízku tak, aby ladila s profilem nebo látkou.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Šedá", value: "seda", hex: "#a9a9a9", priceVariant: 0, priceType: "fixed" }
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
            id: "barva_profilu",
            name: "Barva boxu a vodících lišt",
            type: "select",
            options: [
              { label: "Bílá", value: "bila", priceVariant: 0, priceType: "fixed" },
              { label: "Hnědá", value: "hneda", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "barva_retizku",
            name: "Barva řetízku a závaží",
            type: "select",
            options: [
              { label: "Bílá / transparentní", value: "bila", priceVariant: 0, priceType: "fixed" },
              { label: "Hnědá / transparentní", value: "hneda", priceVariant: 0, priceType: "fixed" },
              { label: "Šedá / transparentní", value: "seda", priceVariant: 0, priceType: "fixed" }
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
            id: "barva_profilu",
            name: "Barva boxu a vodících lišt",
            hint: "Sladění barvy profilu s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "barva_retizku",
            name: "Barva řetízku",
            hint: "Vyberte barvu ovládacího řetízku tak, aby ladila s profilem nebo látkou.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Šedá", value: "seda", hex: "#a9a9a9", priceVariant: 0, priceType: "fixed" }
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

        const optimaDenNocParams = [
          {
            id: "barva_profilu",
            name: "Barva boxu a vodících lišt",
            hint: "Sladění barvy profilu s vaším oknem zajistí elegantní vzhled.",
            type: "color_array",
            options: [
              { label: "Bílá", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Stříbrná", value: "stribrna", hex: "#a5a5a5", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "delka_retizku",
            name: "Délka řetízku",
            type: "select",
            options: [
              { label: "30 cm", value: "30", priceVariant: 0, priceType: "fixed" },
              { label: "50 cm", value: "50", priceVariant: 0, priceType: "fixed" },
              { label: "75 cm", value: "75", priceVariant: 0, priceType: "fixed" },
              { label: "100 cm", value: "100", priceVariant: 0, priceType: "fixed" },
              { label: "125 cm", value: "125", priceVariant: 0, priceType: "fixed" },
              { label: "150 cm", value: "150", priceVariant: 0, priceType: "fixed" },
              { label: "175 cm", value: "175", priceVariant: 0, priceType: "fixed" }
            ]
          },
          {
            id: "barva_retizku",
            name: "Barva řetízku a závaží",
            hint: "Vyberte barvu ovládacího řetízku tak, aby ladila s profilem.",
            type: "color_array",
            options: [
              { label: "Bílá / transparentní", value: "bila", hex: "#ffffff", priceVariant: 0, priceType: "fixed", qapiRecommended: true },
              { label: "Hnědá / transparentní", value: "hneda", hex: "#45322e", priceVariant: 0, priceType: "fixed" },
              { label: "Šedá / transparentní", value: "seda", hex: "#a9a9a9", priceVariant: 0, priceType: "fixed" }
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

  
  app.post("/api/admin/import-plise-lagarta", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const slug = 'plise-zaluzie-lagarta';
        
        const m = require('./scratch-matrices.js');

        const fabricGroups = [
          { 
            name: "Cenová skupina 1 (Basic, Basic Reflex FR)", surcharge_percent: 0, matrix: m.g1, 
            colors: [
              { name: "Bílá", hex: "#ffffff" },
              { name: "Krémová", hex: "#fffdd0" },
              { name: "Béžová", hex: "#f5f5dc" },
              { name: "Světle šedá", hex: "#d3d3d3" },
              { name: "Tmavě šedá", hex: "#a9a9a9" },
              { name: "Antracit", hex: "#3b3c36" }
            ] 
          },
          { 
            name: "Cenová skupina 2 (Basic Semi, Stripes, Wood, Press Reflex)", surcharge_percent: 0, matrix: m.g2, 
            colors: [
              { name: "Wood Oak (Imitace dřeva)", hex: "#dfc19c" },
              { name: "Wood Walnut", hex: "#8b5a2b" },
              { name: "Stripes White", hex: "#f8f8f8" },
              { name: "Stripes Grey", hex: "#b0b0b0" },
              { name: "Sand", hex: "#c2b280" }
            ] 
          },
          { 
            name: "Cenová skupina 3 (Bamboo, Living, Basic Blackout, Honeycomb)", surcharge_percent: 0, matrix: m.g3, 
            colors: [
              { name: "Bamboo Natural", hex: "#e3dac9" },
              { name: "Bamboo Dark", hex: "#6b4423" },
              { name: "Blackout Bílá", hex: "#f0f0f0" },
              { name: "Blackout Šedá", hex: "#808080" },
              { name: "Honeycomb Bílá", hex: "#fdfdfd" },
              { name: "Honeycomb Béžová", hex: "#e8d3a2" }
            ] 
          },
          { 
            name: "Cenová skupina 4 (Zebra, Grass, Parquet)", surcharge_percent: 0, matrix: m.g4, 
            colors: [
              { name: "Zebra (Pruhovaná)", hex: "#555555" },
              { name: "Grass (Svěží zelená)", hex: "#8fbc8f" },
              { name: "Grass (Přírodní písková)", hex: "#d2b48c" },
              { name: "Parquet Brown", hex: "#855e42" }
            ] 
          },
          { 
            name: "Cenová skupina 5 (Bamboo Pearl, Shine, Wave, Sparkle)", surcharge_percent: 0, matrix: m.g5, 
            colors: [
              { name: "Pearl White", hex: "#eae0c8" },
              { name: "Shine Silver", hex: "#c0c0c0" },
              { name: "Wave Blue", hex: "#add8e6" },
              { name: "Sparkle Gold", hex: "#d4af37" },
              { name: "Sparkle Black", hex: "#222222" }
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
              { label: "PM3M", value: "PM3M", priceVariant: 200, priceType: "fixed", hint: "Model s pohodlnými magnety.", img: "/images/icon_pm2.png" },
              { label: "PM4", value: "PM4", hint: "Základní 'Den a Noc'. Nahoře i dole upevněno, mezi tím dvě látky.", img: "/images/icon_den_noc.png" },
              { label: "PM5", value: "PM5", hint: "Nejflexibilnější 'Den a Noc'. Plave na okně a obsahuje dvě látky.", img: "/images/icon_den_noc.png" },
              { label: "PP1", value: "PP1", priceVariant: 255, priceType: "fixed", hint: "Zavěšené na lanku.", img: "/images/icon_pm1.png" },
              { label: "PP2", value: "PP2", priceVariant: 425, priceType: "fixed", hint: "Zavěšené na lanku (obousměrně stahovací).", img: "/images/icon_pm2.png" },
              { label: "PS3", value: "PS3", hint: "Speciálně navrženo do střešních oken s vodicími lištami.", img: "/images/icon_ps3.png" },
              { label: "AM1", value: "AM1", priceVariant: 1079, priceType: "fixed", hint: "Atypický tvar (jednostranný úkos).", img: "/images/icon_am1.png" },
              { label: "AM2", value: "AM2", priceVariant: 1733, priceType: "fixed", hint: "Atypický tvar (oboustranný úkos).", img: "/images/icon_am2.png" },
              { label: "AP1", value: "AP1", priceVariant: 1079, priceType: "fixed", hint: "Atypický tvar v šikmině.", img: "/images/icon_ap1.png" }
            ]
          },
          {
            id: "barva_profilu",
            name: "Barva profilu",
            hint: "Sladění profilu s rámem vašeho okna je základem dokonalého designu. Standardní barvy jsou bez příplatku. Imitace dřeva a lakování RAL jsou za příplatek.",
            type: "color_array",
            options: [
              { label: "Bílá (RAL 9016)", value: "bila", hex: "#ffffff", qapiRecommended: true },
              { label: "Krémová (RAL 1015)", value: "kremova", hex: "#e6d6b8" },
              { label: "Hnědá (RAL 8017)", value: "hneda", hex: "#45322e" },
              { label: "Stříbrná (RAL 9006)", value: "stribrna", hex: "#a5a5a5" },
              { label: "Antracit (RAL 7016)", value: "antracit", hex: "#383e42" },
              { label: "Černá (RAL 9005)", value: "cerna", hex: "#111111" },
              { label: "Imitace dřeva (zlatý dub, ořech, winchester)", value: "imitace", priceVariant: 300, priceType: "fixed", hex: "#8b5a2b", hint: "Přesný odstín imitace s vámi doladíme po objednávce." },
              { label: "Vlastní lakování RAL", value: "ral", hint: "Můžete si vybrat jakoukoliv barvu ze vzorníku RAL. Kód RAL prosím uveďte do poznámky." }
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
            id: "barva_profilu_pvc",
            name: "Barva rámu",
            type: "color_array",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc"] },
            options: [
              { label: "Bílá RAL 9016 mat", value: "bila", hex: "#ffffff" },
              { label: "Hnědá RAL 8019 mat", value: "hneda", hex: "#45322e" },
              { label: "RAL 7016 mat (Antracit)", value: "ral_7016", hex: "#383e42" },
              { label: "RAL 8003 mat (Zlatý dub)", value: "ral_8003", hex: "#8b5a2b" },
              { label: "RAL 9006 mat (Stříbrná)", value: "ral_9006", hex: "#a5a5a5" },
              { label: "ELOX champagne", value: "elox", hex: "#fad6a5", priceVariant: 71, priceType: "per_m2" },
              { label: "RAL 7016 struktura / DB 703", value: "ral_struktura", hex: "#383e42", priceVariant: 57, priceType: "per_m2" },
              { label: "Nestandardní lakování RAL", value: "ral_nestandard", priceVariant: 382, priceType: "per_m2" },
              { label: "Nástřik imitace dřeva", value: "imitace_nástrik", hex: "#8b5a2b", priceVariant: 162, priceType: "per_m2" },
              { label: "Renolit jednostranně", value: "renolit_jedno", hex: "#8b5a2b", priceVariant: 301, priceType: "per_m2" },
              { label: "Renolit oboustranně", value: "renolit_obou", hex: "#8b5a2b", priceVariant: 528, priceType: "per_m2" }
            ]
          },
          {
            id: "barva_profilu_euro",
            name: "Barva rámu",
            type: "color_array",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["euro"] },
            options: [
              { label: "Bílá RAL 9016 mat", value: "bila", hex: "#ffffff" },
              { label: "Hnědá RAL 8019 mat", value: "hneda", hex: "#45322e" },
              { label: "RAL 8003 mat (Zlatý dub)", value: "ral_8003", hex: "#8b5a2b" },
              { label: "Nestandardní lakování RAL", value: "ral_nestandard", priceVariant: 382, priceType: "per_m2" },
              { label: "Renolit oboustranně", value: "renolit_obou", hex: "#8b5a2b", priceVariant: 282, priceType: "per_m2" }
            ]
          },
          {
            id: "barva_profilu_hlinik",
            name: "Barva rámu",
            type: "color_array",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["hlinik"] },
            options: [
              { label: "Bílá RAL 9016 mat", value: "bila", hex: "#ffffff" },
              { label: "Hnědá RAL 8019 mat", value: "hneda", hex: "#45322e" },
              { label: "RAL 7016 mat (Antracit)", value: "ral_7016", hex: "#383e42" },
              { label: "RAL 8003 mat (Zlatý dub)", value: "ral_8003", hex: "#8b5a2b" },
              { label: "RAL 9006 mat (Stříbrná)", value: "ral_9006", hex: "#a5a5a5" },
              { label: "RAL 7016 struktura / DB 703", value: "ral_struktura", hex: "#383e42", priceVariant: 117, priceType: "per_m2" },
              { label: "Nestandardní lakování RAL", value: "ral_nestandard", priceVariant: 382, priceType: "per_m2" },
              { label: "Lakování imitace dřeva", value: "imitace_lak", hex: "#8b5a2b", priceVariant: 200, priceType: "per_m2" }
            ]
          },
          {
            id: "sitovina",
            name: "Typ síťoviny",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá", value: "transparentni", priceVariant: 142, priceType: "per_m2", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá", value: "protipylova", priceVariant: 431, priceType: "per_m2", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá", value: "petscreen_seda", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá", value: "petscreen_cerna", priceVariant: 475, priceType: "per_m2", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" },
              { label: "Síťovina s nanovláknem - černá (jen pro EURO a Hliníková okna)", value: "nano", priceVariant: 1078, priceType: "per_m2", hint: "Revoluční nanovlákno zachytí i ty nejmenší částice smogu. Nejvyšší možná ochrana.", img: "/images/icon_sit_nano.png" }
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
              { label: "26 mm", value: "26" }, { label: "28 mm", value: "28" }, { label: "30 mm", value: "30" },
              { label: "32 mm", value: "32" }, { label: "34 mm", value: "34" }
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
            id: "provedeni_rohu_euro",
            name: "Provedení rohů (pro EURO okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["euro"] },
            options: [
              { label: "Vnější rohy (standard)", value: "vnejsi" },
              { label: "Vnitřní rohy", value: "vnitrni", priceVariant: 89, priceType: "fixed" }
            ]
          },
          {
            id: "provedeni_sikmina",
            name: "Provedení šikmina (pro plastová okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc"] },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (vyžaduje nákres)", value: "ano", priceVariant: 407, priceType: "fixed" }
            ]
          },
          {
            id: "okenni_pricka",
            name: "Okenní příčka (pro zpevnění nebo velká okna)",
            type: "select",
            condition: { dependsOnParamId: "typ_okna", allowedValues: ["pvc", "euro"] },
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (v základní barvě)", value: "ano_zaklad", priceVariant: 69, priceType: "fixed" },
              { label: "Ano (v barvě RAL)", value: "ano_ral", priceVariant: 85, priceType: "fixed" }
            ]
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
            JSON.stringify({ width_mm_min: 200, width_mm_max: 1800, height_mm_min: 200, height_mm_max: 1800 })
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
              { label: "Jednokřídlé bez rámu (DE 50x20)", value: "bez_ramu_de50", img: "/images/icon_bez_ramu.png" },
              { label: "Jednokřídlé bez rámu (DE 40x20 Lux)", value: "bez_ramu_de40", qapiRecommended: true, hint: "Oblíbená volba, pevnější profil 40x20.", img: "/images/icon_bez_ramu.png" },
              { label: "Dvoukřídlé bez rámu (DE 40x20 Lux)", value: "bez_ramu_de40_dvou", img: "/images/icon_dvoukridla.png" },
              { label: "Jednokřídlé s rámem R3 (DE 40x20 Lux + R3)", value: "ram_r3_de40", hint: "Vlastní rám R3 je vhodný, pokud nechcete vrtat panty do rámu vlastních dveří.", img: "/images/icon_s_ramem.png" },
              { label: "Jednokřídlé s rámem R4 (DE 40x20 Lux + R4)", value: "ram_r4_de40", hint: "Vlastní rám R4 má širší lemování, ideální na hrubší fasádu.", img: "/images/icon_s_ramem.png" },
              { label: "Dvoukřídlé s rámem R3 (DE 40x20 Lux + R3)", value: "ram_r3_de40_dvou", img: "/images/icon_dvoukridla.png" },
              { label: "Dvoukřídlé s rámem R4 (DE 40x20 Lux + R4)", value: "ram_r4_de40_dvou", img: "/images/icon_dvoukridla.png" }
            ]
          },
          {
            id: "barva",
            name: "Barva profilu a rohy",
            hint: "Vyberte povrchovou úpravu. Hliníkové (Al) rohy výrazně prodlužují životnost celé konstrukce sítě oproti běžným plastovým rohům.",
            type: "select",
            options: [
              { label: "Základní (bílá, hnědá, RAL 7016, 8003, 9006)", value: "zaklad" },
              { label: "Základní s hliníkovými rohy", value: "zaklad_al_rohy", qapiRecommended: true, hint: "Pevné hliníkové rohy doporučujeme pro každodenně používané dveřní sítě." },
              { label: "RAL 7016 struktura / DB 703", value: "ral_struktura" },
              { label: "RAL 7016 struktura / DB 703 s hliníkovými rohy", value: "ral_struktura_al_rohy" },
              { label: "Nestandardní lakování RAL", value: "ral_nestandard" },
              { label: "Nestandardní lakování RAL s hliníkovými rohy", value: "ral_nestandard_al_rohy" },
              { label: "Lakování imitace dřeva", value: "imitace_dreva" },
              { label: "Lakování imitace dřeva s hliníkovými rohy", value: "imitace_dreva_al_rohy" },
              { label: "Renolit jednostranně na bílý profil", value: "renolit_jedno" },
              { label: "Renolit jednostranně s hliníkovými rohy", value: "renolit_jedno_al_rohy" },
              { label: "Renolit oboustranně", value: "renolit_obou" },
              { label: "Renolit oboustranně s hliníkovými rohy", value: "renolit_obou_al_rohy" }
            ]
          },
          {
            id: "sitovina",
            name: "Typ síťoviny",
            hint: "Vyberte si materiál síťoviny podle vašich potřeb. Skelné vlákno je zlatý standard. Pet screen je silnější verze odolná proti drápkům. Protipylová síťovina uleví alergikům a transparentní zase zajistí maximální neviditelnost.",
            type: "color_array",
            options: [
              { label: "Skelné vlákno - šedá", value: "zaklad_seda", qapiRecommended: true, hint: "Nejuniverzálnější volba. Šedá barva dokonale splyne s oknem a propouští nejvíce světla.", img: "/images/icon_sit_seda.png" },
              { label: "Skelné vlákno - černá", value: "zaklad_cerna", hint: "Klasické černé vlákno. Zevnitř je lépe průhledné.", img: "/images/icon_sit_cerna.png" },
              { label: "Transparentní síťovina - černá", value: "transparentni", hint: "Extrémně tenké vlákno. Zevnitř i zvenku je síť téměř nepostřehnutelná.", img: "/images/icon_sit_transparent.png" },
              { label: "Protipylová síťovina - černá", value: "protipylova", hint: "Hustší tkaní zachytí většinu pylu a prachu. Ideální do ložnice alergiků.", img: "/images/icon_sit_protipylova.png" },
              { label: "Pet screen (odolná) - šedá", value: "petscreen_seda", hint: "Vysoce odolná proti protržení kočkou nebo psem. Mírně snižuje světelnost.", img: "/images/icon_sit_petscreen.png" },
              { label: "Pet screen (odolná) - černá", value: "petscreen_cerna", hint: "Vysoce odolná černá varianta proti drápkům.", img: "/images/icon_sit_petscreen.png" },
              { label: "Síťovina s nanovláknem - černá", value: "nano", hint: "Revoluční nanovlákno zachytí i ty nejmenší částice smogu. Nejvyšší možná ochrana.", img: "/images/icon_sit_nano.png" }
            ]
          },
          {
            id: "panty",
            name: "Panty",
            hint: "Dveřní sítě se otevírají na pantech. Samozavírací panty obsahují pružinu, díky které se dveře samy zaklapnou.",
            type: "select",
            options: [
              { label: "PVC Standard panty (v ceně)", value: "pvc_standard" },
              { label: "PVC Samozavírací panty (56 Kč/ks)", value: "pvc_samozaviraci" },
              { label: "Al Standard panty (73 Kč/ks)", value: "al_standard" },
              { label: "Al Samozavírací panty (84 Kč/ks)", value: "al_samozaviraci", qapiRecommended: true, hint: "Hliníkové (Al) panty mají delší životnost a samozavírací mechanismus zaručí, že nezůstane otevřeno." }
            ]
          },
          {
            id: "magnet",
            name: "Magnet",
            type: "select",
            options: [
              { label: "Standardní magnet (v ceně)", value: "standard" },
              { label: "Magnetická guma / pásek po celé výšce", value: "cely_profil" }
            ]
          },
          {
            id: "madlo_navic",
            name: "Madlo navíc",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (24 Kč/ks)", value: "ano" }
            ]
          },
          {
            id: "okopova_pricka",
            name: "Okopová příčka ve spodní části",
            hint: "Okopová příčka je širší hliníkový profil umístěný úplně dole. Zabraňuje tomu, abyste do sítě omylem kopli nohou při otevírání.",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (počítá se dle barvy profilu)", value: "ano", qapiRecommended: true, hint: "Velmi doporučujeme, zvláště pokud máte doma děti." }
            ]
          },
          {
            id: "prulez_kocka",
            name: "Průlez pro kočku (černá)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+1199 Kč)", value: "ano", priceVariant: 1199, priceType: "fixed" }
            ]
          },
          {
            id: "prulez_pes",
            name: "Průlez pro psa (černá)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (+1332 Kč)", value: "ano", priceVariant: 1332, priceType: "fixed" }
            ]
          },
          {
            id: "profil_s_kartackem",
            name: "Profil s kartáčkem (vodorovně/svisle)",
            type: "select",
            options: [
              { label: "Ne", value: "ne" },
              { label: "Ano (63 Kč/m)", value: "ano" }
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
            JSON.stringify({ width_mm_min: 200, width_mm_max: 2000, height_mm_min: 200, height_mm_max: 2500 })
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



