/**
 * Parsuje první mřížku RADIX z textu PDF (ceny jako „2 250“ = 2250 Kč).
 * Řádky mají proměnný počet sloupců: u vyšších výšek začínají šířky až od 800, 900, … 1500 mm.
 */

const WIDTHS_MM = [];
for (let w = 700; w <= 3000; w += 100) WIDTHS_MM.push(w);

/** @param {string[]} parts */
function stripTrailingMotorNm(parts) {
  if (parts.length >= 2 && parts[parts.length - 1] === "Nm") {
    return parts.slice(0, -2);
  }
  return parts;
}

/**
 * @param {string} line
 * @returns {{ heightMm: number, prices: number[] } | null}
 */
export function parseRadixDataLine(line) {
  let parts = line
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  parts = stripTrailingMotorNm(parts);
  if (parts.length < 2) return null;
  const heightMm = parseInt(parts[0], 10);
  if (!Number.isFinite(heightMm) || heightMm < 500 || heightMm > 4000) return null;

  const prices = [];
  let i = 1;
  while (i < parts.length) {
    if (i + 1 < parts.length && /^\d+$/.test(parts[i]) && /^\d+$/.test(parts[i + 1])) {
      const a = parseInt(parts[i], 10);
      const b = parseInt(parts[i + 1], 10);
      if (a > 0 && a < 1000 && b < 1000) {
        prices.push(a * 1000 + b);
        i += 2;
        continue;
      }
    }
    if (/^\d+$/.test(parts[i])) {
      prices.push(parseInt(parts[i], 10));
      i += 1;
      continue;
    }
    i += 1;
  }
  if (!prices.length) return null;
  return { heightMm, prices };
}

/**
 * @param {string} fullText
 * @returns {{ brackets: { width_mm_max: number, height_mm_max: number, base_price_czk: number, sort_order: number }[] }}
 */
export function extractFirstRadixTable(fullText) {
  const lines = fullText.split(/\r?\n/);
  let sort = 0;
  /** @type { { width_mm_max: number, height_mm_max: number, base_price_czk: number, sort_order: number }[] } */
  const brackets = [];

  for (let li = 0; li < lines.length; li++) {
    const headerParts = lines[li].trim().split(/\s+/).filter(Boolean);
    if (
      headerParts.length !== WIDTHS_MM.length ||
      headerParts[0] !== "700" ||
      headerParts[1] !== "800" ||
      headerParts[headerParts.length - 1] !== "3000"
    ) {
      continue;
    }

    let j = li + 1;
    for (; j < lines.length; j++) {
      const raw = lines[j].trim();
      if (!raw) continue;
      if (/^--\s*\d+\s+of\s+\d+\s+--$/i.test(raw)) break;

      const parsed = parseRadixDataLine(raw);
      if (!parsed) break;

      const { heightMm, prices } = parsed;
      if (prices.length > WIDTHS_MM.length) continue;

      const offset = WIDTHS_MM.length - prices.length;
      if (offset < 0) continue;

      for (let c = 0; c < prices.length; c++) {
        const w = WIDTHS_MM[offset + c];
        brackets.push({
          width_mm_max: w,
          height_mm_max: heightMm,
          base_price_czk: prices[c],
          sort_order: sort++,
        });
      }

      if (heightMm >= 3400) break;
    }

    if (brackets.length > 100) {
      return { brackets };
    }
  }

  throw new Error("V PDF nebyla nalezena tabulka RADIX (hlavička 700 … 3000 mm).");
}
