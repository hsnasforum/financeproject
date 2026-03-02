import { describe, expect, it } from "vitest";
import { normalizeAprPct, normalizeNewAprPct, RateNormalizationError } from "../../../src/lib/planning/normalizeRates";

describe("normalizeRates", () => {
  it("converts legacy decimal APR to percent", () => {
    expect(normalizeAprPct(0.048)).toBeCloseTo(4.8, 8);
    expect(normalizeNewAprPct(0.039)).toBeCloseTo(3.9, 8);
    expect(normalizeAprPct(0.123456789)).toBeCloseTo(12.345679, 8);
  });

  it("keeps percent APR values as-is", () => {
    expect(normalizeAprPct(4.8)).toBeCloseTo(4.8, 8);
    expect(normalizeNewAprPct(5.4)).toBeCloseTo(5.4, 8);
  });

  it("throws for APR outside allowed range", () => {
    expect(() => normalizeAprPct(101)).toThrow(RateNormalizationError);
    expect(() => normalizeNewAprPct(-1)).toThrow(RateNormalizationError);
  });
});
