import { describe, expect, it } from "vitest";
import { buildScenarios } from "../../src/lib/planning/v2/scenarios";
import { diffPlanResults } from "../../src/lib/planning/v2/diff";
import { type SimulationResultV2, type TimelineRowV2 } from "../../src/lib/planning/v2/types";

function timelineRow(input: { month: number; netWorth: number; liquidAssets: number }): TimelineRowV2 {
  return {
    month: input.month,
    income: 0,
    pensionIncome: 0,
    expenses: 0,
    operatingCashflow: 0,
    debtPayment: 0,
    debtInterest: 0,
    debtPrincipalPaid: 0,
    contributionToInvest: 0,
    contributionToPension: 0,
    goalContribution: 0,
    investmentReturn: 0,
    liquidAssets: input.liquidAssets,
    investmentAssets: 0,
    pensionAssets: 0,
    goalFundAssets: 0,
    totalDebt: 0,
    netWorth: input.netWorth,
    netWorthDelta: 0,
    debtServiceRatio: 0,
    goalProgress: {},
  };
}

function resultFixture(input: {
  annualInflationRate: number;
  annualExpectedReturnRate: number;
  timeline: TimelineRowV2[];
  warningCodes: Array<SimulationResultV2["warnings"][number]["reasonCode"]>;
  achievedGoals: number;
}): SimulationResultV2 {
  return {
    assumptionsUsed: {
      annualInflationRate: input.annualInflationRate,
      annualExpectedReturnRate: input.annualExpectedReturnRate,
      monthlyInflationRate: 0,
      monthlyExpectedReturnRate: 0,
      annualDebtRates: {},
      monthlyDebtRates: {},
    },
    timeline: input.timeline,
    goalStatus: Array.from({ length: 2 }, (_, index) => ({
      goalId: `goal-${index + 1}`,
      name: `Goal ${index + 1}`,
      targetAmount: 100,
      currentAmount: index < input.achievedGoals ? 100 : 50,
      progressPct: index < input.achievedGoals ? 100 : 50,
      achieved: index < input.achievedGoals,
      achievedMonth: index < input.achievedGoals ? 1 : null,
      targetMonth: 12,
      onTrack: index < input.achievedGoals,
      shortfall: index < input.achievedGoals ? 0 : 50,
    })),
    warnings: input.warningCodes.map((reasonCode) => ({
      reasonCode,
      message: reasonCode,
    })),
    explainability: [],
  };
}

describe("planning v2 scenarios", () => {
  it("builds conservative/aggressive deltas by risk tolerance", () => {
    const base = {
      inflationPct: 2,
      investReturnPct: 5,
      cashReturnPct: 2,
      withdrawalRatePct: 4,
      debtRates: {},
    };

    const low = buildScenarios({ base, riskTolerance: "low" });
    const lowConservative = low.find((entry) => entry.id === "conservative");
    const lowAggressive = low.find((entry) => entry.id === "aggressive");
    expect(lowConservative?.assumptions.investReturnPct).toBe(3);
    expect(lowAggressive?.assumptions.investReturnPct).toBe(6);

    const mid = buildScenarios({ base, riskTolerance: "mid" });
    const midConservative = mid.find((entry) => entry.id === "conservative");
    const midAggressive = mid.find((entry) => entry.id === "aggressive");
    expect(midConservative?.assumptions.investReturnPct).toBe(2);
    expect(midAggressive?.assumptions.investReturnPct).toBe(6.5);

    const high = buildScenarios({ base, riskTolerance: "high" });
    const highConservative = high.find((entry) => entry.id === "conservative");
    const highAggressive = high.find((entry) => entry.id === "aggressive");
    expect(highConservative?.assumptions.investReturnPct).toBe(1);
    expect(highAggressive?.assumptions.investReturnPct).toBe(7);
    expect(highConservative?.assumptions.inflationPct).toBe(2.5);
    expect(highAggressive?.assumptions.inflationPct).toBe(1.7);
    expect(highConservative?.assumptions.cashReturnPct).toBe(1.5);
  });

  it("clamps scenario pct values to sane bounds", () => {
    const scenarios = buildScenarios({
      base: {
        inflationPct: 29.9,
        investReturnPct: 29.8,
        cashReturnPct: 0.1,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      riskTolerance: "high",
    });

    const aggressive = scenarios.find((entry) => entry.id === "aggressive");
    const conservative = scenarios.find((entry) => entry.id === "conservative");

    expect(aggressive?.assumptions.investReturnPct).toBe(30);
    expect(conservative?.assumptions.investReturnPct).toBeGreaterThanOrEqual(-20);
    expect(conservative?.assumptions.cashReturnPct).toBeGreaterThanOrEqual(0);
  });

  it("builds deterministic diff for end net worth and warning changes", () => {
    const base = resultFixture({
      annualInflationRate: 0.02,
      annualExpectedReturnRate: 0.05,
      timeline: [
        timelineRow({ month: 1, netWorth: 100, liquidAssets: 40 }),
        timelineRow({ month: 2, netWorth: 120, liquidAssets: 20 }),
      ],
      warningCodes: ["NEGATIVE_CASHFLOW"],
      achievedGoals: 1,
    });

    const other = resultFixture({
      annualInflationRate: 0.025,
      annualExpectedReturnRate: 0.07,
      timeline: [
        timelineRow({ month: 1, netWorth: 100, liquidAssets: 45 }),
        timelineRow({ month: 2, netWorth: 150, liquidAssets: 5 }),
      ],
      warningCodes: ["INSOLVENT"],
      achievedGoals: 2,
    });

    const diff = diffPlanResults(base, other);

    expect(diff.keyMetrics.endNetWorthDeltaKrw).toBe(30);
    expect(diff.keyMetrics.worstCashMonthIndex).toBe(1);
    expect(diff.keyMetrics.worstCashDeltaKrw).toBe(-15);
    expect(diff.keyMetrics.goalsAchievedDelta).toBe(1);
    expect(diff.warningsDelta).toEqual({
      added: ["INSOLVENT"],
      removed: ["NEGATIVE_CASHFLOW"],
    });
    expect(diff.shortWhy.length).toBeGreaterThanOrEqual(3);
    expect(diff.shortWhy.length).toBeLessThanOrEqual(6);
  });
});
