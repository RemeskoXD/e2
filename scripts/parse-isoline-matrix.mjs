/**
 * Z textu PDF (pdf-parse) vytáhne první matici cen: řádek šířek 300…2200,
 * pak řádky výška + ceny až k prvnímu výskytu "Pro stanovení ceny".
 */

export function parseFirstIsolineMatrix(fullText) {
  const beforeNote = fullText.split("Pro stanovení ceny")[0];
  const lines = beforeNote
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let widthLineIdx = -1;
  let widths = [];
  for (let i = 0; i < lines.length; i++) {
    const toks = lines[i].split(/\s+/);
    const nums = toks.map((t) => Number(t.replace(",", ".")));
    if (
      nums.length >= 15 &&
      nums[0] === 300 &&
      nums[1] === 400 &&
      nums.every((n) => Number.isFinite(n))
    ) {
      widthLineIdx = i;
      widths = nums;
      break;
    }
  }
  if (widthLineIdx < 0) {
    throw new Error("Nenalezen řádek se šířkami tabulky (300 400 500 …).");
  }

  const brackets = [];
  for (let i = widthLineIdx + 1; i < lines.length; i++) {
    const toks = lines[i].split(/\s+/);
    const nums = toks.map((t) => Number(String(t).replace(",", ".")));
    if (nums.some((n) => !Number.isFinite(n))) continue;
    if (nums.length !== widths.length + 1) continue;
    const height = nums[0];
    if (height < 200 || height > 5000) continue;
    for (let c = 0; c < widths.length; c++) {
      const w = widths[c];
      const price = Math.round(nums[c + 1]);
      if (!Number.isFinite(price) || price <= 0) continue;
      brackets.push({
        width_mm_max: w,
        height_mm_max: height,
        base_price_czk: price,
      });
    }
  }

  if (brackets.length === 0) {
    throw new Error("Nepodařilo se načíst žádné buňky ceníku.");
  }

  const minPrice = Math.min(...brackets.map((b) => b.base_price_czk));
  return { widths, brackets, minPrice };
}
