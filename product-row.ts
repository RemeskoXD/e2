import { computeRetailCzk } from "./pricing";

export function num(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export type DimConstraints = {
  width_mm_min: number;
  width_mm_max: number;
  height_mm_min: number;
  height_mm_max: number;
  max_area_m2: number | null;
};

export function readDimConstraints(row: Record<string, unknown>): DimConstraints | null {
  const need: (keyof Omit<DimConstraints, "max_area_m2">)[] = [
    "width_mm_min",
    "width_mm_max",
    "height_mm_min",
    "height_mm_max",
  ];
  if (need.some((k) => row[k] === null || row[k] === undefined || row[k] === "")) {
    return null;
  }
  const width_mm_min = num(row, "width_mm_min");
  const width_mm_max = num(row, "width_mm_max");
  const height_mm_min = num(row, "height_mm_min");
  const height_mm_max = num(row, "height_mm_max");
  let max_area_m2: number | null = null;
  if (row.max_area_m2 !== null && row.max_area_m2 !== undefined && row.max_area_m2 !== "") {
    const a = num(row, "max_area_m2");
    if (a > 0) max_area_m2 = a;
  }
  if (width_mm_max < width_mm_min || height_mm_max < height_mm_min) {
    return null;
  }
  return { width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2 };
}

export function optIntCol(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function optStrCol(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

export function mapProductRow(row: Record<string, unknown>) {
  const price = num(row, "priceCzk", "price");
  const oldPriceRaw = row.oldPrice ?? row.oldprice;
  const oldPrice =
    oldPriceRaw === null || oldPriceRaw === undefined || oldPriceRaw === ""
      ? null
      : num(row, "oldPrice", "oldprice");
  const supplier = num(row, "supplier_markup_percent", "supplierMarkupPercent");
  const commission = num(row, "commission_percent", "commissionPercent");
  const display_price = computeRetailCzk(price, supplier, commission);
  const old_display =
    oldPrice !== null ? computeRetailCzk(oldPrice, supplier, commission) : null;
  const dim = readDimConstraints(row);
  return {
    ...row,
    title: String(row.name ?? row.title ?? ""),
    category: String(row.categoryId ?? row.category ?? ""),
    img: String(row.image ?? row.img ?? ""),
    desc: String(row.description ?? row.desc ?? ""),
    price,
    oldPrice: oldPrice !== null ? oldPrice : undefined,
    supplier_markup_percent: supplier,
    commission_percent: commission,
    display_price,
    old_display_price: old_display,
    dimension_constraints: dim,
    fabric_group: optIntCol(row, "fabric_group"),
    validation_profile: optStrCol(row, "validation_profile"),
    hidden: Boolean(row.hidden),
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    colors: Array.isArray(row.colors) ? row.colors : [],
    extras: Array.isArray(row.extras) ? row.extras : [],
    parameters: Array.isArray(row.parameters) ? row.parameters : [],
    fabric_groups_config: Array.isArray(row.fabric_groups_config) ? row.fabric_groups_config : [],
    slug: optStrCol(row, "slug"),
  };
}

export function parseDimBody(body: Record<string, unknown>): DimConstraints | null {
  const pick = (k: string): number | null => {
    const v = body[k];
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const width_mm_min = pick("width_mm_min");
  const width_mm_max = pick("width_mm_max");
  const height_mm_min = pick("height_mm_min");
  const height_mm_max = pick("height_mm_max");
  const maxPick = pick("max_area_m2");
  if (
    width_mm_min == null &&
    width_mm_max == null &&
    height_mm_min == null &&
    height_mm_max == null &&
    maxPick == null
  ) {
    return null;
  }
  if (
    width_mm_min == null ||
    width_mm_max == null ||
    height_mm_min == null ||
    height_mm_max == null
  ) {
    return null;
  }
  if (width_mm_max < width_mm_min || height_mm_max < height_mm_min) {
    return null;
  }
  const max_area_m2 = maxPick != null && maxPick > 0 ? maxPick : null;
  return {
    width_mm_min,
    width_mm_max,
    height_mm_min,
    height_mm_max,
    max_area_m2,
  };
}
