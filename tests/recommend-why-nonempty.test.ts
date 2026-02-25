import { describe, expect, it } from "vitest";
import { scoreProducts } from "../src/lib/recommend/score";
import { type NormalizedProduct } from "../src/lib/finlife/types";

describe("recommend why fallback", () => {
  it("keeps why bullets non-empty when rate or term are missing", () => {
    const products: NormalizedProduct[] = [
      {
        fin_prdt_cd: "X",
        fin_prdt_nm: "정보부족상품",
        kor_co_nm: "테스트은행",
        raw: {},
        options: [{ raw: {}, intr_rate: null, intr_rate2: null }],
      },
      {
        fin_prdt_cd: "Y",
        fin_prdt_nm: "기간부족상품",
        kor_co_nm: "테스트저축은행",
        raw: {},
        options: [{ raw: { lend_rate_min: 4.2 }, intr_rate: null, intr_rate2: null }],
      },
    ];

    const scored = scoreProducts(products, {
      purpose: "대출",
      preferredTerms: ["12", "24"],
      liquidityNeed: "medium",
      ratePreference: "balanced",
      rateDirection: "lower",
      topN: 2,
    });

    expect(scored.length).toBeGreaterThan(0);
    for (const row of scored) {
      expect(row.explain.why.bullets.length).toBeGreaterThanOrEqual(2);
      expect(row.explain.why.bullets.join(" ").length).toBeGreaterThan(5);
    }
  });
});
