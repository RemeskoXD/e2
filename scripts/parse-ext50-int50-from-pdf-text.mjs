/**
 * Parsuje text z PDF (getText) — mřížky EXT 50 / INT 50 standard, část 1 + 2.
 * Vrací buňky pro ProductPriceBracket: width_mm_max, height_mm_max, base_price_czk.
 */

/** @param {string} line */
function isPageFooter(line) {
  return /^--\s*\d+\s+of\s+\d+\s+--$/i.test(line.trim());
}

/**
 * @param {string[]} lines
 * @param {number} startLine
 * @returns {{ widthsMm: number[], rows: { heightMm: number, prices: number[] }[], endLine: number } | null}
 */
export function parseMatrixTable(lines, startLine) {
  const header = lines[startLine]?.trim() ?? "";
  const m = header.match(/^výška\s*\(m\)\s+(.+)$/i);
  if (!m) return null;

  const widthsMm = m[1]
    .trim()
    .split(/\s+/)
    .map((s) => Math.round(parseFloat(s.replace(",", ".")) * 1000));

  if (!widthsMm.length || widthsMm.some((w) => !Number.isFinite(w) || w < 1)) {
    return null;
  }

  const rows = [];
  let i = startLine + 1;
  for (; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    if (isPageFooter(line)) continue;
    if (/^legenda:/i.test(line)) break;
    if (/^Ceny jsou uvedeny/i.test(line)) break;
    if (/část\s+\d+\s+z\s+\d+/i.test(line) && !/^\d/.test(line)) break;
    if (/^výška\s*\(m\)/i.test(line)) break;

    const parts = line.split(/\s+/);
    const hStr = parts[0]?.replace(",", ".") ?? "";
    if (parts[1] === "-" || /bez\s+garance/i.test(line)) continue;

    const hM = parseFloat(hStr);
    if (!Number.isFinite(hM)) continue;

    const heightMm = Math.round(hM * 1000);
    const priceParts = parts.slice(1);
    const prices = priceParts.map((p) => parseInt(p, 10));
    if (prices.some((x) => !Number.isFinite(x))) continue;
    if (prices.length !== widthsMm.length) {
      continue;
    }
    rows.push({ heightMm, prices });
  }

  return { widthsMm, rows, endLine: i };
}

/**
 * Najde v plném textu PDF první dvojici tabulek (část 1 + část 2) pro EXT 50 INT 50 standard.
 * Přeskakuje tabulky EXT 50-V (motor) podle nižších čísel v buňkách / nadpisu.
 *
 * @param {string} fullText
 * @returns {{ brackets: { width_mm_max: number, height_mm_max: number, base_price_czk: number }[] }}
 */
export function extractExt50Int50StandardMatrices(fullText) {
  const lines = fullText.split(/\r?\n/).map((l) => l.trimEnd());

  /** @type {Map<string, number>} */
  const cellMap = new Map();
  const key = (w, h) => `${w}|${h}`;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^výška\s*\(m\)/i.test(line)) {
      const t1 = parseMatrixTable(lines, i);
      if (!t1 || t1.rows.length < 10) {
        i++;
        continue;
      }

      let j = t1.endLine;
      while (j < lines.length && !/^výška\s*\(m\)/i.test(lines[j].trim())) {
        j++;
      }
      if (j >= lines.length) break;

      const t2 = parseMatrixTable(lines, j);
      if (!t2 || t2.rows.length < 10) {
        i++;
        continue;
      }

      const samplePrice = t1.rows.find((r) => r.heightMm === 500)?.prices[0];
      if (samplePrice != null && samplePrice < 1400) {
        i = t2.endLine;
        continue;
      }

      for (const r of t1.rows) {
        for (let c = 0; c < t1.widthsMm.length; c++) {
          const w = t1.widthsMm[c];
          const p = r.prices[c];
          cellMap.set(key(w, r.heightMm), p);
        }
      }
      for (const r of t2.rows) {
        for (let c = 0; c < t2.widthsMm.length; c++) {
          const w = t2.widthsMm[c];
          const p = r.prices[c];
          cellMap.set(key(w, r.heightMm), p);
        }
      }

      const brackets = [];
      const heights = [...new Set([...t1.rows.map((r) => r.heightMm), ...t2.rows.map((r) => r.heightMm)])].sort(
        (a, b) => a - b
      );
      const widths = [...new Set([...t1.widthsMm, ...t2.widthsMm])].sort((a, b) => a - b);

      let sort = 0;
      for (const h of heights) {
        for (const w of widths) {
          const pr = cellMap.get(key(w, h));
          if (pr == null) continue;
          brackets.push({
            width_mm_max: w,
            height_mm_max: h,
            base_price_czk: pr,
            sort_order: sort++,
          });
        }
      }

      return { brackets };
    }
    i++;
  }

  throw new Error("V textu PDF se nepodařilo najít dvojici mřížek EXT 50 / INT 50 (standard).");
}
