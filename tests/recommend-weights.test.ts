import { describe, expect, it } from "vitest";
import { normalizeRecommendWeights } from "../src/lib/recommend/weights";

describe("recommend weight normalization", () => {
  it("restores defaults when every weight is zero", () => {
    expect(normalizeRecommendWeights({ rate: 0, term: 0, liquidity: 0 })).toEqual({
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
      originalSum: 0,
      normalized: true,
      reason: "zero_sum_defaulted",
    });
  });

  it.each([
    [{ rate: 0.2, term: 0.2, liquidity: 0.2 }, 0.6],
    [{ rate: 1, term: 1, liquidity: 1 }, 3],
  ] as const)("normalizes a non-unit sum", (input, originalSum) => {
    const result = normalizeRecommendWeights(input);

    expect(result.originalSum).toBeCloseTo(originalSum, 12);
    expect(result.normalized).toBe(true);
    expect(result.reason).toBe("sum_adjusted");
    expect(result.weights.rate + result.weights.term + result.weights.liquidity).toBe(1);
  });

  it("preserves an already valid profile exactly", () => {
    expect(normalizeRecommendWeights({ rate: 0.55, term: 0.3, liquidity: 0.15 })).toEqual({
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
      originalSum: 1,
      normalized: false,
      reason: "none",
    });
  });
});
