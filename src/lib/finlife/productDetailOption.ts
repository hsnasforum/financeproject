import { type FinlifeFieldSpec } from "@/lib/finlife/fieldConfig";
import { presentBySpecs, presentOptionFallback } from "@/lib/finlife/present";
import { type FinlifeKind, type NormalizedOption } from "@/lib/finlife/types";

export const PRODUCT_DETAIL_OPTION_IDENTITY_RAW_KEYS = [
  "intr_rate_type",
  "intr_rate_type_nm",
  "rsrv_type",
  "rsrv_type_nm",
  "lend_rate_type",
  "lend_rate_type_nm",
  "rpym_type",
  "rpym_type_nm",
  "rpym_way",
  "crdt_lend_rate_type",
  "crdt_lend_rate_type_nm",
  "crdt_rpym_type",
  "crdt_rpym_type_nm",
  "lend_rate_min",
  "lend_rate_max",
  "loan_lmt",
  "loan_limit",
  "crdt_grad_avg",
  "crdt_lend_rate",
  "crdt_lend_lmt",
  "source",
  "optionSourceId",
] as const;

export type ProductDetailOptionSelection = Pick<
  NormalizedOption,
  "save_trm" | "intr_rate" | "intr_rate2"
> & {
  raw?: Record<string, unknown>;
};

export type ProductDetailOptionRow = {
  key: string;
  option: NormalizedOption;
  termMonths: number | null;
  baseRatePct: number | null;
  primeRatePct: number | null;
  interestType: "simple" | "compound" | null;
  detailEntries: Array<{
    label: string;
    valueText: string;
    help?: string;
  }>;
  missing: Array<"term" | "rate" | "interestType">;
  isCalculable: boolean;
};

