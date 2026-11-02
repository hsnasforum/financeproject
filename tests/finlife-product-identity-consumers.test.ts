import { describe, expect, it } from "vitest";
import type { FinlifeSourceResult, NormalizedProduct } from "../src/lib/finlife/types";
import { flattenOptionRows, groupOptionRowsByProduct } from "../src/lib/finlife/optionView";
import { filterProductsForList } from "../src/lib/products/listUtils";
import { buildProductListViewModel } from "../src/lib/products/productListViewModel";

function product(company: string, identityKey: string): NormalizedProduct & { identityKey: string } {
  return {
    fin_prdt_cd: "SAME",
    fin_co_no: company,
    fin_prdt_nm: `상품 ${company}`,
    kor_co_nm: `은행 ${company}`,
    identityKey,
    options: [{ save_trm: "12", intr_rate: 2, intr_rate2: 3, raw: {} }],
    raw: { fin_co_no: company, fin_prdt_cd: "SAME" },
  };
}

const products = [
  product("0000001", "finlife:deposit:0000001:SAME"),
  product("0000002", "finlife:deposit:0000002:SAME"),
];

function view(favoriteIds = new Set<string>(), selectedFinCoNo: string | null = null) {
  const payload: FinlifeSourceResult = {
    ok: true,
    mode: "live",
    meta: { kind: "deposit", pageNo: 1, topFinGrpNo: "020000", fallbackUsed: false },
    data: products,
  };
  return buildProductListViewModel({
    payload,
    kind: "deposit",
    selectedFinCoNo,
    selectedTerms: [],
    amountInput: "1000000",
    selectedProductTypes: [],
    selectedBenefits: [],
    searchQuery: "",
    onlyFavorites: favoriteIds.size > 0,
    favoriteIds,
    sortKey: "nameAsc",
    ratePreference: "higher",
    optionSortKey: "best_desc",
    optionGroup: true,
    viewMode: "option",
  });
}

describe("FINLIFE scoped identity in product consumers", () => {
  it("favorites only the selected company when product codes collide", () => {
    const filtered = filterProductsForList(products, {
      onlyFavorites: true,
      favoriteIds: new Set(["finlife:deposit:0000001:SAME"]),
    });
    expect(filtered.map((item) => item.fin_co_no)).toEqual(["0000001"]);
  });

  it("does not apply an ambiguous legacy favorite after a company filter", () => {
    expect(view(new Set(["SAME"]), "0000001").enrichedProducts).toEqual([]);
  });

  it("keeps company-specific option groups and row keys distinct", () => {
    const rows = flattenOptionRows(products, []);
    const groups = groupOptionRowsByProduct(rows);
    expect(groups.map((group) => group.product.fin_co_no)).toEqual(["0000001", "0000002"]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it("counts both company products in option view", () => {
    const result = view();
    expect(result.totals.shownProducts).toBe(2);
    expect(result.validOptionGroupKeys).toEqual([
      "finlife:deposit:0000001:SAME",
      "finlife:deposit:0000002:SAME",
    ]);
  });

  it("preserves one legacy favorite with missing company metadata", () => {
    const legacy: NormalizedProduct = { fin_prdt_cd: "OLD", options: [], raw: {} };
    expect(filterProductsForList([legacy], {
      onlyFavorites: true,
      favoriteIds: new Set(["OLD"]),
    })).toEqual([legacy]);
  });
});
