/**
 * Textilní žaluzie JAZZ EXPERT — 5 produktů (skupina látek 1–5).
 * Základní mřížka = skupina 1 (bez DPH); vyšší skupiny = stejná mřížka × (1 + příplatek).
 * Příplatky dle ceníku: sk.2 +20 %, sk.3 +30 %, sk.4 +45 %, sk.5 +80 %.
 *
 * npm run import:textilni:zaluzie:jazz
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { jazzBracketsForSkupina } from "./textilni-zaluzie-jazz-grid.mjs";

const __filename = fileURLToPath(import.meta.url);

const SKUPINA_SURCHARGE_PCT = [0, 20, 30, 45, 80];
const PRODUCT_PREFIX = "Textilní žaluzie JAZZ EXPERT — skupina látek ";
const IMG =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Produktové%20foto%20SHADEON/textilni_dn_collete.jpg";

const SKUPINA_LATKY = {
  1: "Adriana, Melisa",
  2: "Lucy, Melisa BO",
  3: "Stella BO, Melisa BO B/B, Melisa BO B/S",
  4: "Tropic",
  5: "Screen (nehořlavá)",
};

function dimsForSkupina(g) {
  if (g === 5) return { wmin: 500, wmax: 1800, hmin: 500, hmax: 2250 };
  if (g === 2) return { wmin: 500, wmax: 2000, hmin: 500, hmax: 2500 };
  return { wmin: 500, wmax: 1950, hmin: 500, hmax: 2500 };
}

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

async function upsertSkupina(client, groupNum) {
  const title = `${PRODUCT_PREFIX}${groupNum}`;
  const surcharge = SKUPINA_SURCHARGE_PCT[groupNum - 1];
  const brackets = jazzBracketsForSkupina(surcharge);
  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  const { wmin, wmax, hmin, hmax } = dimsForSkupina(groupNum);
  const latky = SKUPINA_LATKY[groupNum];
  const desc =
    `Textilní žaluzie JAZZ EXPERT — mřížkový ceník v Kč bez DPH. Skupina látek ${groupNum} (${latky}). ` +
    `Oproti základní tabulce (skupina 1) je v cenách započítán příplatek ${surcharge} %. ` +
    `Kalkulace: nejbližší vyšší tabulkové rozměry v mm (šířka 500–2000, výška 500–2500 dle řady). ` +
    `Výrobní omezení: nesmí současně přesáhnout šířka i výška 1 950 mm; při šířce nad 1 950 mm je výška max. 1 850 mm. ` +
    `Pro kontrolu max. rozměrů konkrétní látky lze v API u quote zaslat pole „fabric“ nebo „latka“.`;

  const r = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [title]);
  let id;
  if (r.rows[0]) {
    id = r.rows[0].id;
    await client.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [id]);
    await client.query(
      `UPDATE "Product" SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5, badge=$6,
        supplier_markup_percent = 4.9, commission_percent = 0,
        price_mode = 'matrix_cell',
        fabric_group = $7, validation_profile = $8,
        width_mm_min = $9, width_mm_max = $10, height_mm_min = $11, height_mm_max = $12,
        max_area_m2 = NULL
       WHERE id = $1`,
      [
        id,
        "cat_interier",
        minPrice,
        IMG,
        desc,
        "Na míru",
        groupNum,
        "textile_zaluzie",
        wmin,
        wmax,
        hmin,
        hmax,
      ]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description,
        supplier_markup_percent, commission_percent, price_mode,
        fabric_group, validation_profile,
        width_mm_min, width_mm_max, height_mm_min, height_mm_max)
       VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, 'matrix_cell', $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        title,
        "cat_interier",
        minPrice,
        "Na míru",
        IMG,
        desc,
        groupNum,
        "textile_zaluzie",
        wmin,
        wmax,
        hmin,
        hmax,
      ]
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
    for (let g = 1; g <= 5; g++) {
      const id = await upsertSkupina(client, g);
      console.log("OK:", PRODUCT_PREFIX + g, "id=", id, "buněk", 21 * 16);
    }
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