function normalizedText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizedRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseProductDetailTerm(value: unknown): number | null {
  const text = normalizedText(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export function parseProductDetailInterestType(
  option: Pick<ProductDetailOptionSelection, "raw">,
): "simple" | "compound" | null {
  const value = normalizedText(option.raw?.intr_rate_type_nm).replace(/\s+/g, "");
  if (value === "단리") return "simple";
  if (value === "복리") return "compound";
  return null;
}

function identityRaw(option: ProductDetailOptionSelection): Array<[string, string]> {
  const raw = option.raw ?? {};
  return PRODUCT_DETAIL_OPTION_IDENTITY_RAW_KEYS.flatMap((key) => {
    const value = normalizedText(raw[key]);
    return value ? [[key, value] as [string, string]] : [];
  });
}

function optionFingerprint(option: ProductDetailOptionSelection): string {
  return JSON.stringify({
    term: normalizedText(option.save_trm),
    baseRate: normalizedRate(option.intr_rate),
    primeRate: normalizedRate(option.intr_rate2),
    identity: identityRaw(option),
  });
}

export function productDetailOptionKeyAtIndex(options: NormalizedOption[], index: number): string | null {
  const option = options[index];
  if (!option) return null;
  return optionFingerprint(option);
}

function optionPresentationRaw(option: NormalizedOption): Record<string, unknown> {
  return {
    ...(option.raw ?? {}),
    ...(normalizedText(option.save_trm) ? { save_trm: option.save_trm } : {}),
    ...(normalizedRate(option.intr_rate) !== null ? { intr_rate: option.intr_rate } : {}),
    ...(normalizedRate(option.intr_rate2) !== null ? { intr_rate2: option.intr_rate2 } : {}),
  };
}

export function buildProductDetailOptionRows(input: {
  kind: FinlifeKind;
  options: NormalizedOption[];
  optionFields?: FinlifeFieldSpec[];
}): ProductDetailOptionRow[] {
  const seenKeys = new Set<string>();
  return input.options.flatMap((option, index): ProductDetailOptionRow[] => {
    const fingerprint = optionFingerprint(option);
    const key = productDetailOptionKeyAtIndex(input.options, index) ?? fingerprint;
    if (seenKeys.has(key)) return [];
    seenKeys.add(key);

    const termMonths = parseProductDetailTerm(option.save_trm);
    const baseRatePct = normalizedRate(option.intr_rate);
    const primeRatePct = normalizedRate(option.intr_rate2);
    const interestType = parseProductDetailInterestType(option);
    const raw = optionPresentationRaw(option);
    const bySpec = presentBySpecs(input.kind, raw, input.optionFields);
    const detailEntries = bySpec.length ? bySpec : presentOptionFallback(input.kind, raw, 8);
    const missing: ProductDetailOptionRow["missing"] = [];
    if (termMonths === null) missing.push("term");
    if (baseRatePct === null && primeRatePct === null) missing.push("rate");
    if ((input.kind === "deposit" || input.kind === "saving") && interestType === null) {
      missing.push("interestType");
    }

    return [{
      key,
      option,
      termMonths,
      baseRatePct,
      primeRatePct,
      interestType,
      detailEntries,
      missing,
      isCalculable: missing.length === 0,
    }];
  });
}

function canonicalSelectionMatches(row: ProductDetailOptionRow, selection: ProductDetailOptionSelection): boolean {
  const selectedTerm = normalizedText(selection.save_trm);
  const selectedBaseRate = normalizedRate(selection.intr_rate);
  const selectedPrimeRate = normalizedRate(selection.intr_rate2);

  if (selectedTerm && normalizedText(row.option.save_trm) !== selectedTerm) return false;
  if (selectedBaseRate !== null && row.baseRatePct !== selectedBaseRate) return false;
  if (selectedPrimeRate !== null && row.primeRatePct !== selectedPrimeRate) return false;
  return Boolean(selectedTerm) || selectedBaseRate !== null || selectedPrimeRate !== null;
}

export function resolveProductDetailOptionKey(
  rows: ProductDetailOptionRow[],
  selection?: ProductDetailOptionSelection | null,
): string | null {
  if (rows.length === 0) return null;
  if (!selection) return rows[0].key;

  const exactFingerprint = optionFingerprint(selection);
  const exact = rows.find((row) => row.key === exactFingerprint);
  if (exact) return exact.key;

  const canonical = rows.find((row) => canonicalSelectionMatches(row, selection));
  if (canonical) return canonical.key;

  const selectedTerm = parseProductDetailTerm(selection.save_trm);
  if (selectedTerm !== null) {
    const sameTerm = rows.find((row) => row.termMonths === selectedTerm);
    if (sameTerm) return sameTerm.key;
  }

  return rows[0].key;
}

export function pickProductDetailRate(
  row: ProductDetailOptionRow,
  rateBasis: "base" | "prime",
): number | null {
  return rateBasis === "prime" ? row.primeRatePct : row.baseRatePct;
}

function optionTermLabel(row: ProductDetailOptionRow, index: number): string {
  const term = normalizedText(row.option.save_trm);
  const termMonths = parseProductDetailTerm(term);
  if (termMonths !== null) return `${termMonths}개월`;
  return term || `옵션 ${index + 1}`;
}

function optionSelectionDescriptor(row: ProductDetailOptionRow): string {
  const identities = row.detailEntries.filter((entry) => (
    entry.label === "이자 방식"
    || entry.label === "적립 유형"
    || entry.label === "금리유형"
    || entry.label === "상환방식"
  ));
  const rate = row.detailEntries.find((entry) => entry.label.startsWith("최고금리"))
    ?? row.detailEntries.find((entry) => entry.label.startsWith("최저금리"))
    ?? row.detailEntries.find((entry) => entry.label.startsWith("평균금리"))
    ?? row.detailEntries.find((entry) => entry.label.startsWith("기본금리"))
    ?? row.detailEntries.find((entry) => !identities.includes(entry) && entry.label.includes("금리"));
  return [...new Set(identities.map((entry) => entry.valueText)), rate ? `${rate.label} ${rate.valueText}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function buildProductDetailOptionSelectionLabels(rows: ProductDetailOptionRow[]): string[] {
  const baseLabels = rows.map(optionTermLabel);
  const baseCounts = new Map<string, number>();
  for (const label of baseLabels) baseCounts.set(label, (baseCounts.get(label) ?? 0) + 1);

  const candidates = rows.map((row, index) => {
    const base = baseLabels[index];
    if ((baseCounts.get(base) ?? 0) <= 1) return base;
    const descriptor = optionSelectionDescriptor(row);
    return descriptor ? `${base} · ${descriptor}` : base;
  });
  const candidateCounts = new Map<string, number>();
  for (const label of candidates) candidateCounts.set(label, (candidateCounts.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();

  return candidates.map((label) => {
    if ((candidateCounts.get(label) ?? 0) <= 1) return label;
    const ordinal = (seen.get(label) ?? 0) + 1;
    seen.set(label, ordinal);
    return `${label} · 옵션 ${ordinal}`;
  });
}
