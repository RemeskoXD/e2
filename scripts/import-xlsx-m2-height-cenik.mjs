/**
 * Import produktů s výpočtem Kč/m² podle výšky z XLSX (tabulka jako u vertikálních žaluzií).
 * - Očekává list s hlavičkou látek v prvním řádku bloku, druhý řádek „Kč/m²“, pak řádky pásem výšky.
 * - Hodnoty v XLSX jsou často **s DPH** — převedeme na bez DPH: cena / 1,21 (zaokrouhleno na celé Kč/m²).
 *
 * Váš soubor 04_CENIK_vertikalni_zaluzie_DPH.xlsx = vertikální žaluzie (látky), ne Rolety Den a noc.
 * Pro Den a noc pošlete prosím správný .xlsx; tento skript jen načte strukturu výše.
 *
 * npm run import:xlsx:cenik
 * nebo: node scripts/import-xlsx-m2-height-cenik.mjs "cesta.xlsx"
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { Pool } from "pg";
import { downloadOrReadFileBuffer } from "./download-or-read-file.mjs";

const __filename = fileURLToPath(import.meta.url);

const VAT_DIVISOR = 1.21;

const DEFAULT_XLSX =
  process.env.CENIK_XLSX_PATH ||
  "https://web2.itnahodinu.cz/qapieshop/Katalogy/04_CENIK_vertikalni_zaluzie_DPH.xlsx";

function normCell(v) {
  if (v == null || v === "") return "";
  return String(v).replace(/\r\n/g, "\n").trim();
}

function fabricNamesFromHeaderCell(cell) {
  const s = normCell(cell);
  if (!s) return [];
  return s
    .split(/\n/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isRowEmpty(row) {
  if (!row || !row.length) return true;
  return row.every((c) => normCell(c) === "");
}

/** Z řádku „0 – 1500“ apod. udělá min/max mm (mezery 1501–1509 apod. vejdou do nižšího pásma jako u PDF). */
function bandFromHeightLabel(label) {
  const s = normCell(label).replace(/[–−]/g, "-");
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    return { height_mm_min: lo, height_mm_max: hi + 9 };
  }
  const m2 = s.match(/(\d+)\s*-\s*$/);
  if (m2) {
    return { height_mm_min: Number(m2[1]), height_mm_max: 9_999_999 };
  }
  throw new Error(`Nepodařilo se přečíst pásmo výšky: "${label}"`);
}

function exVatPerM2(kcWithVat) {
  return Math.round(Number(kcWithVat) / VAT_DIVISOR);
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

export function parseWorkbook(wb) {
  const sheetName = wb.SheetNames[0];
  const sh = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const blocks = [];

  let i = 0;
  while (i < data.length) {
    while (i < data.length && isRowEmpty(data[i])) i++;
    if (i >= data.length) break;

    const headerRow = data[i];
    i++;
    if (i >= data.length) break;
    const unitRow = data[i];
    i++;

    const colFabrics = [];
    for (let c = 1; c < headerRow.length; c++) {
      const names = fabricNamesFromHeaderCell(headerRow[c]);
      if (names.length === 0) continue;
      colFabrics[c] = names;
    }

    const fabricToTiers = new Map();

    while (i < data.length && !isRowEmpty(data[i])) {
      const row = data[i];
      i++;
      const hLabel = row[0];
      if (normCell(hLabel) === "" || /kč/i.test(normCell(unitRow[0]))) continue;
      let band;
      try {
        band = bandFromHeightLabel(hLabel);
      } catch {
        continue;
      }

      for (let c = 1; c < row.length; c++) {
        const names = colFabrics[c];
        if (!names || !names.length) continue;
        const raw = row[c];
        if (raw === "" || raw == null || Number.isNaN(Number(raw))) continue;
        const ppm = exVatPerM2(raw);
        for (const fabricName of names) {
          if (!fabricToTiers.has(fabricName)) {
            fabricToTiers.set(fabricName, []);
          }
          const tiers = fabricToTiers.get(fabricName);
          tiers.push({
            ...band,
            price_per_m2_czk: ppm,
            sort_order: tiers.length,
          });
        }
      }
    }

    for (const [fabricName, tiers] of fabricToTiers) {
      if (tiers.length === 0) continue;
      blocks.push({ fabricName, tiers });
    }
  }

  return { sheetName, blocks };
}

const IMG_VERT =
  "https://web2.itnahodinu.cz/qapieshop/Obrázky/Interiérové%20stínění/Vertikální%20rolety/menu-vertikalni-zaluzie.jpg";

async function upsertFabricProduct(client, fabricName, tiers, { prefix, xlsxBase }) {
  const title = `${prefix}${fabricName}`;
  const minPpm = Math.min(...tiers.map((t) => t.price_per_m2_czk));

  const desc =
    `Vertikální žaluzie — látka ${fabricName}. Ceny z ${xlsxBase}: v XLSX jsou uvedeny Kč/m² s DPH, do e-shopu se ukládají bez DPH (÷ ${VAT_DIVISOR}, zaokrouhleno na celé Kč/m²). ` +
    `Výpočet: (šířka × výška v m²) × sazba za m² podle výšky žaluzie. Minimální rozměry v tabulce nejsou — doplníte v administraci.`;

  const r = await client.query(`SELECT id FROM "Product" WHERE name = $1`, [title]);
  let id;
  if (r.rows[0]) {
    id = r.rows[0].id;
    await client.query(`DELETE FROM "ProductHeightPriceTier" WHERE product_id = $1`, [id]);
    await client.query(
      `UPDATE "Product" SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5, badge=$6,
        supplier_markup_percent = 4.9, price_mode = $7
       WHERE id = $1`,
      [id, "cat_interier", minPpm, IMG_VERT, desc, "Na míru", "m2_height_tiers"]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description, supplier_markup_percent, commission_percent, price_mode)
       VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2, $3, $4, $5, $6, 4.9, 0, $7) RETURNING id`,
      [title, "cat_interier", minPpm, "Na míru", IMG_VERT, desc, "m2_height_tiers"]
    );
    id = ins.rows[0].id;
  }

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
  const { sheetName, blocks } = parseWorkbook(wb);
  const base = inputArg.startsWith("http") ? inputArg.split("/").pop() : path.basename(xlsxPath);

  console.log("List:", sheetName, "| soubor:", base);
  console.log("Látek (produktů):", blocks.length);
  if (base.toLowerCase().includes("vertikalni") && !process.argv.includes("--quiet")) {
    console.warn(
      "\n[info] Tento soubor vypadá jako ceník **vertikálních žaluzií**, ne Rolety Den a noc. Pokud jste chtěli Den a noc, použijte jiný XLSX.\n"
    );
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
    const prefix = "Vertikální žaluzie — látka ";
    for (const { fabricName, tiers } of blocks) {
      const id = await upsertFabricProduct(client, fabricName, tiers, { prefix, xlsxBase: base });
      console.log("OK:", prefix + fabricName, "id=", id, "tiers=", tiers.length);
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
