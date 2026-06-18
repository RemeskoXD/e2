/**
 * Import produktu + mřížky cen z 01_CENIK_horizontalni_zaluzie.pdf
 * Produkt: horizontální žaluzie ISOLINE, řetízkové ovládání (první tabulka v PDF).
 * Spuštění: npm run import:cenik:horizontalni
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { Pool } from "pg";
import { parseFirstIsolineMatrix } from "./parse-isoline-matrix.mjs";
import { downloadOrReadFileBuffer } from "./download-or-read-file.mjs";

const PDF_DEFAULT =
  process.env.CENIK_PDF_PATH ||
  "https://web2.itnahodinu.cz/qapieshop/Katalogy/01_CENIK_horizontalni_zaluzie.pdf";

const PRODUCT_TITLE = "Horizontální žaluzie ISOLINE — řetízkové ovládání";
const LEGACY_TITLE = "Horizontální žaluzie ISOLINE (ceník PDF 01)";
const PRODUCT_CATEGORY = "cat_interier";
const IMG_DEFAULT =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Interiérové%20stínění/Horizontální%20žaluzie/menu-zaluzie.jpg";

const DIM = {
  width_mm_min: 200,
  width_mm_max: 2200,
  height_mm_min: 300,
  height_mm_max: 2200,
  max_area_m2: 2.4,
};

async function readPdfText(pdfPath) {
  const buf = await downloadOrReadFileBuffer(pdfPath);
  const parser = new PDFParse({ data: buf });
  const tr = await parser.getText();
  await parser.destroy();
  return tr.text;
}

async function ensureProductColumns(client) {
  for (const sql of [
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
  ]) {
    await client.query(sql).catch(() => {});
  }
}

async function main() {
  const inputArg = process.argv[2] || PDF_DEFAULT;
  const pdfPath = inputArg.startsWith("http") ? inputArg : path.resolve(inputArg);
  if (!inputArg.startsWith("http") && !fs.existsSync(pdfPath)) {
    console.error("Soubor neexistuje:", pdfPath);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL v prostředí / .env");
    process.exit(1);
  }

  console.log("Čtu PDF:", pdfPath);
  const text = await readPdfText(pdfPath);
  const { brackets, minPrice } = parseFirstIsolineMatrix(text);
  console.log("Buněk tabulky:", brackets.length, "| minimum v tabulce:", minPrice, "Kč");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require/i.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();
  try {
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
    await client
      .query(
        `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`
      )
      .catch(() => {});
    await client
      .query(
        `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`
      )
      .catch(() => {});
    await ensureProductColumns(client);
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

    const desc = `Horizontální žaluzie ISOLINE s ovládáním řetízkem. Ceny v tabulce jsou v Kč bez DPH (21 %). Zaokrouhlení rozměrů při výpočtu: k nejbližšímu vyššímu tabulkovému rozměru (viz ceník). Garantované rozměry: šířka ${DIM.width_mm_min}–${DIM.width_mm_max} mm, výška ${DIM.height_mm_min}–${DIM.height_mm_max} mm, max. plocha ${DIM.max_area_m2} m². Varianty PRIM a ECO jsou v dalších tabulkách stejného PDF.`;

    let existing = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [PRODUCT_TITLE]);
    if (!existing.rows[0]) {
      existing = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [LEGACY_TITLE]);
    }

    let productId;
    if (existing.rows[0]) {
      productId = existing.rows[0].id;
      await client.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);
      await client.query(
        `UPDATE "Product" SET name=$2, "categoryId"=$3, "priceCzk"=$4, image=$5, description=$6,
          supplier_markup_percent = 4.9, badge = $7,
          width_mm_min=$8, width_mm_max=$9, height_mm_min=$10, height_mm_max=$11, max_area_m2=$12
         WHERE id = $1`,
        [
          productId,
          PRODUCT_TITLE,
          PRODUCT_CATEGORY,
          minPrice,
          IMG_DEFAULT,
          desc,
          "Na míru",
          DIM.width_mm_min,
          DIM.width_mm_max,
          DIM.height_mm_min,
          DIM.height_mm_max,
          DIM.max_area_m2,
        ]
      );
      console.log("Aktualizuji produkt id=", productId);
    } else {
      const ins = await client.query(
        `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", "oldPrice", badge, image, description, supplier_markup_percent, commission_percent,
          width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2)
         VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, NULL, $4, $5, $6, 4.9, 0, $7, $8, $9, $10, $11) RETURNING id`,
        [
          PRODUCT_TITLE,
          PRODUCT_CATEGORY,
          minPrice,
          "Na míru",
          IMG_DEFAULT,
          desc,
          DIM.width_mm_min,
          DIM.width_mm_max,
          DIM.height_mm_min,
          DIM.height_mm_max,
          DIM.max_area_m2,
        ]
      );
      productId = ins.rows[0].id;
      console.log("Vytvořen produkt id=", productId);
    }

    for (let i = 0; i < brackets.length; i++) {
      const b = brackets[i];
      await client.query(
        `INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order)
         VALUES ( $1, $2, $3, $4, $5)`,
        [productId, b.width_mm_max, b.height_mm_max, b.base_price_czk, i]
      );
    }
    console.log("Hotovo: vloženo", brackets.length, "řádků ProductPriceBracket.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
