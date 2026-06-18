/** PostgreSQL / JSON často vrací ceny jako string nebo null. */
export function toMoneyNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Cena pro zákazníka: základ z ceníku × (1 + %) dodavatele × (1 + provize %), zaokrouhleno na celé Kč. */
export function computeDisplayPriceCzk(
  basePriceCzk: number,
  supplierMarkupPercent: number,
  commissionPercent: number
): number {
  const base = toMoneyNumber(basePriceCzk);
  const s = toMoneyNumber(supplierMarkupPercent);
  const c = toMoneyNumber(commissionPercent);
  const v = base * (1 + s / 100) * (1 + c / 100);
  return Math.round(v);
}

export function formatCzk(value: unknown): string {
  return toMoneyNumber(value).toLocaleString('cs-CZ');
}
