import { type NormalizedProduct } from "@/lib/finlife/types";

export type RatePreference = "higher" | "lower";

function normalizeRate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

export function collectRates(product: NormalizedProduct): number[] {
  const out: number[] = [];
  const push = (v: unknown) => {
    const parsed = normalizeRate(v);
    if (parsed !== null) out.push(parsed);
  };

  push(product.best?.intr_rate2);
  push(product.best?.intr_rate);

  for (const option of product.options) {
    push(option.intr_rate2);
    push(option.intr_rate);

    const raw = option.raw as Record<string, unknown>;
    push(raw.lend_rate_min);
    push(raw.lend_rate_max);
    push(raw.crdt_grad_avg);
    push(raw.crdt_lend_rate);
  }

  return out;
}

export function getComparableRate(product: NormalizedProduct): number | null {
  const rates = collectRates(product);
  if (!rates.length) return null;
  return Math.max(...rates);
}

export function getRateForPreference(product: NormalizedProduct, preference: RatePreference): number | null {
  const rates = collectRates(product);
  if (!rates.length) return null;
  return preference === "higher" ? Math.max(...rates) : Math.min(...rates);
}

export function sortProducts(products: NormalizedProduct[], preference: RatePreference): NormalizedProduct[] {
  return products.slice().sort((a, b) => {
    const ra = getRateForPreference(a, preference);
    const rb = getRateForPreference(b, preference);

    if (ra === null && rb === null) {
      const co = (a.kor_co_nm ?? "").localeCompare(b.kor_co_nm ?? "");
      if (co !== 0) return co;
      return (a.fin_prdt_nm ?? "").localeCompare(b.fin_prdt_nm ?? "");
    }
    if (ra === null) return 1;
    if (rb === null) return -1;
    if (preference === "higher") {
      if (rb !== ra) return rb - ra;
    } else {
      if (ra !== rb) return ra - rb;
    }

    const co = (a.kor_co_nm ?? "").localeCompare(b.kor_co_nm ?? "");
    if (co !== 0) return co;
    return (a.fin_prdt_nm ?? "").localeCompare(b.fin_prdt_nm ?? "");
  });
}
