import { sortProducts, type RatePreference } from "../finlife/uiSort";
import { type NormalizedProduct } from "../finlife/types";

export type ProductListSortKey = "rateDesc" | "rateAsc" | "nameAsc" | "termAsc";

export type ProductListFilterInput = {
  query?: string;
  onlyFavorites?: boolean;
  favoriteIds?: Set<string>;
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function parseTerm(value: string | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const matched = value.match(/\d+/);
  if (!matched) return Number.POSITIVE_INFINITY;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function maxRate(product: NormalizedProduct): number | null {
  const candidates = [
    product.best?.intr_rate2,
    product.best?.intr_rate,
    ...product.options.flatMap((option) => [option.intr_rate2, option.intr_rate]),
  ];
  const valid = candidates.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

function representativeTerm(product: NormalizedProduct): string {
  const fromBest = product.best?.save_trm?.trim();
  if (fromBest) return fromBest;
  for (const option of product.options) {
    const term = option.save_trm?.trim();
    if (term) return term;
  }
  return "";
}

function pushReason(out: string[], text: string): void {
  if (!text) return;
  if (out.includes(text)) return;
  out.push(text);
}

export function buildFallbackReasons(product: NormalizedProduct, rank: number, total: number): string[] {
  const reasons = Array.isArray(product.reasons) ? [...product.reasons] : [];
  const safeRank = Number.isFinite(rank) ? rank + 1 : 0;
  if (safeRank > 0) pushReason(reasons, `금리 기준 상위 ${safeRank}위 상품입니다.`);

  const rate = maxRate(product);
  if (rate !== null) pushReason(reasons, `최고 금리 ${rate.toFixed(2)}% 기준으로 선별되었습니다.`);

  const term = representativeTerm(product);
  if (term) pushReason(reasons, `대표 만기 ${term}개월 옵션을 확인할 수 있습니다.`);
  else pushReason(reasons, "만기 정보가 없어 금리 중심으로 비교되었습니다.");

  if (product.options.length > 1) {
    pushReason(reasons, `옵션 ${product.options.length}개로 조건 비교 여지가 큽니다.`);
  } else if (product.options.length === 1) {
    pushReason(reasons, "옵션 1개 구조로 조건 확인이 단순합니다.");
  } else {
    pushReason(reasons, "옵션 정보가 제한적이어서 상세 화면 확인이 필요합니다.");
  }

  if (safeRank > 0 && total > 0) {
    const percentile = Math.max(1, Math.round((safeRank / total) * 100));
    pushReason(reasons, `현재 결과 ${total}건 중 상위 ${percentile}% 구간입니다.`);
  }

  while (reasons.length < 3) {
    pushReason(reasons, "입력한 필터 조건과 일치하는 후보입니다.");
  }

  return reasons.slice(0, 5);
}

export function ensureProductReasons(products: NormalizedProduct[]): NormalizedProduct[] {
  return products.map((product, index) => {
    const reasons = buildFallbackReasons(product, index, products.length);
    return {
      ...product,
      reasons,
    };
  });
}

export function filterProductsForList(
  products: NormalizedProduct[],
  input: ProductListFilterInput,
): NormalizedProduct[] {
  const query = normalizeQuery(input.query ?? "");
  const onlyFavorites = Boolean(input.onlyFavorites);
  const favoriteIds = input.favoriteIds ?? new Set<string>();

  return products.filter((product) => {
    if (onlyFavorites && !favoriteIds.has(product.fin_prdt_cd)) return false;
    if (!query) return true;
    const haystack = `${product.fin_prdt_nm ?? ""} ${product.kor_co_nm ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function sortProductsForList(
  products: NormalizedProduct[],
  sortKey: ProductListSortKey,
  ratePreference: RatePreference,
): NormalizedProduct[] {
  if (sortKey === "rateDesc") return sortProducts(products, "higher");
  if (sortKey === "rateAsc") return sortProducts(products, "lower");
  if (sortKey === "nameAsc") {
    return [...products].sort((a, b) => (a.fin_prdt_nm ?? "").localeCompare(b.fin_prdt_nm ?? ""));
  }
  if (sortKey === "termAsc") {
    return [...products].sort((a, b) => {
      const ta = parseTerm(a.best?.save_trm);
      const tb = parseTerm(b.best?.save_trm);
      if (ta !== tb) return ta - tb;
      return (a.fin_prdt_nm ?? "").localeCompare(b.fin_prdt_nm ?? "");
    });
  }
  return sortProducts(products, ratePreference);
}
