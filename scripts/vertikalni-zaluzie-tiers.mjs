/**
 * Vertikální žaluzie — Kč/m² bez DPH podle výšky žaluzie (mm).
 * Pásma sjednocená tak, aby mezery mezi řádky ceníku (např. 1501–1509) spadly do nižšího pásma.
 */

export const VERTIKAL_HEIGHT_TIERS = [
  { height_mm_min: 0, height_mm_max: 1509, sort_order: 0 },
  { height_mm_min: 1510, height_mm_max: 2009, sort_order: 1 },
  { height_mm_min: 2010, height_mm_max: 2409, sort_order: 2 },
  { height_mm_min: 2410, height_mm_max: 3009, sort_order: 3 },
  { height_mm_min: 3010, height_mm_max: 4009, sort_order: 4 },
  { height_mm_min: 4010, height_mm_max: 9_999_999, sort_order: 5 },
];

/** SONIA — Kč/m² */
export const SONIA_PRICE_PER_M2 = [555, 472, 452, 430, 409, 391];

/** VANESA / VIOLA — Kč/m² (stejný ceník) */
export const VANESA_VIOLA_PRICE_PER_M2 = [787, 712, 680, 647, 614, 593];

export function tiersWithPrices(pricePerM2List) {
  if (pricePerM2List.length !== VERTIKAL_HEIGHT_TIERS.length) {
    throw new Error("Počet cen za m² neodpovídá počtu pásem výšky.");
  }
  return VERTIKAL_HEIGHT_TIERS.map((t, i) => ({
    ...t,
    price_per_m2_czk: pricePerM2List[i],
  }));
}
