import { type FinlifeKind, type NormalizedProduct } from "@/lib/finlife/types";

export type FinlifeFilters = {
  selectedTerms: string[];
  amountWon: number;
  selectedProductTypes: string[];
  selectedBenefits: string[];
};

type DerivedTags = {
  productTypes: string[];
  benefits: string[];
  maxLimitWon?: number;
};

function hasText(raw: Record<string, unknown>, key: string): string {
  const entries = Object.entries(raw);
  const hit = entries.find(([k]) => k.toLowerCase() === key.toLowerCase());
  return hit ? String(hit[1] ?? "") : "";
}

function includesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((word) => lower.includes(word));
}

function parseLimitWon(raw: Record<string, unknown>): number | undefined {
  const candidates = ["max_limit", "loan_lmt", "loan_limit", "crdt_lend_lmt"];
  for (const key of candidates) {
    const value = hasText(raw, key);
    if (!value) continue;
    const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function deriveTags(product: NormalizedProduct, kind: FinlifeKind): DerivedTags {
  const raw = product.raw;
  const textBlob = [
    product.fin_prdt_nm ?? "",
    hasText(raw, "join_way"),
    hasText(raw, "join_member"),
    hasText(raw, "spcl_cnd"),
    hasText(raw, "etc_note"),
  ].join(" ");

  const productTypes = new Set<string>();
  const benefits = new Set<string>();

  const joinDeny = hasText(raw, "join_deny");
  if (joinDeny === "1") productTypes.add("누구나");
  if (joinDeny === "2") productTypes.add("서민전용");
  if (joinDeny === "3") productTypes.add("일부제한");

  if (includesAny(textBlob, ["인터넷", "모바일", "비대면"])) productTypes.add("비대면가입");
  if (includesAny(textBlob, ["특판"])) productTypes.add("특판");

  if (kind === "saving") {
    if (includesAny(textBlob, ["자유적립"])) productTypes.add("자유적립");
    if (includesAny(textBlob, ["정액적립"])) productTypes.add("정액적립");
    if (includesAny(textBlob, ["청년", "군인", "주택청약"])) productTypes.add("특화대상");
  }

  if (includesAny(textBlob, ["급여"])) benefits.add("급여연동");
  if (includesAny(textBlob, ["카드"])) benefits.add("카드실적");
  if (includesAny(textBlob, ["자동이체"])) benefits.add("자동이체");
  if (includesAny(textBlob, ["첫거래"])) benefits.add("첫거래");
  if (includesAny(textBlob, ["마이데이터", "공동구매"])) benefits.add("디지털우대");

  return {
    productTypes: [...productTypes],
    benefits: [...benefits],
    maxLimitWon: parseLimitWon(raw),
  };
}

function includesAll(selected: string[], actual: string[]): boolean {
  if (!selected.length) return true;
  return selected.every((entry) => actual.includes(entry));
}

export function applyFilters(products: NormalizedProduct[], filters: FinlifeFilters, kind: FinlifeKind): NormalizedProduct[] {
  return products.filter((product) => {
    const tags = deriveTags(product, kind);

    if (filters.selectedTerms.length > 0) {
      const terms = product.options
        .map((option) => String(option.save_trm ?? "").trim())
        .filter((value) => Boolean(value));
      if (!filters.selectedTerms.some((term) => terms.includes(term))) return false;
    }

    if (filters.amountWon > 0 && (kind === "deposit" || kind === "saving")) {
      if (typeof tags.maxLimitWon === "number" && filters.amountWon > tags.maxLimitWon) {
        return false;
      }
    }

    if (!includesAll(filters.selectedProductTypes, tags.productTypes)) return false;
    if (!includesAll(filters.selectedBenefits, tags.benefits)) return false;

    return true;
  });
}

export function collectFilterOptions(products: NormalizedProduct[], kind: FinlifeKind): {
  terms: string[];
  productTypes: string[];
  benefits: string[];
} {
  const termSet = new Set<string>();
  const typeSet = new Set<string>();
  const benefitSet = new Set<string>();

  for (const product of products) {
    for (const option of product.options) {
      const term = String(option.save_trm ?? "").trim();
      if (term) termSet.add(term);
    }
    const tags = deriveTags(product, kind);
    for (const entry of tags.productTypes) typeSet.add(entry);
    for (const entry of tags.benefits) benefitSet.add(entry);
  }

  return {
    terms: [...termSet].sort((a, b) => Number(a) - Number(b)),
    productTypes: [...typeSet].sort(),
    benefits: [...benefitSet].sort(),
  };
}
