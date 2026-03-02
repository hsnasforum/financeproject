import { describe, expect, it } from "vitest";
import { normalizeAprPct, simulateAmortizingPayoff } from "../../src/lib/planning/calc";

describe("planning/calc debt reference", () => {
  it("normalizes legacy decimal apr to percent", () => {
    expect(normalizeAprPct(0.075)).toBe(7.5);
  });

  it("keeps amortizing payoff outputs deterministic", () => {
    const payoff = simulateAmortizingPayoff(10_000_000, 4.8, 12);
    expect(payoff.negativeAmortizationRisk).toBe(false);
    expect(payoff.monthlyPaymentKrw).toBe(855_159);
    expect(payoff.totalInterestKrw).toBe(261_903);
  });
});
