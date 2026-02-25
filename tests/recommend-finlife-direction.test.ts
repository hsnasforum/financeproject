import { describe, expect, it } from "vitest";
import { scoreProducts } from "../src/lib/recommend/score";
import { type NormalizedProduct } from "../src/lib/finlife/types";

function makeLoanProduct(code: string, rate: number): NormalizedProduct {
  return {
    fin_prdt_cd: code,
    fin_prdt_nm: code,
    kor_co_nm: "테스트은행",
    raw: {},
    options: [
      {
        save_trm: "12",
        intr_rate: null,
        intr_rate2: null,
        raw: { lend_rate_min: rate, lend_rate_max: rate + 0.8 },
      },
    ],
    best: { save_trm: "12", intr_rate: null, intr_rate2: null },
  };
}

describe("scoreProducts direction", () => {
  it("ranks lower interest loan higher when rateDirection is lower", () => {
    const products = [makeLoanProduct("LOAN-HIGH", 5.1), makeLoanProduct("LOAN-LOW", 3.2)];

    const ranked = scoreProducts(products, {
      purpose: "대출",
      preferredTerms: ["12"],
      liquidityNeed: "medium",
      ratePreference: "aggressive",
      rateDirection: "lower",
      topN: 2,
    });

    expect(ranked[0]?.product.fin_prdt_cd).toBe("LOAN-LOW");
    expect(ranked[0]?.explain.contributions.ratePoints).toBeGreaterThan(ranked[1]?.explain.contributions.ratePoints ?? 0);
    expect(ranked[0]?.explain.why.bullets[0]).toContain("후보군 기준 금리 상위");
    expect(ranked[0]?.explain.why.bullets[0]).toContain("낮을수록 유리");
  });
});
