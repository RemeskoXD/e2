/**
 * Extrakce ceníkových matic pro Plisé žaluzie
 */

export function parseFirstPliseMatrix(fullText) {
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let widthLineIdx = -1;
  let widths = [];
  for (let i = 0; i < lines.length; i++) {
    const toks = lines[i].split(/\s+/);
    const nums = toks.map(Number);
    if (i < 20) console.log("i=", i, "nums:", nums);
    // V plise jsou šířky od 400 výš, typicky do 2200 nebo 2300.
    if (
      nums.length >= 10 &&
      nums[0] === 400 &&
      nums[1] === 500 &&
      nums.every((n) => Number.isFinite(n))
    ) {
      widthLineIdx = i;
      widths = nums;
      break;
    }
  }

  if (widthLineIdx < 0) {
    throw new Error("Nenalezen řádek se šířkami tabulky (400 500 600...).");
  }

  const brackets = [];
  let sort = 0;

  for (let i = widthLineIdx + 1; i < lines.length; i++) {
    // Oprava mezer v tisících: "1 090" -> "1090"
    let lineFixed = lines[i].replace(/(\d)\s+(\d{3})(?=\s|$)/g, "$1$2");
    lineFixed = lineFixed.replace(/(\d)\s+(\d{3})(?=\s|$)/g, "$1$2");

    const toks = lineFixed.split(/\s+/);
    const height = Number(toks[0]);
    if (!Number.isFinite(height) || height < 400 || height > 4000) {
      if (brackets.length > 0) break; 
      continue;
    }

    const prices = toks.slice(1).map(Number);
    if (prices.length !== widths.length) {
      if (prices.length > widths.length && prices.every(n => Number.isFinite(n))) {
        // Ok, use only the first N
      } else {
        console.log("FAIL LENGTH:", prices.length, "vs", widths.length, "toks:", toks);
        if (brackets.length > 0) break;
        continue;
      }
    }

    if (prices.some((n) => !Number.isFinite(n))) {
       console.log("FAIL FINITE! prices:", prices);
       if (brackets.length > 0) break;
       continue;
    }

    for (let c = 0; c < widths.length; c++) {
      const w = widths[c];
      const p = prices[c];
      brackets.push({
        width_mm_max: w,
        height_mm_max: height,
        base_price_czk: p,
        sort_order: sort++
      });
    }
  }

  if (brackets.length === 0) {
    throw new Error("Nepodařilo se načíst žádné buňky ceníku.");
  }

  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  // Vratíme min/max dimensions
  const dims = {
    width_mm_min: Math.min(...widths),
    width_mm_max: Math.max(...widths),
    height_mm_min: Math.min(...brackets.map(b => b.height_mm_max)),
    height_mm_max: Math.max(...brackets.map(b => b.height_mm_max))
  };

  return { widths, brackets, minPrice, dims };
}
