import type { FinlifeKind } from "@/lib/finlife/types";
import type { OptionSortKey } from "@/lib/finlife/optionView";
import type { ProductListSortKey } from "@/lib/products/listUtils";

export type ProductExplorerScanMode = "page" | "all";
export type ProductExplorerViewMode = "product" | "option";
export type ProductExplorerSortKey = ProductListSortKey;

export const FINLIFE_PAGE_SIZE = 50;
export const PRODUCT_EXPLORER_OPTION_SORT_KEYS: OptionSortKey[] = [
  "best_desc",
  "base_desc",
  "bonus_desc",
  "term_asc",
  "term_desc",
  "provider_asc",
  "product_asc",
];

export function parseAmountInput(value: string): number {
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isValidProductExplorerSortKey(value: string | null): value is ProductExplorerSortKey {
  return value === "rateDesc" || value === "rateAsc" || value === "nameAsc" || value === "termAsc";
}

export function isValidProductExplorerOptionSortKey(value: string | null): value is OptionSortKey {
  return PRODUCT_EXPLORER_OPTION_SORT_KEYS.includes(value as OptionSortKey);
}

export function parseMaxPagesParam(value: string | null): number | "auto" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "auto" || !normalized) return "auto";
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(80, Math.trunc(parsed)) : "auto";
}

export function buildFinlifeRequestParams(input: {
  topFinGrpNo: string;
  pageNo: number;
  scanMode: ProductExplorerScanMode;
  maxPages: number | "auto";
  pageSize?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("topFinGrpNo", input.topFinGrpNo);
  params.set("pageNo", input.scanMode === "page" ? String(input.pageNo) : "1");
  params.set("pageSize", String(input.pageSize ?? FINLIFE_PAGE_SIZE));
  if (input.scanMode === "all") {
    params.set("scan", "all");
    params.set("maxPages", String(input.maxPages));
  }
  return params;
}

export function buildProductExplorerUrlParams(input: {
  topFinGrpNo: string;
  pageNo: number;
  scanMode: ProductExplorerScanMode;
  maxPages: number | "auto";
  viewMode: ProductExplorerViewMode;
  optionSortKey: OptionSortKey;
  optionGroup: boolean;
  selectedFinCoNo: string | null;
  searchQuery: string;
  onlyFavorites: boolean;
  sortKey: ProductExplorerSortKey;
  defaultSortKey: ProductExplorerSortKey;
  selectedTerms: string[];
  selectedProductTypes: string[];
  selectedBenefits: string[];
  amountInput: string;
  pageSize?: number;
}): URLSearchParams {
  const params = buildFinlifeRequestParams({
    topFinGrpNo: input.topFinGrpNo,
    pageNo: input.pageNo,
    scanMode: input.scanMode,
    maxPages: input.maxPages,
    pageSize: input.pageSize,
  });
  if (input.scanMode === "page") params.set("pageNo", String(input.pageNo));
  if (input.viewMode === "option") {
    params.set("view", "option");
    params.set("optSort", input.optionSortKey);
    if (input.optionGroup) params.set("optGroup", "1");
  }
  if (input.selectedFinCoNo) params.set("finCoNo", input.selectedFinCoNo);
  if (input.searchQuery.trim()) params.set("q", input.searchQuery.trim());
  if (input.onlyFavorites) params.set("fav", "1");
  if (input.sortKey !== input.defaultSortKey) params.set("sort", input.sortKey);
  if (input.selectedTerms.length > 0) params.set("terms", input.selectedTerms.join(","));
  if (input.selectedProductTypes.length > 0) params.set("types", input.selectedProductTypes.join(","));
  if (input.selectedBenefits.length > 0) params.set("benefits", input.selectedBenefits.join(","));
  if (input.amountInput.trim() && input.amountInput !== "10000000") params.set("amount", input.amountInput.trim());
  return params;
}

export function parseProductExplorerUrlState(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined,
  input: {
    defaultSortKey: ProductExplorerSortKey;
    initialTopFinGrpNo: string;
    initialPageNo: number;
  },
) {
  const get = (key: string) => searchParams?.get(key) ?? null;
  const sort = get("sort");
  const optionSort = get("optSort");
  return {
    topFinGrpNo: input.initialTopFinGrpNo,
    selectedFinCoNo: (get("finCoNo") ?? "").trim() || null,
    pageNo: input.initialPageNo,
    scanMode: get("scan") === "all" ? "all" as const : "page" as const,
    maxPages: parseMaxPagesParam(get("maxPages")),
    viewMode: get("view") === "option" ? "option" as const : "product" as const,
    sortKey: isValidProductExplorerSortKey(sort) ? sort : input.defaultSortKey,
    optionSortKey: isValidProductExplorerOptionSortKey(optionSort) ? optionSort : "best_desc",
    optionGroup: get("optGroup") === "1",
    selectedTerms: parseCsvParam(get("terms")),
    amountInput: (get("amount") ?? "").trim() || "10000000",
    selectedProductTypes: parseCsvParam(get("types")),
    selectedBenefits: parseCsvParam(get("benefits")),
    searchQuery: (get("q") ?? "").trim(),
    onlyFavorites: get("fav") === "1",
  };
}

export function buildProductExplorerApiUrl(kind: FinlifeKind, params: URLSearchParams): string {
  return `/api/finlife/${kind}?${params.toString()}`;
}
