import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "../../src/lib/planning/v2/monteCarlo";
import { type AssumptionsV2 } from "../../src/lib/planning/v2/scenarios";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function profileFixture(): ProfileV2 {
  return {
    monthlyIncomeNet: 2_800_000,
    monthlyEssentialExpenses: 2_000_000,
    monthlyDiscretionaryExpenses: 500_000,
    liquidAssets: 2_000_000,
    investmentAssets: 25_000_000,
    debts: [],
    goals: [
      {
        id: "goal-retirement",
        name: "Retirement",
        targetAmount: 55_000_000,
        targetMonth: 100,
        priority: 5,
      },
      {
        id: "goal-trip",
        name: "Travel",
        targetAmount: 4_000_000,
        targetMonth: 24,
        priority: 2,
      },
    ],
  };
}

function profileWithLifecycle(includePension: boolean): ProfileV2 {
  return {
    monthlyIncomeNet: 3_000_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 12_000_000,
    debts: [],
    goals: [
      {
        id: "goal-retirement",
        name: "Retirement",
        targetAmount: 120_000_000,
        targetMonth: 60,
        priority: 5,
      },
    ],
    cashflow: {
      phases: [
        {
          id: "working",
          title: "Working",
          range: { startMonth: 0, endMonth: 59 },
          monthlyIncomeKrw: 3_000_000,
          monthlyFixedExpensesKrw: 1_600_000,
          monthlyVariableExpensesKrw: 700_000,
        },
        {
          id: "retired",
          title: "Retired",
          range: { startMonth: 60, endMonth: 239 },
          monthlyIncomeKrw: 0,
          monthlyFixedExpensesKrw: 1_600_000,
          monthlyVariableExpensesKrw: 700_000,
        },
      ],
      ...(includePension ? {
        pensions: [
          {
            id: "nps",
            title: "NPS",
            range: { startMonth: 60, endMonth: 239 },
            monthlyPayoutKrw: 1_700_000,
          },
        ],
      } : {}),
    },
  };
}

function baseAssumptions(investReturnPct = 4): AssumptionsV2 {
  return {
    inflationPct: 2,
    investReturnPct,
    cashReturnPct: 2,
    withdrawalRatePct: 4,
    debtRates: {},
  };
}

describe("planning v2 monte-carlo", () => {
  it("is fully reproducible with same seed/paths/input", () => {
    const input = {
      profile: profileFixture(),
      horizonMonths: 120,
      baseAssumptions: baseAssumptions(4),
      paths: 600,
      seed: 424242,
      riskTolerance: "mid" as const,
    };

    const a = runMonteCarlo(input);
    const b = runMonteCarlo(input);

    expect(a).toEqual(b);
  });

  it("improves depletion probability when invest return mean increases by +2%p", () => {
    const lowReturn = runMonteCarlo({
      profile: profileFixture(),
      horizonMonths: 120,
      baseAssumptions: baseAssumptions(4),
      paths: 500,
      seed: 2026,
      riskTolerance: "mid",
    });

    const highReturn = runMonteCarlo({
      profile: profileFixture(),
      horizonMonths: 120,
      baseAssumptions: baseAssumptions(6),
      paths: 500,
      seed: 2026,
      riskTolerance: "mid",
    });

    const lowProb = lowReturn.probabilities.retirementDepletionBeforeEnd ?? 1;
    const highProb = highReturn.probabilities.retirementDepletionBeforeEnd ?? 1;
    expect(highProb).toBeLessThanOrEqual(lowProb);
  });

  it("keeps probability/percentile drift within threshold as paths increase (500 -> 2000)", () => {
    const r500 = runMonteCarlo({
      profile: profileFixture(),
      horizonMonths: 120,
      baseAssumptions: baseAssumptions(4),
      paths: 500,
      seed: 123,
      riskTolerance: "mid",
    });
    const r2000 = runMonteCarlo({
      profile: profileFixture(),
      horizonMonths: 120,
      baseAssumptions: baseAssumptions(4),
      paths: 2000,
      seed: 123,
      riskTolerance: "mid",
    });

    const depletionProbDelta = Math.abs(
      (r500.probabilities.retirementDepletionBeforeEnd ?? 0) - (r2000.probabilities.retirementDepletionBeforeEnd ?? 0),
    );
    const p50Delta = Math.abs(
      (r500.percentiles.endNetWorthKrw.p50 ?? 0) - (r2000.percentiles.endNetWorthKrw.p50 ?? 0),
    );

    expect(depletionProbDelta).toBeLessThan(0.08);
    expect(p50Delta).toBeLessThan(2_000_000);
  });

  it("changes depletion probability directionally when pension cashflow is added", () => {
    const withoutPension = runMonteCarlo({
      profile: profileWithLifecycle(false),
      horizonMonths: 180,
      baseAssumptions: baseAssumptions(4),
      paths: 500,
      seed: 8888,
      riskTolerance: "mid",
    });
    const withPension = runMonteCarlo({
      profile: profileWithLifecycle(true),
      horizonMonths: 180,
      baseAssumptions: baseAssumptions(4),
      paths: 500,
      seed: 8888,
      riskTolerance: "mid",
    });

    const a = withoutPension.probabilities.retirementDepletionBeforeEnd ?? 1;
    const b = withPension.probabilities.retirementDepletionBeforeEnd ?? 1;
    expect(b).toBeLessThanOrEqual(a);
  });
});
