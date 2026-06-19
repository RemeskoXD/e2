import type { Pool, PoolClient } from "pg";
import { computeRetailCzk } from "./pricing";
import { fabricToSkupina, validateTextileZaluzieDimensions } from "./textile-zaluzie-rules";
import {
  mapProductRow,
  num,
  optIntCol,
  optStrCol,
  readDimConstraints,
} from "./product-row";

export type QuoteComputeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Stejná logika jako POST /api/products/:id/quote — pro sdílené použití při vytváření objednávky.
 */
export async function computeProductQuote(
  db: Pool | PoolClient,
  productId: string,
  widthMm: number,
  heightMm: number,
  body: Record<string, unknown>
): Promise<QuoteComputeResult> {
  const id = productId;
  const pr = await db.query('SELECT * FROM "Product" WHERE id = $1', [id]);
  if (!pr.rows[0]) {
    return { ok: false, status: 404, body: { error: "Produkt nenalezen" } };
  }
  const rawRow = pr.rows[0] as Record<string, unknown>;
  const product = mapProductRow(rawRow);
  const dim = readDimConstraints(rawRow);
  const wR = Math.round(widthMm);
  const hR = Math.round(heightMm);
  const productTitle = String(rawRow.title ?? "");

  if (dim) {
    if (wR < dim.width_mm_min || wR > dim.width_mm_max) {
      return {
        ok: false,
        status: 400,
        body: { error: `Šířka musí být v rozmezí ${dim.width_mm_min}–${dim.width_mm_max} mm.` },
      };
    }
    if (hR < dim.height_mm_min || hR > dim.height_mm_max) {
      return {
        ok: false,
        status: 400,
        body: { error: `Výška musí být v rozmezí ${dim.height_mm_min}–${dim.height_mm_max} mm.` },
      };
    }
    const areaM2 = (wR * hR) / 1_000_000;
    if (dim.max_area_m2 != null && areaM2 - dim.max_area_m2 > 1e-6) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Plocha ${areaM2.toFixed(2)} m² překračuje maximum ${dim.max_area_m2} m².`,
        },
      };
    }
  }

  const valProfile = optStrCol(rawRow, "validation_profile");
  const fabricGroup = optIntCol(rawRow, "fabric_group");
  const fabricRaw = String(body?.fabric ?? body?.latka ?? "").trim();
  let screenUnionQuote: { poly: boolean; noFabric: boolean; ral: boolean } | null = null;
  const screenUnionCatalogNotes: string[] = [];

  if (valProfile === "screen_roleta_union_l") {
    const b = body;
    const fabricS = String(b?.fabric ?? b?.latka ?? "").toLowerCase();
    const poly =
      b?.polyscreen === true ||
      String(b?.polyscreen ?? "").toLowerCase() === "true" ||
      fabricS.includes("polyscreen");
    const noFabric =
      b?.bez_latky === true ||
      b?.without_fabric === true ||
      String(b?.bez_latky ?? "").toLowerCase() === "true" ||
      String(b?.without_fabric ?? "").toLowerCase() === "true" ||
      fabricS.includes("bez latky") ||
      fabricS.includes("bez látky");
    const ral =
      b?.ral_dolni_profil === true ||
      b?.ral === true ||
      String(b?.ral ?? "").toLowerCase() === "true" ||
      String(b?.ral_dolni_profil ?? "").toLowerCase() === "true";
    if (poly && noFabric) {
      return {
        ok: false,
        status: 400,
        body: {
          error: "Nelze kombinovat Polyscreen (+40 %) a provedení bez látky (−25 %).",
        },
      };
    }
    screenUnionQuote = { poly, noFabric, ral };
  }

  if (valProfile === "textile_zaluzie") {
    const vzErr = validateTextileZaluzieDimensions(wR, hR, fabricRaw || undefined);
    if (vzErr) {
      return { ok: false, status: 400, body: vzErr };
    }
    if (fabricRaw && fabricGroup != null) {
      const fSk = fabricToSkupina(fabricRaw);
      if (fSk != null && fSk !== fabricGroup) {
        return {
          ok: false,
          status: 400,
          body: {
            error: `Vybraná látka patří do skupiny ${fSk}, tento produkt je skupina látek ${fabricGroup}.`,
          },
        };
      }
    }
  }

  const priceMode = String(rawRow.price_mode ?? "matrix_cell").trim() || "matrix_cell";
  const supplier = product.supplier_markup_percent ?? 0;
  const commission = product.commission_percent ?? 0;

  let parametersSurcharge = 0;
  const paramsNotes: string[] = [];
  if (body?.selected_parameters && typeof body.selected_parameters === 'object') {
    const paramsObj = body.selected_parameters as Record<string, string>;
    const pParams = Array.isArray(product.parameters) ? product.parameters : [];
    
    const actualAreaM2 = (wR * hR) / 1_000_000;
    // Speciální pravidlo pro Isoline: minimální účtovaná plocha pro příplatky je 0.5 m2
    const isIsoline = productTitle.toLowerCase().includes('isoline');
    const calcAreaM2 = isIsoline ? Math.max(0.5, actualAreaM2) : actualAreaM2;
    const calcWidthM = wR / 1000;

    for (const p of pParams) {
      const val = paramsObj[p.id];
      if (val) {
        const opt = p.options?.find((o: any) => o.value === val);
        if (opt && opt.priceVariant) {
          const rawPrice = Number(opt.priceVariant) || 0;
          let calculatedPrice = rawPrice;
          let calcNote = `${rawPrice} Kč`;
          
          if (opt.priceType === 'per_m2') {
             calculatedPrice = rawPrice * calcAreaM2;
             calcNote = `${rawPrice} Kč/m² × ${calcAreaM2.toFixed(2)} m²`;
          } else if (opt.priceType === 'per_bm') {
             calculatedPrice = rawPrice * calcWidthM;
             calcNote = `${rawPrice} Kč/bm × ${calcWidthM.toFixed(2)} bm šířky`;
          } else if (opt.priceType === 'per_bm_height') {
             const calcHeightM = hR / 1000;
             calculatedPrice = rawPrice * calcHeightM;
             calcNote = `${rawPrice} Kč/bm × ${calcHeightM.toFixed(2)} bm výšky`;
          }

          parametersSurcharge += Math.round(calculatedPrice);
          paramsNotes.push(`+ ${p.name}: ${opt.label} (${calcNote} = ${Math.round(calculatedPrice)} Kč)`);
        }
      }
    }
  }

  // New logic for Fabric Group surcharge per m2
  let extraSurchargeFromFabricGroup = 0;
  if (body.fabric_group_id) {
    const fgRes = await db.query('SELECT surcharge FROM "FabricGroup" WHERE id = $1', [body.fabric_group_id]);
    if (fgRes.rows[0]) {
      const perM2 = parseFloat(fgRes.rows[0].surcharge);
      if (!isNaN(perM2) && perM2 > 0) {
        const areaM2 = (wR * hR) / 1_000_000;
        extraSurchargeFromFabricGroup = perM2 * areaM2;
      }
    }
  }

  if (priceMode === "vertikalni_zaluzie") {
    const color = String(body.color || '').trim().toLowerCase();
    
    const VERTIKALNI_PRICES = [
      { maxH: 1500, prices: { g1: 672, g2: 730, g3: 759, g4: 823, g5: 842, g6: 862, g7: 906 } },
      { maxH: 2000, prices: { g1: 571, g2: 624, g3: 651, g4: 730, g5: 753, g6: 768, g7: 817 } },
      { maxH: 2400, prices: { g1: 547, g2: 599, g3: 640, g4: 690, g5: 710, g6: 730, g7: 776 } },
      { maxH: 3000, prices: { g1: 520, g2: 575, g3: 599, g4: 651, g5: 673, g6: 690, g7: 736 } },
      { maxH: 4000, prices: { g1: 495, g2: 547, g3: 575, g4: 612, g5: 630, g6: 651, g7: 698 } },
      { maxH: 10000, prices: { g1: 473, g2: 520, g3: 547, g4: 586, g5: 609, g6: 624, g7: 672 } },
    ];
    
    const VERTIKALNI_GROUPS: Record<string, keyof typeof VERTIKALNI_PRICES[0]['prices']> = {
      'sonia': 'g1',
      'evelyn': 'g2',
      'polly': 'g2',
      'ronnie': 'g3',
      'carol': 'g4',
      'inez': 'g4',
      'corra': 'g5',
      'beata': 'g5',
      'sandra': 'g6',
      'sonia fr': 'g7',
      'ray': 'g7',
    };

    if (!color || !VERTIKALNI_GROUPS[color]) {
      return {
        ok: false,
        status: 400,
        body: { error: "Vyberte prosím platnou látku/barvu ze vzorníku pro výpočet ceny." },
      };
    }

    const groupKey = VERTIKALNI_GROUPS[color];
    const tier = VERTIKALNI_PRICES.find(t => hR <= t.maxH) || VERTIKALNI_PRICES[VERTIKALNI_PRICES.length - 1];
    const pricePerM2 = tier.prices[groupKey];
    
    // U vertikálních žaluzií se plocha počítá zadaná šířka a výška
    // Někdy může být minimální účtovací plocha – pokud ano, aplikovat zde.
    // Ceník neuvádí, předpokládáme čistou plochu:
    const areaM2 = (wR * hR) / 1_000_000;
    
    const baseCatalog = Math.round(areaM2 * pricePerM2) + extraSurchargeFromFabricGroup;
    let extraSurchargesTotal = 0;
    
    if (Array.isArray(body?.selected_extras_ids)) {
      const productExtras = Array.isArray(product.extras) ? product.extras : [];
      for (const ec of productExtras) {
        if (body.selected_extras_ids.includes(ec.id)) {
          extraSurchargesTotal += Number(ec.price) || 0;
        }
      }
    }
    
    extraSurchargesTotal += parametersSurcharge;
    
    const total_czk = computeRetailCzk(baseCatalog, supplier, commission) + extraSurchargesTotal;
    
    return {
      ok: true,
      data: {
        product_id: id,
        product_title: productTitle,
        width_mm: wR,
        height_mm: hR,
        rounded_width_mm: wR,
        rounded_height_mm: hR,
        area_m2: Math.round(areaM2 * 1_000_000) / 1_000_000,
        price_per_m2_czk: pricePerM2,
        base_catalog_czk: baseCatalog,
        supplier_markup_percent: supplier,
        commission_percent: commission,
        total_czk,
        source: "vertikalni_zaluzie",
        pricing: `Kč/m² bez DPH (${pricePerM2} Kč/m²) podle výšky žaluzie a vybrané látky (${color.toUpperCase()}) × plocha.`,
        prices_ex_vat: true,
        vat_note: "Katalogové ceny jsou bez DPH (21 %).",
        dimension_constraints: dim,
      },
    };
  }

  if (priceMode === "vertikalni_zaluzie_premium") {
    const color = String(body.color || '').trim().toLowerCase();
    
    // prices per m2 per bracket
    const VERTIKALNI_PREMIUM_PRICES = [
      { maxH: 1500, prices: { g1: 952, g2: 1030, g3: 1095, g4: 1104, g5: 1147, g6: 1277 } },
      { maxH: 2000, prices: { g1: 862, g2: 952, g3: 1019, g4: 1029, g5: 1095, g6: 1228 } },
      { maxH: 2400, prices: { g1: 823, g2: 872, g3: 938, g4: 947, g5: 1042, g6: 1200 } },
      { maxH: 3000, prices: { g1: 783, g2: 823, g3: 885, g4: 898, g5: 1004, g6: 1174 } },
      { maxH: 4000, prices: { g1: 743, g2: 796, g3: 862, g4: 871, g5: 963, g6: 1122 } },
      { maxH: 10000, prices: { g1: 718, g2: 768, g3: 835, g4: 846, g5: 938, g6: 1068 } },
    ];
    
    const VERTIKALNI_PREMIUM_GROUPS: Record<string, keyof typeof VERTIKALNI_PREMIUM_PRICES[0]['prices']> = {
      'vanesa': 'g1',
      'viola': 'g1',
      'aneta': 'g2',
      'marina': 'g2',
      'patricia': 'g3',
      'peggi': 'g3',
      'debra': 'g4',
      'melissa bo': 'g4',
      'tanya': 'g5',
      'sharon': 'g6',
    };

    if (!color || !VERTIKALNI_PREMIUM_GROUPS[color]) {
      return {
        ok: false,
        status: 400,
        body: { error: "Vyberte prosím platnou prémiovou látku/barvu ze vzorníku pro výpočet ceny." },
      };
    }

    const groupKey = VERTIKALNI_PREMIUM_GROUPS[color];
    const tier = VERTIKALNI_PREMIUM_PRICES.find(t => hR <= t.maxH) || VERTIKALNI_PREMIUM_PRICES[VERTIKALNI_PREMIUM_PRICES.length - 1];
    const pricePerM2 = tier.prices[groupKey];
    
    const areaM2 = (wR * hR) / 1_000_000;
    
    const baseCatalog = Math.round(areaM2 * pricePerM2) + extraSurchargeFromFabricGroup;
    let extraSurchargesTotal = 0;
    
    if (Array.isArray(body?.selected_extras_ids)) {
      const productExtras = Array.isArray(product.extras) ? product.extras : [];
      for (const ec of productExtras) {
        if (body.selected_extras_ids.includes(ec.id)) {
          extraSurchargesTotal += Number(ec.price) || 0;
        }
      }
    }
    
    const total_czk = computeRetailCzk(baseCatalog, supplier, commission) + extraSurchargesTotal;
    
    return {
      ok: true,
      data: {
        product_id: id,
        product_title: productTitle,
        width_mm: wR,
        height_mm: hR,
        rounded_width_mm: wR,
        rounded_height_mm: hR,
        area_m2: Math.round(areaM2 * 1_000_000) / 1_000_000,
        price_per_m2_czk: pricePerM2,
        base_catalog_czk: baseCatalog,
        supplier_markup_percent: supplier,
        commission_percent: commission,
        total_czk,
        source: "vertikalni_zaluzie_premium",
        pricing: `Kč/m² bez DPH (${pricePerM2} Kč/m²) podle výšky žaluzie a vybrané prémiové látky (${color.toUpperCase()}) × plocha.`,
        prices_ex_vat: true,
        vat_note: "Katalogové ceny jsou bez DPH (21 %).",
        dimension_constraints: dim,
      },
    };
  }

  if (priceMode === "m2_height_tiers") {
    const tierRes = await db.query(
      `SELECT * FROM "ProductHeightPriceTier"
       WHERE product_id = $1 AND $2::int >= height_mm_min AND $2::int <= height_mm_max
       ORDER BY sort_order ASC LIMIT 1`,
      [id, hR]
    );
    if (!tierRes.rows[0]) {
      return {
        ok: false,
        status: 400,
        body: { error: "Výška žaluzie nespadá do žádného pásma ceníku (zkontrolujte mm)." },
      };
    }
    const tier = tierRes.rows[0] as Record<string, unknown>;
    const pricePerM2 = num(tier, "price_per_m2_czk", "pricePerM2Czk");
    const areaM2 = (wR * hR) / 1_000_000;
    const baseCatalog = Math.round(areaM2 * pricePerM2) + Math.round(extraSurchargeFromFabricGroup);
    const total_czk = computeRetailCzk(baseCatalog, supplier, commission);
    return {
      ok: true,
      data: {
        product_id: id,
        product_title: productTitle,
        width_mm: wR,
        height_mm: hR,
        rounded_width_mm: wR,
        rounded_height_mm: hR,
        area_m2: Math.round(areaM2 * 1_000_000) / 1_000_000,
        price_per_m2_czk: pricePerM2,
        height_tier: {
          height_mm_min: num(tier, "height_mm_min", "heightMmMin"),
          height_mm_max: num(tier, "height_mm_max", "heightMmMax"),
        },
        base_catalog_czk: baseCatalog,
        supplier_markup_percent: supplier,
        commission_percent: commission,
        total_czk,
        source: "m2_height_tiers",
        pricing: "Kč/m² bez DPH podle výšky žaluzie × plocha (šířka × výška).",
        prices_ex_vat: true,
        vat_note: "Katalogové ceny jsou bez DPH (21 %).",
        dimension_constraints: dim,
      },
    };
  }

  const br = await db.query(
    `SELECT * FROM "ProductPriceBracket"
     WHERE product_id = $1 AND width_mm_max >= $2 AND height_mm_max >= $3
     ORDER BY width_mm_max ASC, height_mm_max ASC, base_price_czk ASC
     LIMIT 1`,
    [id, wR, hR]
  );
  let baseCatalogCzk =
    br.rows[0] != null
      ? num(br.rows[0] as Record<string, unknown>, "base_price_czk", "basePriceCzk")
      : num(product as Record<string, unknown>, "price");
  const matrixProfile = optStrCol(rawRow, "validation_profile");
  let radix_lamela_note: string | undefined;
  if (matrixProfile === "venkovni_roleta_radix") {
    const lamRaw = body?.lamela;
    const lamStr =
      lamRaw !== undefined && lamRaw !== null && String(lamRaw).trim() !== ""
        ? String(lamRaw).trim()
        : "39";
    const digitsOnly = lamStr.replace(/\D/g, "");
    const lamNum = digitsOnly ? parseInt(digitsOnly, 10) : 39;
    if (lamNum === 40) {
      baseCatalogCzk = Math.round(baseCatalogCzk * 1.05);
      radix_lamela_note = "Lamela 40: +5 % k tabulkové ceně (bez DPH), dle ceníku RADIX.";
    }
  }

  let pliseNote: string | undefined;
  if (matrixProfile === "plise" || matrixProfile === "plise_lagarta") {
    const model = body?.model ? String(body.model) : "PM1";
    pliseNote = `Model ${model}`;
  }

  // --- PLISÉ LAGARTA CUSTOM LOGIC ---
  if (matrixProfile === "plise_lagarta") {
    const model = String(body?.model || "PM1");
    
    // 1. Kontrola limitů modelu
    const limits: Record<string, { minW: number, maxW: number, minH: number, maxH: number }> = {
      'PM1': { minW: 160, maxW: 1500, minH: 300, maxH: 2500 },
      'PM2': { minW: 200, maxW: 1000, minH: 300, maxH: 2500 },
      'PM3': { minW: 200, maxW: 1500, minH: 300, maxH: 2500 },
      'PM3M': { minW: 200, maxW: 1500, minH: 300, maxH: 2500 },
      'PM5': { minW: 200, maxW: 1500, minH: 300, maxH: 2500 },
      'PM4': { minW: 200, maxW: 1500, minH: 300, maxH: 2200 },
      'PP1': { minW: 160, maxW: 2300, minH: 300, maxH: 2600 },
      'PP2': { minW: 160, maxW: 2300, minH: 300, maxH: 2600 },
      'PS3': { minW: 200, maxW: 1500, minH: 300, maxH: 1500 },
      'AM1': { minW: 200, maxW: 1500, minH: 300, maxH: 1500 },
      'AM2': { minW: 200, maxW: 1500, minH: 300, maxH: 1500 },
      'AP1': { minW: 200, maxW: 2000, minH: 300, maxH: 1000 },
    };
    const lim = limits[model];
    if (lim) {
      if (wR < lim.minW || wR > lim.maxW || hR < lim.minH || hR > lim.maxH) {
         // Speciální výjimka u AP1 dle ceníku
         if (model === 'AP1' && wR >= 200 && wR <= 1000 && hR >= 300 && hR <= 2000) {
            // ok
         } else {
            return { ok: false, status: 400, body: { error: `Model ${model} lze vyrobit pouze v šířce ${lim.minW}-${lim.maxW} mm a výšce ${lim.minH}-${lim.maxH} mm.` } };
         }
      }
    }

    // 2. Získání základní ceny z JSON matice uvnitř skupiny látek
    let lagartaPrice = 0;
    if (typeof body.fabric_group_config_index === 'number') {
      const configs = Array.isArray(product.fabric_groups_config) ? product.fabric_groups_config : [];
      const cfg = configs[body.fabric_group_config_index] as any;
      if (cfg && cfg.matrix) {
        // Find nearest width and height
        const widths = [400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300];
        const heights = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600];
        const tW = widths.find(w => w >= wR);
        const tH = heights.find(h => h >= hR);
        if (tW && tH && cfg.matrix[`${tW}_${tH}`]) {
          lagartaPrice = cfg.matrix[`${tW}_${tH}`];
        } else {
          return { ok: false, status: 400, body: { error: `Pro rozměr ${wR}x${hR} s touto látkou neexistuje cena v ceníku.` } };
        }
      }
    }
    if (!lagartaPrice) {
      return { ok: false, status: 400, body: { error: "Nepodařilo se určit cenu látky z matice." } };
    }

    // Fabric-specific rules
    const fabricS = String(body?.fabric ?? body?.latka ?? "").toLowerCase();
    const isBlackoutOrBamboo = fabricS.includes("blackout") || fabricS.includes("bamboo");

    if (model === 'AP1' && fabricS.includes("living blackout")) {
      return { ok: false, status: 400, body: { error: `Model AP1 nelze vyrobit v provedení Living Blackout.` } };
    }

    if (model === 'PS3' && body?.selected_parameters?.barva_profilu) {
       const b = body.selected_parameters.barva_profilu;
       if (b === 'kremova' || b === 'cerna') {
         return { ok: false, status: 400, body: { error: `Pro model PS3 nejsou barvy Krémová a Černá dostupné v základním vzorníku.` } };
       }
    }

    if (isBlackoutOrBamboo) {
      if (hR > 2100) {
        return { ok: false, status: 400, body: { error: `Látky typu Blackout a Bamboo mají omezenou výšku na 2100 mm.` } };
      }
      const areaM2 = (wR * hR) / 1000000;
      if (areaM2 > 2.8) {
        return { ok: false, status: 400, body: { error: `Látky typu Blackout a Bamboo mají omezenou plochu na 2.8 m² (zadáno ${areaM2.toFixed(2)} m²).` } };
      }
      if ((model === 'PM4' || model === 'PM5') && hR > 1800) {
        return { ok: false, status: 400, body: { error: `Pro modely ${model} mají látky Blackout a Bamboo omezenou výšku na 1800 mm.` } };
      }
      if (model === 'PM5') {
        screenUnionCatalogNotes.push(`Upozornění výrobce: Látky typu Blackout a Bamboo Reflex doporučujeme u modelu PM5 používat pouze jako dolní látku vzhledem k vyšší gramáži.`);
      }
    }

    // Dodatečné info z technických tabulek
    if (model.startsWith('PM') || model.startsWith('AM') || model.startsWith('PS')) {
      const madla = wR <= 700 ? 1 : 2;
      screenUnionCatalogNotes.push(`Počet madel pro ovládání: ${madla} ks`);
    }
    const klipy = wR <= 600 ? 2 : wR <= 1000 ? 3 : wR <= 1500 ? 4 : 5;
    screenUnionCatalogNotes.push(`Počet klipů / montážních patek: ${klipy} ks`);

    // 3. Počítat jako dvě samostatné žaluzie (PM4 a PM5)
    if (model === 'PM4' || model === 'PM5') {
      lagartaPrice = lagartaPrice * 2;
      screenUnionCatalogNotes.push(`Model ${model} se počítá jako dvě samostatné žaluzie (základní cena x2).`);
    }

    baseCatalogCzk = lagartaPrice;
  }
  // --- KONEC PLISÉ LAGARTA ---

  if (matrixProfile === "screen_roleta_union_l" && screenUnionQuote) {
    if (screenUnionQuote.noFabric) {
      baseCatalogCzk = Math.round(baseCatalogCzk * 0.75);
      screenUnionCatalogNotes.push("Bez látky: −25 % k základní tabulkové ceně.");
    }
    if (screenUnionQuote.poly) {
      baseCatalogCzk = Math.round(baseCatalogCzk * 1.4);
      screenUnionCatalogNotes.push("Polyscreen: +40 % k základní tabulkové ceně.");
    }
    if (screenUnionQuote.ral) {
      baseCatalogCzk = Math.round(baseCatalogCzk * 1.1);
      screenUnionCatalogNotes.push("Spodní profil v RAL: +10 %.");
    }
  }

  let extraSurchargesTotal = 0;
  if (Array.isArray(body?.selected_extras_ids)) {
    const productExtras = Array.isArray(product.extras) ? product.extras : [];
    for (const ec of productExtras) {
      if (body.selected_extras_ids.includes(ec.id)) {
        extraSurchargesTotal += Number(ec.price) || 0;
        screenUnionCatalogNotes.push(`+ ${ec.name} (${Number(ec.price)} Kč/ks)`);
      }
    }
  }
  
  extraSurchargesTotal += parametersSurcharge;
  if (paramsNotes.length > 0) {
    screenUnionCatalogNotes.push(...paramsNotes);
  }

  // Přidáme příplatek ze skupiny látek, pokud používá nový konfigurátor
  if (typeof body.fabric_group_config_index === 'number') {
    const configs = Array.isArray(product.fabric_groups_config) ? product.fabric_groups_config : [];
    const cfg = configs[body.fabric_group_config_index];
    if (cfg) {
      if (typeof cfg.surcharge === 'number' && cfg.surcharge > 0) {
        baseCatalogCzk += cfg.surcharge;
        screenUnionCatalogNotes.push(`Látka "${cfg.name}": +${cfg.surcharge} Kč.`);
      } else if (typeof cfg.surcharge_percent === 'number' && cfg.surcharge_percent > 0) {
        const extraPercent = cfg.surcharge_percent / 100;
        const extraCzk = Math.round(baseCatalogCzk * extraPercent);
        baseCatalogCzk += extraCzk;
        screenUnionCatalogNotes.push(`Látka "${cfg.name}": +${cfg.surcharge_percent}% (+${extraCzk} Kč).`);
      }
    }
  }

  // Přidáme fixní/m2 příplatek za barvu/skupinu látek (starší verze)
  if (extraSurchargeFromFabricGroup > 0) {
    baseCatalogCzk += Math.round(extraSurchargeFromFabricGroup);
    screenUnionCatalogNotes.push(`Příplatek za vybranou barvu/látku z ceníku: +${Math.round(extraSurchargeFromFabricGroup)} Kč.`);
  }

  const total_czk = computeRetailCzk(baseCatalogCzk, supplier, commission) + extraSurchargesTotal;
  const bw = br.rows[0]
    ? num(br.rows[0] as Record<string, unknown>, "width_mm_max", "widthMmMax")
    : wR;
  const bh = br.rows[0]
    ? num(br.rows[0] as Record<string, unknown>, "height_mm_max", "heightMmMax")
    : hR;
  const catalog_warning =
    matrixProfile === "ext50_int50_matrix" && (wR >= 3100 || hR >= 3100)
      ? "Podle ceníku EXT 50 / INT 50 jde u tohoto rozměru o žaluzii bez garance (šířka nebo výška od 3 100 mm)."
      : undefined;

  const catalogNoteParts: string[] = [];
  if (radix_lamela_note) catalogNoteParts.push(radix_lamela_note);
  if (pliseNote) catalogNoteParts.push(pliseNote);
  if (screenUnionCatalogNotes.length) catalogNoteParts.push(screenUnionCatalogNotes.join(" "));

  return {
    ok: true,
    data: {
      product_id: id,
      product_title: productTitle,
      width_mm: wR,
      height_mm: hR,
      rounded_width_mm: bw,
      rounded_height_mm: bh,
      base_catalog_czk: baseCatalogCzk,
      supplier_markup_percent: supplier,
      commission_percent: commission,
      total_czk,
      source: br.rows[0] ? "matrix" : "product_base_price",
      prices_ex_vat: true,
      vat_note: "Katalogové ceny jsou bez DPH (21 %).",
      dimension_constraints: dim,
      ...(catalog_warning ? { catalog_warning } : {}),
      ...(catalogNoteParts.length ? { catalog_note: catalogNoteParts.join(" ") } : {}),
    },
  };
}
