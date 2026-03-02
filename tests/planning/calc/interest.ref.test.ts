import { describe, expect, it } from "vitest";
import { defaultTaxRatePct, estimateSimpleInterest, roundKrw } from "../../../src/lib/planning/calc";

describe("calc SSOT - interest reference", () => {
  it("matches fixed gross interest reference", () => {
    const result = estimateSimpleInterest({
      principalKrw: 10_000_000,
      ratePct: 3.6,
      termMonths: 12,
      taxRatePct: 0,
    });
    expect(result.grossInterestKrw).toBe(360_000);
    expect(result.evidence.formula).toContain("grossInterestKrw");
  });

  it("matches policy-driven net interest reference", () => {
    const result = estimateSimpleInterest({
      principalKrw: 10_000_000,
      ratePct: 3.6,
      termMonths: 12,
      taxRatePct: defaultTaxRatePct,
    });
    const expectedNet = roundKrw(360_000 * (1 - (defaultTaxRatePct / 100)));
    expect(result.netInterestKrw).toBe(expectedNet);
    // lock current default policy output
    expect(result.netInterestKrw).toBe(304_560);
    expect(result.assumptionsUsed.taxRatePct).toBe(defaultTaxRatePct);
  });
});
