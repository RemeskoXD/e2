/**
 * Screenová roleta UNION L — ceny Kč bez DPH, rozměry v PDF v cm → zde mm.
 * Mřížka 9×8 (šířka 50–450 cm, výška 40–400 cm v katalogu); pro výrobu Screen/Polyscreen/Tara
 * typicky max. 400×300 cm — import a validace quote omezují na 4000×3000 mm.
 */

/** Sloupce šířka v mm (50 … 450 cm) */
export const UNION_L_WIDTHS_MM = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500];

/** Řádky výška v mm (50 … 400 cm) */
export const UNION_L_HEIGHTS_MM = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];

/**
 * Řádky v pořadí výšek 500 … 4000 mm, každý řádek = ceny pro UNION_L_WIDTHS_MM.
 */
export const UNION_L_PRICE_GRID = [
  [4091, 4474, 4931, 5848, 6230, 6575, 7493, 7989, 8563],
  [4474, 4931, 5657, 6422, 7186, 7837, 8563, 9250, 9938],
  [4817, 5314, 6230, 7186, 7989, 8945, 9825, 10665, 11582],
  [5122, 5657, 6766, 7837, 8945, 9938, 11010, 12079, 13111],
  [5657, 5963, 7493, 8563, 9825, 11162, 12271, 13494, 14793],
  [5963, 6308, 8068, 9250, 10665, 12157, 13609, 15137, 16361],
  [6422, 6919, 8410, 9938, 11582, 13226, 14870, 16361, 18006],
  [7072, 7493, 9020, 10665, 12501, 14297, 16361, 18006, 19915],
];

export const UNION_L_MAX_WIDTH_MM = 4000;
export const UNION_L_MAX_HEIGHT_MM = 3000;

/**
 * Buňky pro DB: jen kombinace do max. rozměru (4000 × 3000 mm).
 */
export function unionLBracketsForImport() {
  const brackets = [];
  let sort = 0;
  for (let ri = 0; ri < UNION_L_HEIGHTS_MM.length; ri++) {
    const h = UNION_L_HEIGHTS_MM[ri];
    if (h > UNION_L_MAX_HEIGHT_MM) continue;
    const row = UNION_L_PRICE_GRID[ri];
    for (let ci = 0; ci < UNION_L_WIDTHS_MM.length; ci++) {
      const w = UNION_L_WIDTHS_MM[ci];
      if (w > UNION_L_MAX_WIDTH_MM) continue;
      brackets.push({
        width_mm_max: w,
        height_mm_max: h,
        base_price_czk: row[ci],
        sort_order: sort++,
      });
    }
  }
  return brackets;
}
