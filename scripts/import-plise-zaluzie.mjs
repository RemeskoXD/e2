/**
 * Import produktu „Žaluzie plisé“ + ceníková mřížka (Kč bez DPH) z tabulky v obrázku.
 * npm run import:cenik:plise
 */
import "dotenv/config";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { Pool } from "pg";
import { parseFirstPliseMatrix } from "./parse-plise-matrix.mjs";

const CATEGORY = "cat_interier";
const IMG_DEFAULT =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Interiérové%20stínění/Plisé%20žaluzie/menu-plise.jpg";

const DARNI_PDF = process.env.PDF_DARNI || "public/02_CENIK_latkova_zaluzie_plise_darni.pdf";
const LAGARTA_PDF = process.env.PDF_LAGARTA || "public/02_CENIK_plise_zaluzie_lagarta.pdf";

async function ensureProductColumns(client) {
  for (const sql of [
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS supplier_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS width_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_min INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS height_mm_max INTEGER`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,
  ]) {
    await client.query(sql).catch(() => {});
  }
}

async function processPdf(client, pdfPath, productTitle, legacyTitle, desc) {
  console.log(`\nZpracovávám: ${productTitle} z ${pdfPath}`);
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const tr = await parser.getText();
  await parser.destroy();

  const { brackets, minPrice, dims } = parseFirstPliseMatrix(tr.text);
  console.log("Ceníkových buněk:", brackets.length, "minPrice:", minPrice, "dims:", dims);

  let existing = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [productTitle]);
  if (!existing.rows[0] && legacyTitle) {
     existing = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [legacyTitle]);
  }

  let productId;
  if (existing.rows[0]) {
    productId = existing.rows[0].id;
    await client.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [productId]);
    await client.query(
      `UPDATE "Product" SET name=$2, "categoryId"=$3, "priceCzk"=$4, image=$5, description=$6,
        supplier_markup_percent = 4.9, badge = $7,
        width_mm_min=$8, width_mm_max=$9, height_mm_min=$10, height_mm_max=$11, max_area_m2 = NULL
       WHERE id = $1`,
      [
        productId, productTitle, CATEGORY, minPrice, IMG_DEFAULT, desc, "Na míru",
        dims.width_mm_min, dims.width_mm_max, dims.height_mm_min, dims.height_mm_max
      ]
    );
    console.log("Aktualizován produkt id=", productId);
  } else {
    const ins = await client.query(
      `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", "oldPrice", badge, image, description, supplier_markup_percent, commission_percent,
        width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2)
       VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, NULL, $4, $5, $6, 4.9, 0, $7, $8, $9, $10, NULL) RETURNING id`,
      [
        productTitle, CATEGORY, minPrice, "Na míru", IMG_DEFAULT, desc,
        dims.width_mm_min, dims.width_mm_max, dims.height_mm_min, dims.height_mm_max
      ]
    );
    productId = ins.rows[0].id;
    console.log("Vytvořen produkt id=", productId);
  }

  // batch insert
  for (const b of brackets) {
    await client.query(
      `INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order)
       VALUES ( $1, $2, $3, $4, $5)`,
      [productId, b.width_mm_max, b.height_mm_max, b.base_price_czk, b.sort_order]
    );
  }
  console.log("Ceny uloženy.");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require/i.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false } : undefined,
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

    await processPdf(
      client,
      DARNI_PDF,
      "Žaluzie plisé Darni (látkové bez fólie)",
      "Žaluzie plisé",
      "Plisé žaluzie Darni — ceny dle tabulkového ceníku (cenová skupina 0, látkové bez fólie) v Kč bez DPH (21 %). Rozměry zaokrouhlit nahoru na nejbližší tabulkový krok 100 mm."
    );

    await processPdf(
      client,
      LAGARTA_PDF,
      "Žaluzie plisé Lagarta (Basic / Reflex FR)",
      null,
      "Plisé žaluzie Lagarta — ceny dle tabulkového ceníku (cenová skupina 1, modely Basic, Basic Reflex FR) v Kč bez DPH (21 %). Rozměry zaokrouhlit nahoru na nejbližší tabulkový krok 100 mm."
    );

    console.log("\\nHotovo.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
