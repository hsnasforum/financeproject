import { describe, expect, it } from "vitest";
import {
  ensureProductReasons,
  filterProductsForList,
  sortProductsForList,
} from "../src/lib/products/listUtils";
import { type NormalizedProduct } from "../src/lib/finlife/types";

function makeProduct(input: {
  code: string;
  name: string;
  provider: string;
  term?: string;
  base?: number | null;
  max?: number | null;
}): NormalizedProduct {
  return {
    fin_prdt_cd: input.code,
    fin_prdt_nm: input.name,
    kor_co_nm: input.provider,
    options: [
      {
        save_trm: input.term ?? "12",
        intr_rate: input.base ?? null,
        intr_rate2: input.max ?? null,
        raw: {},
      },
    ],
    best: {
      save_trm: input.term ?? "12",
      intr_rate: input.base ?? null,
      intr_rate2: input.max ?? null,
    },
    raw: {},
  };
}

describe("product list utils", () => {
  const products = [
    makeProduct({ code: "A", name: "알파 예금", provider: "은행A", term: "12", base: 2.9, max: 3.5 }),
    makeProduct({ code: "B", name: "베타 예금", provider: "은행B", term: "6", base: 2.3, max: 3.2 }),
    makeProduct({ code: "C", name: "감마 예금", provider: "은행C", term: "24", base: 2.8, max: 3.0 }),
  ];

  it("filters by query and favorites", () => {
    const favoriteIds = new Set(["B"]);
    const filtered = filterProductsForList(products, {
      query: "베타",
      onlyFavorites: true,
      favoriteIds,
    });
    expect(filtered.map((row) => row.fin_prdt_cd)).toEqual(["B"]);
  });

  it("sorts by term asc", () => {
    const sorted = sortProductsForList(products, "termAsc", "higher");
    expect(sorted.map((row) => row.fin_prdt_cd)).toEqual(["B", "A", "C"]);
  });

  it("builds fallback reasons with at least 3 lines", () => {
    const withReasons = ensureProductReasons(products);
    expect(withReasons[0]?.reasons?.length).toBeGreaterThanOrEqual(3);
    expect(withReasons[1]?.reasons?.length).toBeGreaterThanOrEqual(3);
  });
});
