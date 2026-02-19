import { describe, expect, it } from "vitest";
import { scoreProducts } from "../src/lib/recommend/score";
import { type NormalizedProduct } from "../src/lib/finlife/types";

describe("scoreProducts", () => {
  it("builds final score from contribution terms", () => {
    const products: NormalizedProduct[] = [
      {
        fin_prdt_cd: "A",
        fin_prdt_nm: "A",
        kor_co_nm: "은행",
        raw: {},
        options: [{ save_trm: "12", intr_rate: 3, intr_rate2: 4, raw: {} }],
        best: { save_trm: "12", intr_rate: 3, intr_rate2: 4 },
      },
    ];

    const [top] = scoreProducts(products, {
      purpose: "목돈",
      preferredTerms: ["12"],
      liquidityNeed: "low",
      ratePreference: "balanced",
      topN: 1,
    });

    const c = top.explain.contributions;
    const recomposed = Number((c.ratePoints + c.termPoints + c.liquidityPoints).toFixed(1));

    expect(top.explain.finalPoints).toBe(recomposed);
    expect(top.explain.maxPoints).toBe(100);
  });
});
