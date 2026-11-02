import { applyFilters, collectFilterOptions } from "@/lib/finlife/filters";
import {
  deriveTotals,
  flattenOptionRows,
  groupOptionRowsByProduct,
  sortOptionRows,
  type OptionSortKey,
} from "@/lib/finlife/optionView";
import type { FinlifeKind, FinlifeSourceResult } from "@/lib/finlife/types";
import type { RatePreference } from "@/lib/finlife/uiSort";
import { productIdentity } from "@/lib/products/productIdentity";
import {
  ensureProductReasons,
  filterProductsForList,
  sortProductsForList,
  type ProductListSortKey,
} from "@/lib/products/listUtils";
import {
  parseAmountInput,
  type ProductExplorerViewMode,
} from "@/lib/products/productExplorerUrlState";

export type ProductListViewModelInput = {
  payload: FinlifeSourceResult | null;
  kind: FinlifeKind;
  selectedFinCoNo: string | null;
  selectedTerms: string[];
  amountInput: string;
  selectedProductTypes: string[];
  selectedBenefits: string[];
  searchQuery: string;
  onlyFavorites: boolean;
  favoriteIds: Set<string>;
  sortKey: ProductListSortKey;
  ratePreference: RatePreference;
  optionSortKey: OptionSortKey;
  optionGroup: boolean;
  viewMode: ProductExplorerViewMode;
};

export function buildProductListViewModel(input: ProductListViewModelInput) {
  const sourceProducts = input.payload?.data ?? [];
  const filterOptions = collectFilterOptions(sourceProducts, input.kind);
  const providerProducts = sourceProducts.filter((product) => {
    if (!input.selectedFinCoNo) return true;
    return product.fin_co_no === input.selectedFinCoNo;
  });
  const filteredProducts = applyFilters(
    providerProducts,
    {
      selectedTerms: input.selectedTerms,
      amountWon: parseAmountInput(input.amountInput),
      selectedProductTypes: input.selectedProductTypes,
      selectedBenefits: input.selectedBenefits,
    },
    input.kind,
  );
  const searchedProducts = filterProductsForList(filteredProducts, {
    query: input.searchQuery,
    onlyFavorites: input.onlyFavorites,
    favoriteIds: input.favoriteIds,
    kind: input.kind,
    identityProducts: sourceProducts,
  });
  const sortedProducts = sortProductsForList(
    searchedProducts,
    input.sortKey,
    input.ratePreference,
  );
  const enrichedProducts = ensureProductReasons(sortedProducts);
  const optionRows = sortOptionRows(
    flattenOptionRows(enrichedProducts, input.selectedTerms, input.kind),
    input.optionSortKey,
  );
  const optionGroups = input.optionGroup
    ? groupOptionRowsByProduct(optionRows, "best_desc", input.kind)
    : [];
  const validOptionGroupKeys = optionGroups.map(
    (group) => group.key,
  );

  const totals = input.viewMode === "product"
    ? deriveTotals(
      input.payload,
      enrichedProducts.length,
      enrichedProducts.reduce((sum, product) => sum + product.options.length, 0),
    )
    : deriveTotals(
      input.payload,
      new Set(optionRows.map((row) => productIdentity(row.product, input.kind))).size,
      optionRows.length,
    );

  return {
    filterOptions,
    enrichedProducts,
    optionRows,
    optionGroups,
    validOptionGroupKeys,
    totals,
  };
}
