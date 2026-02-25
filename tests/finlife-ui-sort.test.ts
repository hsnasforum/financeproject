import { describe, expect, it } from "vitest";
import { getComparableRate, sortProducts } from "../src/lib/finlife/uiSort";
import { type NormalizedProduct } from "../src/lib/finlife/types";

function product(partial: Partial<NormalizedProduct>): NormalizedProduct {
  return {
    fin_prdt_cd: partial.fin_prdt_cd ?? "X",
    kor_co_nm: partial.kor_co_nm,
    fin_prdt_nm: partial.fin_prdt_nm,
    options: partial.options ?? [],
    best: partial.best,
    raw: partial.raw ?? {},
  };
}

describe("finlife ui sort", () => {
  it("extracts comparable rate from best first", () => {
    const p = product({
      fin_prdt_cd: "A",
      best: { save_trm: "12", intr_rate: 2.7, intr_rate2: 3.2 },
      options: [{ save_trm: "6", intr_rate: 5, intr_rate2: 5.1, raw: {} }],
    });
    expect(getComparableRate(p)).toBe(5.1);
  });

  it("sorts higher/lower and places null-rate items last", () => {
    const rows: NormalizedProduct[] = [
      product({ fin_prdt_cd: "A", fin_prdt_nm: "A", kor_co_nm: "K1", best: { intr_rate: 3.1, intr_rate2: 3.4 }, options: [] }),
      product({ fin_prdt_cd: "B", fin_prdt_nm: "B", kor_co_nm: "K2", best: { intr_rate: 2.1, intr_rate2: 2.2 }, options: [] }),
      product({ fin_prdt_cd: "C", fin_prdt_nm: "C", kor_co_nm: "K3", options: [{ save_trm: "12", intr_rate: null, intr_rate2: null, raw: {} }] }),
    ];

    expect(sortProducts(rows, "higher").map((r) => r.fin_prdt_cd)).toEqual(["A", "B", "C"]);
    expect(sortProducts(rows, "lower").map((r) => r.fin_prdt_cd)).toEqual(["B", "A", "C"]);
  });
});
