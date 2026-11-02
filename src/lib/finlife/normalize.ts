import { finlifeIdentity, joinFinlifeRows, mergeFinlifeProducts, normalizeFinlifeCompany } from "./identity.mjs";
import { type FinlifeKind, type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeFinlifeProducts(input: {
  baseList: unknown[];
  optionList: unknown[];
  kind?: FinlifeKind;
  strict?: boolean;
}): NormalizedProduct[] {
  const joined = joinFinlifeRows(input.baseList, input.optionList, { kind: input.kind, strict: input.strict });
  const products = joined.map(({ raw, options }): NormalizedProduct => {
    const company = normalizeFinlifeCompany(raw.fin_co_no);
    return {
      fin_prdt_cd: String(raw.fin_prdt_cd).trim(),
      fin_co_no: company || undefined,
      ...(input.kind && /^\d{7}$/.test(company) ? { identityKey: finlifeIdentity(input.kind, raw) } : {}),
      kor_co_nm: raw.kor_co_nm ? String(raw.kor_co_nm) : undefined,
      fin_prdt_nm: raw.fin_prdt_nm ? String(raw.fin_prdt_nm) : undefined,
      options: options.map((option): NormalizedOption => ({
        save_trm: option.save_trm ? String(option.save_trm) : undefined,
        intr_rate: toNullableNumber(option.intr_rate),
        intr_rate2: toNullableNumber(option.intr_rate2),
        raw: option,
      })),
      raw,
    };
  });
  const merged = mergeFinlifeProducts(products, { kind: input.kind });

  for (const product of merged) {
    const hasAnyRate = product.options.some((option) => option.intr_rate !== null || option.intr_rate2 !== null);
    if (!hasAnyRate) continue;

    const best = product.options
      .slice()
      .sort((a, b) => {
        const aRate = a.intr_rate2 ?? a.intr_rate ?? -Infinity;
        const bRate = b.intr_rate2 ?? b.intr_rate ?? -Infinity;
        return bRate - aRate;
      })[0];

    if (best) {
      product.best = {
        save_trm: best.save_trm,
        intr_rate: best.intr_rate,
        intr_rate2: best.intr_rate2,
      };
    }
  }

  return merged;
}
