/**
 * Textilní žaluzie JAZZ EXPERT — výrobní a látkové limity (mm).
 * Ceny v katalogu jsou bez DPH.
 */

export const TEXTILE_ZALUZIE_SKUPINA_SURCHARGE_PCT = [0, 20, 30, 45, 80] as const;

/** Normalizace názvu látky z API (malá písmena, diakritika zjednodušená). */
export function normalizeFabricName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Látka → číslo skupiny 1–5 (pro kontrolu proti produktu). */
export function fabricToSkupina(fabricRaw: string): number | null {
  const f = normalizeFabricName(fabricRaw);
  if (!f) return null;
  const map: Record<string, number> = {
    adriana: 1,
    melisa: 1,
    lucy: 2,
    "melisa bo": 2,
    "stella bo": 3,
    "melisa bo b/b": 3,
    "melisa bo b/s": 3,
    tropic: 4,
    screen: 5,
    "screen (nehorlava)": 5,
    "screen (nehořlavá)": 5,
  };
  if (map[f] != null) return map[f];
  if (f.includes("screen") && f.includes("neho")) return 5;
  return null;
}

/** Max. šířka / výška pro konkrétní látku (mm). */
export function fabricMaxDimensions(fabricRaw: string): { w: number; h: number } | null {
  const f = normalizeFabricName(fabricRaw);
  if (!f) return null;
  if (f.includes("screen") && f.includes("neho")) return { w: 1800, h: 2250 };
  if (f === "lucy") return { w: 2000, h: 2500 };
  if (
    f === "adriana" ||
    f === "melisa" ||
    f === "tropic" ||
    f === "stella bo" ||
    f === "melisa bo" ||
    f === "melisa bo b/b" ||
    f === "melisa bo b/s"
  ) {
    return { w: 1950, h: 2500 };
  }
  if (fabricToSkupina(fabricRaw) != null) {
    return { w: 1950, h: 2500 };
  }
  return null;
}

export type TextileZaluzieValidationError = { error: string };

/**
 * Globální pravidla výroby + volitelně max. rozměry podle látky.
 * - Nelze současně šířka > 1950 a výška > 1950.
 * - Pokud šířka > 1950, výška max 1850.
 */
export function validateTextileZaluzieDimensions(
  widthMm: number,
  heightMm: number,
  fabricRaw?: string
): TextileZaluzieValidationError | null {
  const w = Math.round(widthMm);
  const h = Math.round(heightMm);
  if (w > 1950 && h > 1950) {
    return {
      error:
        "Textilní žaluzii nelze vyrobit se šířkou i výškou současně nad 1 950 mm. Pouze jeden rozměr smí tuto hranici překročit.",
    };
  }
  if (w > 1950 && h > 1850) {
    return {
      error:
        "Při šířce nad 1 950 mm je maximální výška 1 850 mm.",
    };
  }
  if (fabricRaw && fabricRaw.trim()) {
    const lim = fabricMaxDimensions(fabricRaw);
    if (lim) {
      if (w > lim.w) {
        return { error: `U této látky je maximální šířka ${lim.w} mm.` };
      }
      if (h > lim.h) {
        return { error: `U této látky je maximální výška ${lim.h} mm.` };
      }
    }
  }
  return null;
}
