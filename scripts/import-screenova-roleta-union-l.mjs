/**
 * Screenová roleta UNION L — mřížka Kč bez DPH (max. rozměr 4000 × 3000 mm dle látek Screen/Polyscreen/Tara).
 *
 * npm run import:screenova:roleta:union-l
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { unionLBracketsForImport } from "./screenova-roleta-union-l-grid.mjs";

const __filename = fileURLToPath(import.meta.url);

const PRODUCT_TITLE = "Screenová roleta UNION L";
const IMG =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Produktové%20foto%20SHADEON/textilni_dn_collete.jpg";

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
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS fabric_group INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS validation_profile VARCHAR(32)`,
  ]) {
    await client.query(sql).catch(() => {});
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ProductPriceBracket" (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
      width_mm_max INTEGER NOT NULL,
      height_mm_max INTEGER NOT NULL,
      base_price_czk INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL");
    process.exit(1);
  }

  const brackets = unionLBracketsForImport();
  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  const desc =
    `Screenová roleta UNION L — ceny v Kč bez DPH podle šířky a výšky (mm), zaokrouhlení k nejbližšímu vyššímu tabulkovému rozměru. ` +
    `Motorové ovládání od šířky 85 cm. ` +
    `U látek Screen, Polyscreen a Tara Premio je v ceníku uvedeno maximum 400 × 300 cm — v e-shopu jsou limity 4000 × 3000 mm. ` +
    `Příplatky (API): Polyscreen +40 % k základní tabulce; konstrukce bez látky −25 %; spodní profil v RAL +10 %. Potisk individuálně.`;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require/i.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    const r = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [PRODUCT_TITLE]);
    let id;
    if (r.rows[0]) {
      id = r.rows[0].id;
      await client.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [id]);
      await client.query(
        `UPDATE "Product" SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5, badge=$6,
          supplier_markup_percent = 4.9, commission_percent = 0,
          price_mode = 'matrix_cell',
          fabric_group = NULL, validation_profile = $7,
          width_mm_min = 500, width_mm_max = 4000, height_mm_min = 500, height_mm_max = 3000,
          max_area_m2 = NULL
         WHERE id = $1`,
        [id, "cat_venkovni", minPrice, IMG, desc, "Na míru", "screen_roleta_union_l"]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description,
          supplier_markup_percent, commission_percent, price_mode,
          validation_profile,
          width_mm_min, width_mm_max, height_mm_min, height_mm_max)
         VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, 'matrix_cell', $7, 500, 4000, 500, 3000) RETURNING id`,
        [PRODUCT_TITLE, "cat_venkovni", minPrice, "Na míru", IMG, desc, "screen_roleta_union_l"]
      );
      id = ins.rows[0].id;
    }

    for (const b of brackets) {
      await client.query(
        `INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order)
         VALUES ( $1, $2, $3, $4, $5)`,
        [id, b.width_mm_max, b.height_mm_max, b.base_price_czk, b.sort_order]
      );
    }
    console.log("OK:", PRODUCT_TITLE, "id=", id, "buňek", brackets.length);
  } finally {
    client.release();
    await pool.end();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
