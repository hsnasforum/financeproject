import { describe, expect, it } from "vitest";
import {
  buildFinlifeRequestParams,
  buildProductExplorerApiUrl,
  buildProductExplorerUrlParams,
  parseProductExplorerUrlState,
} from "../src/lib/products/productExplorerUrlState";

describe("product explorer url state", () => {
  it("parses product explorer URL state without a DOM", () => {
    const params = new URLSearchParams("finCoNo=001&q=bank&scan=all&maxPages=12&view=option&optSort=term_asc&optGroup=1&terms=6,12&types=online&benefits=prefer&amount=5000000&fav=1&sort=nameAsc");

    const state = parseProductExplorerUrlState(params, {
      defaultSortKey: "rateDesc",
      initialTopFinGrpNo: "020000",
      initialPageNo: 3,
    });

    expect(state).toMatchObject({
      topFinGrpNo: "020000",
      selectedFinCoNo: "001",
      pageNo: 3,
      scanMode: "all",
      maxPages: 12,
      viewMode: "option",
      optionSortKey: "term_asc",
      optionGroup: true,
      selectedTerms: ["6", "12"],
      selectedProductTypes: ["online"],
      selectedBenefits: ["prefer"],
      amountInput: "5000000",
      searchQuery: "bank",
      onlyFavorites: true,
      sortKey: "nameAsc",
    });
  });

  it("builds FINLIFE request and URL params consistently", () => {
    const request = buildFinlifeRequestParams({
      topFinGrpNo: "020000",
      pageNo: 2,
      scanMode: "all",
      maxPages: "auto",
    });

    expect(buildProductExplorerApiUrl("deposit", request)).toBe("/api/finlife/deposit?topFinGrpNo=020000&pageNo=1&pageSize=50&scan=all&maxPages=auto");

    const url = buildProductExplorerUrlParams({
      topFinGrpNo: "020000",
      pageNo: 2,
      scanMode: "page",
      maxPages: "auto",
      viewMode: "option",
      optionSortKey: "best_desc",
      optionGroup: true,
      selectedFinCoNo: "001",
      searchQuery: "테스트",
      onlyFavorites: true,
      sortKey: "termAsc",
      defaultSortKey: "rateDesc",
      selectedTerms: ["12"],
      selectedProductTypes: [],
      selectedBenefits: ["우대"],
      amountInput: "3000000",
    });

    expect(url.get("view")).toBe("option");
    expect(url.get("optGroup")).toBe("1");
    expect(url.get("finCoNo")).toBe("001");
    expect(url.get("q")).toBe("테스트");
    expect(url.get("fav")).toBe("1");
    expect(url.get("sort")).toBe("termAsc");
  });
});
