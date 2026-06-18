/**
 * Rolety Den a noc — Collete PLUS (mřížka šířka × výška v mm, celková cena v Kč).
 * Ceny v XLSX bereme jako už bez DPH (dle vašeho zadání — nedělíme 1,21).
 * Skupiny látek 1–5 = samostatné produkty; příplatky vyšších skupin jsou v tabulce započítané.
 *
 * npm run import:xlsx:dn-roletky
 * node scripts/import-xlsx-dn-roletky-collete.mjs "cesta.xlsx"
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { Pool } from "pg";
import { downloadOrReadFileBuffer } from "./download-or-read-file.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_XLSX =
  process.env.DN_ROLETKY_XLSX ||
  "https://web2.itnahodinu.cz/qapieshop/Katalogy/05_CENIK_rolety_DN_Collete_PLUS_DPH.xlsx";

const PRODUCT_PREFIX = "Rolety Den a noc Collete PLUS — skupina látek ";
const IMG =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Produktové%20foto%20SHADEON/textilni_dn_collete.jpg";

function norm(s) {
  return String(s ?? "")
    .replace(/\r\n/g, " ")
    .trim()
    .toLowerCase();
}

function isRowEmpty(row) {
  if (!row?.length) return true;
  return row.every((c) => c === "" || c == null);
}

/** Český formát: "1 418" nebo "1 488,90" → celé Kč */
function parsePriceCzk(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function extractWidths(widthRow) {
  const out = [];
  for (let c = 2; c < widthRow.length; c++) {
    const w = widthRow[c];
    if (w === "" || w == null) break;
    const n = typeof w === "number" ? w : Number(String(w).replace(",", "."));
    if (!Number.isFinite(n) || n < 1) break;
    out.push({ col: c, widthMm: Math.round(n) });
  }
  return out;
}

export function parseDnRoletkySheet(wb) {
  const sh = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const groups = [];
  let i = 0;

  while (i < data.length) {
    if (isRowEmpty(data[i])) {
      i++;
      continue;
    }
    const r0 = data[i][0];
    const r1 = data[i][1];
    if (!norm(r0).includes("skupina") || !norm(r1).includes("výška")) {
      i++;
      continue;
    }
    i++;
    if (i >= data.length) break;
    const widthRow = data[i++];
    const widths = extractWidths(widthRow);
    if (!widths.length) continue;

    let groupNum = null;
    const brackets = [];
    let sort = 0;

    while (i < data.length) {
      const dr = data[i];
      if (isRowEmpty(dr)) {
        i++;
        break;
      }
      if (norm(dr[0]).includes("skupina")) {
        break;
      }
      if (dr[0] !== "" && dr[0] != null && Number.isFinite(Number(dr[0]))) {
        groupNum = Number(dr[0]);
      }
      const hRaw = dr[1];
      if (!Number.isFinite(Number(hRaw))) {
        i++;
        continue;
      }
      const heightMm = Math.round(Number(hRaw));
      for (const { col, widthMm } of widths) {
        const price = parsePriceCzk(dr[col]);
        if (price == null) continue;
        brackets.push({
          width_mm_max: widthMm,
          height_mm_max: heightMm,
          base_price_czk: price,
          sort_order: sort++,
        });
      }
      i++;
    }

    if (groupNum != null && brackets.length) {
      groups.push({ groupNum, brackets });
    }
  }

  return { sheet: wb.SheetNames[0], groups };
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

async function upsertGroup(client, { groupNum, brackets }, xlsxBase) {
  const title = `${PRODUCT_PREFIX}${groupNum}`;
  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  const desc =
    `Textilní rolety Den a noc (Collete PLUS), skupina látek ${groupNum}. Ceny z ${xlsxBase} v Kč bez DPH — celková částka za danou šířku a výšku (mm) dle tabulky. ` +
    `Zaokrouhlení při výpočtu: k nejbližšímu vyššímu tabulkovému rozměru (stejně jako u mřížkových ceníků). Min./max. rozměry v dokumentu nemáte — limity nejsou nastavené.`;

  const r = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [title]);
  let id;
  if (r.rows[0]) {
    id = r.rows[0].id;
    await client.query(`DELETE FROM "ProductPriceBracket" WHERE product_id = $1`, [id]);
    await client.query(
      `UPDATE "Product" SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5, badge=$6,
        supplier_markup_percent = 4.9, price_mode = 'matrix_cell',
        width_mm_min = NULL, width_mm_max = NULL, height_mm_min = NULL, height_mm_max = NULL, max_area_m2 = NULL
       WHERE id = $1`,
      [id, "cat_interier", minPrice, IMG, desc, "Na míru"]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description, supplier_markup_percent, commission_percent, price_mode)
       VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, 'matrix_cell') RETURNING id`,
      [title, "cat_interier", minPrice, "Na míru", IMG, desc]
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
  const inputArg = process.argv[2] || DEFAULT_XLSX;
  const xlsxPath = inputArg.startsWith("http") ? inputArg : path.resolve(inputArg);
  if (!inputArg.startsWith("http") && !fs.existsSync(xlsxPath)) {
    console.error("Soubor neexistuje:", xlsxPath);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Chybí DATABASE_URL");
    process.exit(1);
  }

  const buf = await downloadOrReadFileBuffer(xlsxPath);
  const wb = XLSX.read(buf, { cellDates: true });
  const { sheet, groups } = parseDnRoletkySheet(wb);
  const base = inputArg.startsWith("http") ? inputArg.split("/").pop() : path.basename(xlsxPath);
  console.log("List:", sheet, "| skupin:", groups.length, "| soubor:", base);
  for (const g of groups) {
    console.log("  skupina", g.groupNum, "buněk", g.brackets.length);
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
    for (const g of groups) {
      const id = await upsertGroup(client, g, base);
      console.log("OK:", PRODUCT_PREFIX + g.groupNum, "id=", id);
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
