/**
 * Venkovní rolety RADIX — mřížka šířka × výška (mm), Kč bez DPH.
 * Základ: lamela 39, hřídel Ø 40. Lamela 40: +5 % (řeší API quote přes parametr lamela).
 *
 * npm run import:pdf:venkovni-rolety-radix
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { PDFParse } from "pdf-parse";
import { extractFirstRadixTable } from "./parse-radix-venkovni-rolety-pdf.mjs";
import { downloadOrReadFileBuffer } from "./download-or-read-file.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_PDF =
  process.env.VENKOVNI_ROLETY_RADIX_PDF ||
  "https://web2.itnahodinu.cz/qapieshop/Katalogy/10_CENIK_venkovni_rolety.pdf";

const PRODUCT_TITLE = "Venkovní rolety RADIX";
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

  const { brackets } = extractFirstRadixTable(textRes.text);
  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  const baseName = inputArg.startsWith("http") ? inputArg.split("/").pop() : path.basename(pdfPath);
  const desc =
    `Venkovní roletka RADIX — ceny v Kč bez DPH podle šířky a výšky (mm), výběr buňky k nejbližšímu vyššímu tabulkovému rozměru. ` +
    `Základ tabulky: lamela 39, hřídel Ø 40. Při lamely 40 účtujte +5 % k tabulkové ceně (parametr lamela=40 v API kalkulaci). ` +
    `U vyšších výšek tabulka neobsahuje nejužší šířky — viz ceník. Barevné značení buněk = odpovídající točivý moment motoru (Somfy / Erte dle PDF). ` +
    `Zdroj: ${baseName}.`;

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
          width_mm_min = 700, width_mm_max = 3000, height_mm_min = 600, height_mm_max = 3400,
          max_area_m2 = NULL
         WHERE id = $1`,
        [id, "cat_venkovni", minPrice, IMG, desc, "Na míru", "venkovni_roleta_radix"]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description,
          supplier_markup_percent, commission_percent, price_mode,
          validation_profile,
          width_mm_min, width_mm_max, height_mm_min, height_mm_max)
         VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, 'matrix_cell', $7, 700, 3000, 600, 3400) RETURNING id`,
        [PRODUCT_TITLE, "cat_venkovni", minPrice, "Na míru", IMG, desc, "venkovni_roleta_radix"]
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
