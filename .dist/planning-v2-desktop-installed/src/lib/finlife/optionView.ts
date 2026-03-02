import { type FinlifeSourceResult, type NormalizedOption, type NormalizedProduct } from "./types";

export type OptionRow = {
  key: string;
  product: NormalizedProduct;
  option: NormalizedOption;
  rate: number | null;
  term: number | null;
};

export type OptionSortKey =
  | "best_desc"
  | "base_desc"
  | "bonus_desc"
  | "term_asc"
  | "term_desc"
  | "provider_asc"
  | "product_asc";

export type OptionRates = {
  base?: number;
  best?: number;
  bonus: number;
};

export type OptionRowGroup = {
  key: string;
  product: NormalizedProduct;
  rows: OptionRow[];
  representativeRow: OptionRow;
};

function normalizeRate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function readOptionRate(option: NormalizedOption): number | null {
  const candidates: unknown[] = [
    option.intr_rate2,
    option.intr_rate,
    (option.raw as Record<string, unknown>)?.lend_rate_min,
    (option.raw as Record<string, unknown>)?.lend_rate_max,
    (option.raw as Record<string, unknown>)?.crdt_grad_avg,
    (option.raw as Record<string, unknown>)?.crdt_lend_rate,
  ];
  for (const candidate of candidates) {
    const parsed = normalizeRate(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function readOptionTerm(option: NormalizedOption): number | null {
  const parsed = Number(option.save_trm ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getOptionRates(option: NormalizedOption): OptionRates {
  const base = normalizeRate(option.intr_rate) ?? undefined;
  const best = normalizeRate(option.intr_rate2) ?? base;
  const rawBonus = typeof base === "number" && typeof best === "number" ? best - base : 0;
  const bonus = Number.isFinite(rawBonus) && rawBonus > 0 ? rawBonus : 0;
  return { base, best, bonus };
}

export function formatOptionRate(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export function formatOptionBonus(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "+0.00%p";
  return `+${value.toFixed(2)}%p`;
}

export function flattenOptionRows(products: NormalizedProduct[], selectedTerms: string[]): OptionRow[] {
  const termSet = new Set(selectedTerms);
  const rows: OptionRow[] = [];
  for (const product of products) {
    for (let idx = 0; idx < product.options.length; idx += 1) {
      const option = product.options[idx];
      if (termSet.size > 0 && option.save_trm && !termSet.has(option.save_trm)) continue;
      rows.push({
        key: `${product.fin_prdt_cd}::${option.save_trm ?? "term-missing"}::${idx}`,
        product,
        option,
        rate: readOptionRate(option),
        term: readOptionTerm(option),
      });
    }
  }
  return rows;
}

function compareOptionRows(a: OptionRow, b: OptionRow, sortKey: OptionSortKey): number {
  const ar = getOptionRates(a.option);
  const br = getOptionRates(b.option);
  if (sortKey === "best_desc") {
    const av = ar.best ?? -Infinity;
    const bv = br.best ?? -Infinity;
    if (bv !== av) return bv - av;
  }
  if (sortKey === "base_desc") {
    const av = ar.base ?? -Infinity;
    const bv = br.base ?? -Infinity;
    if (bv !== av) return bv - av;
  }
  if (sortKey === "bonus_desc") {
    if (br.bonus !== ar.bonus) return br.bonus - ar.bonus;
    const ab = ar.best ?? -Infinity;
    const bb = br.best ?? -Infinity;
    if (bb !== ab) return bb - ab;
  }
  if (sortKey === "term_asc" || sortKey === "term_desc") {
    const ta = a.term ?? 9999;
    const tb = b.term ?? 9999;
    if (ta !== tb) return sortKey === "term_asc" ? ta - tb : tb - ta;
  }
  if (sortKey === "provider_asc") {
    const co = (a.product.kor_co_nm ?? "").localeCompare(b.product.kor_co_nm ?? "");
    if (co !== 0) return co;
  }
  if (sortKey === "product_asc") {
    const po = (a.product.fin_prdt_nm ?? "").localeCompare(b.product.fin_prdt_nm ?? "");
    if (po !== 0) return po;
  }

  const co = (a.product.kor_co_nm ?? "").localeCompare(b.product.kor_co_nm ?? "");
  if (co !== 0) return co;
  const po = (a.product.fin_prdt_nm ?? "").localeCompare(b.product.fin_prdt_nm ?? "");
  if (po !== 0) return po;
  const ta = a.term ?? 9999;
  const tb = b.term ?? 9999;
  if (ta !== tb) return ta - tb;
  return (a.option.save_trm ?? "").localeCompare(b.option.save_trm ?? "");
}

export function sortOptionRows(rows: OptionRow[], sortKey: OptionSortKey): OptionRow[] {
  return rows.slice().sort((a, b) => {
    return compareOptionRows(a, b, sortKey);
  });
}

export function groupOptionRowsByProduct(rows: OptionRow[], representativeSortKey: OptionSortKey = "best_desc"): OptionRowGroup[] {
  const groups = new Map<string, OptionRowGroup>();
  for (const row of rows) {
    const key = row.product.fin_prdt_cd || `${row.product.kor_co_nm ?? "provider"}::${row.product.fin_prdt_nm ?? "product"}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        product: row.product,
        rows: [row],
        representativeRow: row,
      });
      continue;
    }
    existing.rows.push(row);
  }

  const grouped = Array.from(groups.values());
  for (const group of grouped) {
    group.rows = sortOptionRows(group.rows, representativeSortKey);
    group.representativeRow = group.rows[0];
  }
  return grouped;
}

export function sumOptionCount(products: NormalizedProduct[]): number {
  return products.reduce((sum, product) => sum + product.options.length, 0);
}

export function deriveTotals(payload: FinlifeSourceResult | null, shownProducts: number, shownOptions: number) {
  const sourceProducts = payload?.data ?? [];
  const totalProducts = payload?.meta.totalProducts ?? payload?.meta.totalCount ?? sourceProducts.length;
  const totalOptions = payload?.meta.totalOptions ?? sumOptionCount(sourceProducts);
  return {
    shownProducts,
    shownOptions,
    totalProducts,
    totalOptions,
  };
}
