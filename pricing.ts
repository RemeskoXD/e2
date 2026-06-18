export function computeRetailCzk(
  basePriceCzk: number,
  supplierMarkupPercent: number,
  commissionPercent: number
): number {
  const base = Number(basePriceCzk) || 0;
  const s = Number(supplierMarkupPercent) || 0;
  const c = Number(commissionPercent) || 0;
  return Math.round(base * (1 + s / 100) * (1 + c / 100));
}
