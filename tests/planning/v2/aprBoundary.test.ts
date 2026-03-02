import { describe, expect, it } from "vitest";
import { decimalToAprPct, normalizeForEngineRates, toEngineProfile, toEngineRateBoundary } from "../../../src/lib/planning/v2/aprBoundary";

describe("aprBoundary", () => {
  it("converts aprPct(percent) to engine decimal rate", () => {
    const boundary = toEngineRateBoundary(4.8);
    expect(boundary.pct).toBeCloseTo(4.8, 8);
    expect(boundary.decimal).toBeCloseTo(0.048, 8);
  });

  it("normalizes legacy decimal input (0.048) to percent and decimal consistently", () => {
    const boundary = toEngineRateBoundary(0.048);
    expect(boundary.pct).toBeCloseTo(4.8, 8);
    expect(boundary.decimal).toBeCloseTo(0.048, 8);
  });

  it("supports offer newAprPct conversion with the same boundary", () => {
    const boundary = toEngineRateBoundary(0.039, "newAprPct");
    expect(boundary.pct).toBeCloseTo(3.9, 8);
    expect(boundary.decimal).toBeCloseTo(0.039, 8);
  });

  it("converts engine decimal back to percent for debt strategy boundary", () => {
    expect(decimalToAprPct(0.054)).toBeCloseTo(5.4, 8);
  });

  it("normalizes debt aprPct / offer newAprPct into engine decimal fields in one boundary", () => {
    const converted = normalizeForEngineRates({
      debts: [{ id: "loan-1", aprPct: 4.8 }],
      offers: [{ liabilityId: "loan-1", newAprPct: 3.9 }],
    });

    expect(converted.debts[0]).toEqual({ id: "loan-1", apr: 0.048 });
    expect(converted.offers[0]).toEqual({ liabilityId: "loan-1", newApr: 0.039 });
  });

  it("converts canonical profile debt aprPct to engine apr decimal", () => {
    const converted = toEngineProfile({
      monthlyIncomeNet: 4_000_000,
      debts: [{ id: "loan-1", aprPct: 4.8, balance: 10_000_000 }],
    });
    expect(converted.debts[0]).toMatchObject({ id: "loan-1", apr: 0.048 });
  });
});
