/**
 * Vertikální žaluzie — 3 produkty (SONIA, VANESA, VIOLA), cena = plocha (m²) × Kč/m² podle výšky.
 * Ceny bez DPH. Navýšení dodavatele 4,9 % (vertikální žaluzie dle vašeho seznamu).
 * npm run import:cenik:vertikalni
 */
import "dotenv/config";
import { Pool } from "pg";
import {
  tiersWithPrices,
  SONIA_PRICE_PER_M2,
  VANESA_VIOLA_PRICE_PER_M2,
} from "./vertikalni-zaluzie-tiers.mjs";

const IMG =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Interiérové%20stínění/Vertikální%20rolety/menu-vertikalni-zaluzie.jpg";

const PRODUCTS = [
  {
    title: "Vertikální žaluzie — látka SONIA",
    ppm: SONIA_PRICE_PER_M2,
    priceOd: 555,
    desc:
      "Vertikální žaluzie, látka SONIA. Ceník v Kč/m² bez DPH podle výšky žaluzie. Celková cena katalogu = šířka × výška (m²) × sazba za m² z příslušného pásma výšky. Mezery mezi řádky v PDF (např. 1501–1509 mm) jsou započítané do nižšího pásma. Po katalogu se aplikuje navýšení dodavatele a případná provize.",
  },
  {
    title: "Vertikální žaluzie — látka VANESA",
    ppm: VANESA_VIOLA_PRICE_PER_M2,
    priceOd: 787,
    desc:
      "Vertikální žaluzie, látka VANESA. Ceník v Kč/m² bez DPH podle výšky žaluzie; výpočet plochy a navýšení jako u SONIA.",
  },
  {
    title: "Vertikální žaluzie — látka VIOLA",
    ppm: VANESA_VIOLA_PRICE_PER_M2,
    priceOd: 787,
    desc:
      "Vertikální žaluzie, látka VIOLA (stejný ceník Kč/m² jako VANESA). Bez DPH; výpočet podle výšky a plochy.",
  },
];

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "Product" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "categoryId" TEXT,
      "priceCzk" INTEGER,
      "oldPrice" INTEGER,
      badge VARCHAR(50),
      image TEXT,
      description TEXT
    );
  `);
  for (const sql of [
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS price_mode VARCHAR(32) DEFAULT 'matrix_cell'`,
  ]) {
    await client.query(sql).catch(() => {});
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ProductHeightPriceTier" (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
      height_mm_min INTEGER NOT NULL,
      height_mm_max INTEGER NOT NULL,
      price_per_m2_czk INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `);
}

async function upsertProduct(client, { title, ppm, priceOd, desc }) {
  const r = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [title]);
  let id;
  if (r.rows[0]) {
    id = r.rows[0].id;
    await client.query(`DELETE FROM "ProductHeightPriceTier" WHERE product_id = $1`, [id]);
    await client.query(
      `UPDATE "Product" SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5, badge=$6,
        supplier_markup_percent = 4.9, price_mode = $7, commission_percent = COALESCE(commission_percent, 0)
       WHERE id = $1`,
      [id, "cat_interier", priceOd, IMG, desc, "Na míru", "m2_height_tiers"]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description, supplier_markup_percent, commission_percent, price_mode)
       VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, $7) RETURNING id`,
      [title, "cat_interier", priceOd, "Na míru", IMG, desc, "m2_height_tiers"]
    );
    id = ins.rows[0].id;
  }
  const tiers = tiersWithPrices(ppm);
  for (const t of tiers) {
    await client.query(
      `INSERT INTO "ProductHeightPriceTier" (product_id, height_mm_min, height_mm_max, price_per_m2_czk, sort_order)
       VALUES ( $1, $2, $3, $4, $5)`,
      [id, t.height_mm_min, t.height_mm_max, t.price_per_m2_czk, t.sort_order]
    );
  }
  return id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require/i.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    for (const p of PRODUCTS) {
      const id = await upsertProduct(client, p);
      console.log("OK:", p.title, "id=", id);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
