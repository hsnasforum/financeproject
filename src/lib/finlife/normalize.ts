import { type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function normalizeFinlifeProducts(input: {
  baseList: unknown[];
  optionList: unknown[];
}): NormalizedProduct[] {
  const productsByCode = new Map<string, NormalizedProduct>();

  for (const base of input.baseList) {
    const raw = asRecord(base);
    const code = String(raw.fin_prdt_cd ?? "").trim();
    if (!code) continue;

    productsByCode.set(code, {
      fin_prdt_cd: code,
      kor_co_nm: raw.kor_co_nm ? String(raw.kor_co_nm) : undefined,
      fin_prdt_nm: raw.fin_prdt_nm ? String(raw.fin_prdt_nm) : undefined,
      options: [],
      raw,
    });
  }

  for (const option of input.optionList) {
    const raw = asRecord(option);
    const code = String(raw.fin_prdt_cd ?? "").trim();
    if (!code || !productsByCode.has(code)) continue;

    const normalizedOption: NormalizedOption = {
      save_trm: raw.save_trm ? String(raw.save_trm) : undefined,
      intr_rate: toNullableNumber(raw.intr_rate),
      intr_rate2: toNullableNumber(raw.intr_rate2),
      raw,
    };

    productsByCode.get(code)?.options.push(normalizedOption);
  }

  for (const product of productsByCode.values()) {
    const best = product.options
      .slice()
      .sort((a, b) => (b.intr_rate2 ?? -Infinity) - (a.intr_rate2 ?? -Infinity))[0];

    if (best) {
      product.best = {
        save_trm: best.save_trm,
        intr_rate: best.intr_rate,
        intr_rate2: best.intr_rate2,
      };
    }
  }

  return [...productsByCode.values()];
}
