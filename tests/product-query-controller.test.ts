import { describe, expect, it } from "vitest";

import { buildProductExplorerQueryTarget } from "../src/components/products/useProductExplorerQueryController";

describe("product query controller", () => {
  it("serializes the full explorer state with the existing query names and order", () => {
    const target = buildProductExplorerQueryTarget({
      kind: "pension",
      topFinGrpNo: "030300",
      pageNo: 4,
      scanMode: "all",
      maxPages: 12,
      viewMode: "option",
      optionSortKey: "term_asc",
      optionGroup: true,
      selectedFinCoNo: "001",
      searchQuery: "bank",
      onlyFavorites: true,
      sortKey: "nameAsc",
      defaultSortKey: "rateDesc",
      selectedTerms: ["6", "12"],
      selectedProductTypes: ["online"],
      selectedBenefits: ["prefer"],
      amountInput: "5000000",
    });

    expect(target).toBe(
      "?topFinGrpNo=030300&pageNo=1&pageSize=50&scan=all&maxPages=12&view=option&optSort=term_asc&optGroup=1&finCoNo=001&q=bank&fav=1&sort=nameAsc&terms=6%2C12&types=online&benefits=prefer&amount=5000000",
    );
  });

  it("omits default product-view filters without changing page-mode parameters", () => {
    const target = buildProductExplorerQueryTarget({
      kind: "pension",
      topFinGrpNo: "020000",
      pageNo: 3,
      scanMode: "page",
      maxPages: "auto",
      viewMode: "product",
      optionSortKey: "best_desc",
      optionGroup: false,
      selectedFinCoNo: null,
      searchQuery: "",
      onlyFavorites: false,
      sortKey: "rateDesc",
      defaultSortKey: "rateDesc",
      selectedTerms: [],
      selectedProductTypes: [],
      selectedBenefits: [],
      amountInput: "10000000",
    });

    expect(target).toBe("?topFinGrpNo=020000&pageNo=3&pageSize=50");
  });
});
