import { describe, expect, it } from "vitest";
import {
  buildScenarioParams,
  monteCarloRun,
  type MonteCarloDistributionSummary,
} from "../src/lib/planning/v3/service/monteCarloCore";

function expectSummaryShape(summary: MonteCarloDistributionSummary): void {
  expect(Number.isFinite(summary.mean)).toBe(true);
  expect(Number.isFinite(summary.median)).toBe(true);
  expect(Number.isFinite(summary.p05)).toBe(true);
  expect(Number.isFinite(summary.p25)).toBe(true);
  expect(Number.isFinite(summary.p75)).toBe(true);
  expect(Number.isFinite(summary.p95)).toBe(true);
  expect(Number.isFinite(summary.failureProbability)).toBe(true);
  expect(summary.failureProbability).toBeGreaterThanOrEqual(0);
  expect(summary.failureProbability).toBeLessThanOrEqual(1);
}

describe("planning v3 monteCarlo core", () => {
  it("returns same output for same seed and same numeric input", () => {
    const input = {
      seed: 42,
      sampleCount: 1500,
      periodMonths: 36,
      draftPatch: {
        monthlyIncomeNet: 4_000_000,
        monthlyEssentialExpenses: 1_300_000,
        monthlyDiscretionaryExpenses: 700_000,
      },
      summary: {
        avgNetKrw: 2_000_000,
      },
    };

    const left = buildScenarioParams(input);
    const right = buildScenarioParams(input);

    expect(left).toEqual(right);
    expect(left.ok).toBe(true);
    if (left.ok) {
      expectSummaryShape(left.data.scenarios.base);
      expectSummaryShape(left.data.scenarios.conservative);
      expectSummaryShape(left.data.scenarios.aggressive);
    }
  });

  it("returns different values for different seeds while keeping stable output shape", () => {
    const inputA = {
      seed: 41,
      sampleCount: 1200,
      periodMonths: 24,
      draftPatch: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_100_000,
        monthlyDiscretionaryExpenses: 500_000,
      },
      summary: {
        avgNetKrw: 1_400_000,
      },
    };
    const inputB = {
      ...inputA,
      seed: 99,
    };

    const first = buildScenarioParams(inputA);
    const second = buildScenarioParams(inputB);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.data.scenarios.base).not.toEqual(second.data.scenarios.base);
    expect(Object.keys(first.data.scenarios).sort()).toEqual(["aggressive", "base", "conservative"]);
    expect(Object.keys(second.data.scenarios).sort()).toEqual(["aggressive", "base", "conservative"]);
    expectSummaryShape(first.data.scenarios.base);
    expectSummaryShape(second.data.scenarios.base);
  });

  it("normalizes volatility input format and reflects volatility changes", () => {
    const baseInput = {
      seed: 777,
      sampleCount: 1600,
      periodMonths: 48,
      draftPatch: {
        monthlyIncomeNet: 4_000_000,
        monthlyEssentialExpenses: 1_500_000,
        monthlyDiscretionaryExpenses: 500_000,
      },
    };

    const asNumber = buildScenarioParams({ ...baseInput, volatilityPct: 20 });
    const asString = buildScenarioParams({ ...baseInput, volatilityPct: "20" });
    const lowerVol = buildScenarioParams({ ...baseInput, volatilityPct: 10 });
    const higherVol = buildScenarioParams({ ...baseInput, volatilityPct: 40 });

    expect(asNumber).toEqual(asString);
    expect(asNumber.ok).toBe(true);
    expect(lowerVol.ok).toBe(true);
    expect(higherVol.ok).toBe(true);
    if (!lowerVol.ok || !higherVol.ok) return;

    expect(lowerVol.data.scenarios.base).not.toEqual(higherVol.data.scenarios.base);
  });

  it("handles empty/invalid input safely without throw", () => {
    expect(() => buildScenarioParams({})).not.toThrow();
    const empty = buildScenarioParams({});
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe("INPUT");
    }

    const invalidNumeric = buildScenarioParams({
      seed: "not-a-number",
      sampleCount: "NaN",
      periodMonths: -10,
      draftPatch: {
        monthlyIncomeNet: "abc",
        monthlyEssentialExpenses: "def",
      },
      summary: {
        avgNetKrw: "1500000",
      },
    });
    expect(invalidNumeric.ok).toBe(true);
    if (invalidNumeric.ok) {
      expect(invalidNumeric.data.sampleCount).toBeGreaterThan(0);
      expect(invalidNumeric.data.periodMonths).toBeGreaterThan(0);
      expectSummaryShape(invalidNumeric.data.scenarios.base);
    }

    expect(() => monteCarloRun({
      monthlyNetKrw: Number.NaN,
      sampleCount: -1,
      periodMonths: 0,
      volatility: Number.POSITIVE_INFINITY,
      drift: Number.NEGATIVE_INFINITY,
      shockFloor: 3,
      shockCap: -3,
      failureThresholdKrw: Number.NaN,
    }, Number.NaN)).not.toThrow();
    const fallback = monteCarloRun({
      monthlyNetKrw: Number.NaN,
      sampleCount: -1,
      periodMonths: 0,
      volatility: Number.POSITIVE_INFINITY,
      drift: Number.NEGATIVE_INFINITY,
      shockFloor: 3,
      shockCap: -3,
      failureThresholdKrw: Number.NaN,
    }, Number.NaN);
    expectSummaryShape(fallback);
  });
});
