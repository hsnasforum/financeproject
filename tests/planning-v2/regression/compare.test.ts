import { describe, expect, it } from "vitest";
import { compareRegressionExpected, moneyTolerance, PROBABILITY_TOLERANCE } from "../../../src/lib/planning/v2/regression/compare";
import { normalizeRegressionOutput } from "../../../src/lib/planning/v2/regression/normalize";
import { type SimulationResultV2 } from "../../../src/lib/planning/v2/types";

function makeSimulation(partial?: Partial<SimulationResultV2>): SimulationResultV2 {
  return {
    assumptionsUsed: {
      annualInflationRate: 0.02,
      annualExpectedReturnRate: 0.05,
      monthlyInflationRate: 0.001651,
      monthlyExpectedReturnRate: 0.004074,
      annualDebtRates: {},
      monthlyDebtRates: {},
    },
    timeline: [
      {
        month: 1,
        income: 1,
        pensionIncome: 0,
        expenses: 1,
        operatingCashflow: 0,
        debtPayment: 0,
        debtInterest: 0,
        debtPrincipalPaid: 0,
        contributionToInvest: 0,
        contributionToPension: 0,
        goalContribution: 0,
        investmentReturn: 0,
        liquidAssets: 1_200_000,
        investmentAssets: 5_000_000,
        pensionAssets: 0,
        goalFundAssets: 0,
        totalDebt: 0,
        netWorth: 6_200_000,
        netWorthDelta: 0,
        debtServiceRatio: 0,
        goalProgress: {},
      },
      {
        month: 2,
        income: 1,
        pensionIncome: 0,
        expenses: 1,
        operatingCashflow: 0,
        debtPayment: 0,
        debtInterest: 0,
        debtPrincipalPaid: 0,
        contributionToInvest: 0,
        contributionToPension: 0,
        goalContribution: 0,
        investmentReturn: 0,
        liquidAssets: 900_000,
        investmentAssets: 5_500_000,
        pensionAssets: 0,
        goalFundAssets: 0,
        totalDebt: 0,
        netWorth: 6_400_000,
        netWorthDelta: 200_000,
        debtServiceRatio: 0,
        goalProgress: { g1: 100 },
      },
    ],
    goalStatus: [
      {
        goalId: "g1",
        name: "Goal 1",
        targetAmount: 100,
        currentAmount: 100,
        progressPct: 100,
        achieved: true,
        achievedMonth: 2,
        targetMonth: 2,
        onTrack: true,
        shortfall: 0,
      },
    ],
    warnings: [
      {
        reasonCode: "STEADY_PROGRESS",
        message: "steady",
      },
    ],
    explainability: [],
    ...partial,
  };
}

describe("planning v2 regression compare", () => {
  it("normalizes deterministic outputs and compares within tolerance", () => {
    const base = makeSimulation();
    const normalized = normalizeRegressionOutput({
      simulate: base,
      scenarios: {
        base,
        conservative: {
          ...base,
          timeline: [{ ...base.timeline[0] }, { ...base.timeline[1], netWorth: 6_000_000 }],
        },
        aggressive: {
          ...base,
          timeline: [{ ...base.timeline[0] }, { ...base.timeline[1], netWorth: 7_100_000 }],
        },
      },
      monteCarlo: {
        meta: { paths: 100, seed: 1 },
        probabilities: {
          retirementDepletionBeforeEnd: 0.12129,
        },
        percentiles: {
          endNetWorthKrw: { p10: 1, p50: 6_543_210.4, p90: 2 },
          worstCashKrw: { p10: 1, p50: 2, p90: 3 },
        },
        notes: [],
      },
      actions: [
        {
          code: "SET_ASSUMPTIONS_REVIEW",
          severity: "info",
          title: "title",
          summary: "summary",
          why: [],
          metrics: {},
          steps: [],
          cautions: [],
        },
      ],
    });

    expect(normalized.simulate.endNetWorthKrw).toBe(6_400_000);
    expect(normalized.simulate.worstCashKrw).toBe(900_000);
    expect(normalized.monteCarlo?.retirementDepletionBeforeEnd).toBe(0.121);
    expect(normalized.monteCarlo?.endNetWorthP50Krw).toBe(6_543_210);
    expect(normalized.actions.codes).toEqual(["SET_ASSUMPTIONS_REVIEW"]);

    const compare = compareRegressionExpected(normalized, {
      ...normalized,
      simulate: {
        ...normalized.simulate,
        endNetWorthKrw: normalized.simulate.endNetWorthKrw + moneyTolerance(normalized.simulate.endNetWorthKrw) - 1,
      },
      monteCarlo: {
        retirementDepletionBeforeEnd: (normalized.monteCarlo?.retirementDepletionBeforeEnd ?? 0) + PROBABILITY_TOLERANCE - 0.001,
        endNetWorthP50Krw: (normalized.monteCarlo?.endNetWorthP50Krw ?? 0) + 99_999,
      },
    });

    expect(compare.ok).toBe(true);
    expect(compare.diffs).toEqual([]);
  });

  it("reports diffs outside tolerance and set changes", () => {
    const expected = {
      simulate: {
        endNetWorthKrw: 10_000_000,
        worstCashKrw: 1_500_000,
        warnings: ["A", "B"],
        goals: [{ id: "g1", achieved: true }],
      },
      scenarios: {
        baseEndNetWorthKrw: 10_000_000,
        conservativeEndNetWorthKrw: 9_000_000,
        aggressiveEndNetWorthKrw: 11_500_000,
      },
      monteCarlo: {
        retirementDepletionBeforeEnd: 0.2,
        endNetWorthP50Krw: 10_300_000,
      },
      actions: {
        codes: ["X", "Y"],
      },
    };

    const actual = {
      simulate: {
        endNetWorthKrw: 9_700_000,
        worstCashKrw: 1_000_000,
        warnings: ["A", "C"],
        goals: [{ id: "g1", achieved: false }],
      },
      scenarios: {
        baseEndNetWorthKrw: 9_000_000,
        conservativeEndNetWorthKrw: 8_000_000,
        aggressiveEndNetWorthKrw: 10_000_000,
      },
      monteCarlo: {
        retirementDepletionBeforeEnd: 0.29,
        endNetWorthP50Krw: 9_900_000,
      },
      actions: {
        codes: ["X", "Z"],
      },
    };

    const result = compareRegressionExpected(expected, actual);
    expect(result.ok).toBe(false);
    expect(result.diffs.length).toBeGreaterThan(0);
    expect(result.diffs.some((diff) => diff.path === "simulate.warnings" && diff.kind === "set")).toBe(true);
    expect(result.diffs.some((diff) => diff.path === "actions.codes" && diff.kind === "set")).toBe(true);
    expect(result.diffs.some((diff) => diff.path === "monteCarlo.retirementDepletionBeforeEnd" && diff.kind === "probability")).toBe(true);
  });
});
