import { describe, expect, it } from "vitest";

import type { FinlifeSourceResult, NormalizedProduct } from "../src/lib/finlife/types";
import { buildProductListViewModel } from "../src/lib/products/productListViewModel";

function makeProduct(input: {
  code: string;
  providerId: string;
  providerName: string;
  productName: string;
  options: Array<{ term: string; base: number; best: number }>;
  raw?: Record<string, unknown>;
}): NormalizedProduct {
  return {
    fin_prdt_cd: input.code,
    fin_co_no: input.providerId,
    kor_co_nm: input.providerName,
    fin_prdt_nm: input.productName,
    options: input.options.map((option) => ({
      save_trm: option.term,
      intr_rate: option.base,
      intr_rate2: option.best,
      raw: {},
    })),
    best: {
      save_trm: input.options[0]?.term,
      intr_rate: input.options[0]?.base,
      intr_rate2: input.options[0]?.best,
    },
    raw: input.raw ?? {},
  };
}

const products = [
  makeProduct({
    code: "A",
    providerId: "BANK-A",
    providerName: "은행A",
    productName: "알파 예금",
    options: [
      { term: "12", base: 3, best: 3.5 },
      { term: "6", base: 2.8, best: 3.2 },
    ],
    raw: { join_way: "모바일", spcl_cnd: "급여" },
  }),
  makeProduct({
    code: "B",
    providerId: "BANK-B",
    providerName: "은행B",
    productName: "베타 예금",
    options: [{ term: "6", base: 2.7, best: 3.1 }],
  }),
  makeProduct({
    code: "C",
    providerId: "BANK-A",
    providerName: "은행A",
    productName: "감마 예금",
    options: [{ term: "24", base: 2.9, best: 3.3 }],
  }),
];

const payload: FinlifeSourceResult = {
  ok: true,
  mode: "live",
  meta: {
    kind: "deposit",
    pageNo: 1,
    topFinGrpNo: "020000",
    fallbackUsed: false,
    totalProducts: 12,
    totalOptions: 30,
  },
  data: products,
};

function build(overrides: Partial<Parameters<typeof buildProductListViewModel>[0]> = {}) {
  return buildProductListViewModel({
    payload,
    kind: "deposit",
    selectedFinCoNo: null,
    selectedTerms: [],
    amountInput: "10000000",
    selectedProductTypes: [],
    selectedBenefits: [],
    searchQuery: "",
    onlyFavorites: false,
    favoriteIds: new Set<string>(),
    sortKey: "rateDesc",
    ratePreference: "higher",
    optionSortKey: "best_desc",
    optionGroup: false,
    viewMode: "product",
    ...overrides,
  });
}

describe("product list view model", () => {
  it("keeps provider, condition, query, favorite, sort, and reason order in one pipeline", () => {
    const view = build({
      selectedFinCoNo: "BANK-A",
      selectedTerms: ["24"],
      searchQuery: "감마",
      onlyFavorites: true,
      favoriteIds: new Set(["C"]),
    });

    expect(view.filterOptions.terms).toEqual(["6", "12", "24"]);
    expect(view.filterOptions.productTypes).toContain("비대면가입");
    expect(view.filterOptions.benefits).toContain("급여연동");
    expect(view.enrichedProducts.map((product) => product.fin_prdt_cd)).toEqual(["C"]);
    expect(view.enrichedProducts[0]?.reasons?.length).toBeGreaterThanOrEqual(3);
    expect(view.totals).toEqual({
      shownProducts: 1,
      shownOptions: 1,
      totalProducts: 12,
      totalOptions: 30,
    });
  });

  it("builds sorted option rows, product groups, and option-view totals", () => {
    const view = build({
      viewMode: "option",
      optionSortKey: "term_desc",
      optionGroup: true,
      sortKey: "nameAsc",
    });

    expect(view.optionRows.map((row) => row.term)).toEqual([24, 12, 6, 6]);
    expect(view.optionGroups).toHaveLength(3);
    expect(view.validOptionGroupKeys).toEqual(["C", "A", "B"]);
    expect(view.totals).toEqual({
      shownProducts: 3,
      shownOptions: 4,
      totalProducts: 12,
      totalOptions: 30,
    });
  });

  it("returns an empty stable view without a payload", () => {
    const view = build({ payload: null, viewMode: "option", optionGroup: true });

    expect(view.filterOptions).toEqual({ terms: [], productTypes: [], benefits: [] });
    expect(view.enrichedProducts).toEqual([]);
    expect(view.optionRows).toEqual([]);
    expect(view.optionGroups).toEqual([]);
    expect(view.validOptionGroupKeys).toEqual([]);
    expect(view.totals).toEqual({
      shownProducts: 0,
      shownOptions: 0,
      totalProducts: 0,
      totalOptions: 0,
    });
  });
});
