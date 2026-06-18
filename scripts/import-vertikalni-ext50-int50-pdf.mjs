/**
 * Vertikální žaluzie EXT 50 / INT 50 — mřížka šířka × výška (mm), ceny Kč bez DPH.
 * Zdroj: PDF ceník (standardní provedení, část 1 + 2 mřížky).
 *
 * npm run import:pdf:ext50-int50
 * node scripts/import-vertikalni-ext50-int50-pdf.mjs "cesta/k/ceniku.pdf"
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { PDFParse } from "pdf-parse";
import { extractExt50Int50StandardMatrices } from "./parse-ext50-int50-from-pdf-text.mjs";
import { downloadOrReadFileBuffer } from "./download-or-read-file.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_PDF =
  process.env.EXT50_INT50_PDF ||
  "https://web2.itnahodinu.cz/qapieshop/Katalogy/09_CENIK_venkovni_zaluzie-2.pdf";

const PRODUCT_TITLE = "Vertikální žaluzie EXT 50 / INT 50 — standard";
const IMG =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Interiérové%20stínění/Vertikální%20rolety/menu-vertikalni-zaluzie.jpg";

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
  const inputArg = process.argv[2] || DEFAULT_PDF;
  const pdfPath = inputArg.startsWith("http") ? inputArg : path.resolve(inputArg);
  if (!inputArg.startsWith("http") && !fs.existsSync(pdfPath)) {
    console.error("Soubor neexistuje:", pdfPath);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL");
    process.exit(1);
  }

  const buf = await downloadOrReadFileBuffer(pdfPath);
  const parser = new PDFParse({ data: buf });
  const textRes = await parser.getText();
  await parser.destroy();

  const { brackets } = extractExt50Int50StandardMatrices(textRes.text);
  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  const baseName = inputArg.startsWith("http") ? inputArg.split("/").pop() : path.basename(pdfPath);
  const desc =
    `Žaluzie EXT 50 (venkovní) a INT 50 (interiérová) v standardním provedení — ovládání nekonečná šňůra / nekonečný řetízek, příslušenství bílá/stříbrná, bez krycího plechu. ` +
    `Ceny v Kč bez DPH dle mřížky šířka × výška (mm); výpočet k nejbližšímu vyššímu tabulkovému rozměru. ` +
    `Zdroj: ${baseName}. ` +
    `Poznámka ceníku: u rozměrů se šířkou nebo výškou od 3 100 mm jde o rozměr žaluzie bez garance.`;

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
          width_mm_min = 500, width_mm_max = 4000, height_mm_min = 500, height_mm_max = 3100,
          max_area_m2 = NULL
         WHERE id = $1`,
        [id, "cat_interier", minPrice, IMG, desc, "Na míru", "ext50_int50_matrix"]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description,
          supplier_markup_percent, commission_percent, price_mode,
          validation_profile,
          width_mm_min, width_mm_max, height_mm_min, height_mm_max)
         VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, 'matrix_cell', $7, 500, 4000, 500, 3100) RETURNING id`,
        [PRODUCT_TITLE, "cat_interier", minPrice, "Na míru", IMG, desc, "ext50_int50_matrix"]
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
    console.log("OK:", PRODUCT_TITLE, "id=", id, "buňek", brackets.length, "PDF:", baseName);
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
