import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function baseAssumptions() {
  return { inflation: 0.02, expectedReturn: 0.03 };
}

describe("planning v2 simulateMonthly cashflow schedule", () => {
  it("applies lifecycle phases and drops earned income after retirement phase starts", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 3_000_000,
      investmentAssets: 5_000_000,
      debts: [],
      goals: [],
      cashflow: {
        rules: { phaseOverlapPolicy: "sum" },
        phases: [
          {
            id: "working",
            title: "Working",
            range: { startMonth: 0, endMonth: 239 },
            monthlyIncomeKrw: 4_000_000,
            monthlyFixedExpensesKrw: 1_500_000,
            monthlyVariableExpensesKrw: 700_000,
          },
          {
            id: "retired",
            title: "Retired",
            range: { startMonth: 240, endMonth: 359 },
            monthlyIncomeKrw: 0,
            monthlyFixedExpensesKrw: 1_400_000,
            monthlyVariableExpensesKrw: 500_000,
          },
        ],
      },
    };

    const result = simulateMonthly(profile, baseAssumptions(), 300);
    expect(result.timeline[239]?.income).toBeGreaterThan(0);
    expect(result.timeline[240]?.income).toBe(0);
  });

  it("reduces retirement goal gap when pension payout exists", () => {
    const profileNoPension: ProfileV2 = {
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_700_000,
      monthlyDiscretionaryExpenses: 900_000,
      liquidAssets: 2_000_000,
      investmentAssets: 15_000_000,
      debts: [],
      goals: [
        {
          id: "goal-retirement",
          name: "Retirement",
          targetAmount: 100_000_000,
          targetMonth: 130,
          priority: 5,
        },
      ],
      cashflow: {
        phases: [
          {
            id: "working",
            title: "Working",
            range: { startMonth: 0, endMonth: 119 },
            monthlyIncomeKrw: 4_200_000,
            monthlyFixedExpensesKrw: 1_700_000,
            monthlyVariableExpensesKrw: 900_000,
          },
          {
            id: "retired",
            title: "Retired",
            range: { startMonth: 120, endMonth: 359 },
            monthlyIncomeKrw: 0,
            monthlyFixedExpensesKrw: 1_700_000,
            monthlyVariableExpensesKrw: 900_000,
          },
        ],
      },
    };

    const profileWithPension: ProfileV2 = {
      ...profileNoPension,
      cashflow: {
        ...profileNoPension.cashflow,
        pensions: [
          {
            id: "nps",
            title: "NPS",
            range: { startMonth: 120, endMonth: 359 },
            monthlyPayoutKrw: 2_100_000,
          },
        ],
      },
    };

    const withoutPension = simulateMonthly(profileNoPension, baseAssumptions(), 180);
    const withPension = simulateMonthly(profileWithPension, baseAssumptions(), 180);

    const goalWithout = withoutPension.goalStatus.find((goal) => goal.goalId === "goal-retirement");
    const goalWith = withPension.goalStatus.find((goal) => goal.goalId === "goal-retirement");
    expect(goalWithout).toBeDefined();
    expect(goalWith).toBeDefined();
    expect((goalWith?.shortfall ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(goalWithout?.shortfall ?? 0);
  });

  it("moves scheduled contributions to investments", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_300_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 1_500_000,
      investmentAssets: 500_000,
      debts: [],
      goals: [],
      cashflow: {
        contributions: [
          {
            id: "invest-dca",
            title: "Invest DCA",
            from: "cash",
            to: "investments",
            range: { startMonth: 0, endMonth: 11 },
            monthlyAmountKrw: 400_000,
          },
        ],
      },
    };

    const noContribution = simulateMonthly(
      { ...profile, cashflow: { contributions: [] } },
      { inflation: 0, expectedReturn: 0 },
      12,
    );
    const withContribution = simulateMonthly(
      profile,
      { inflation: 0, expectedReturn: 0 },
      12,
    );

    const endNoContribution = noContribution.timeline[noContribution.timeline.length - 1]?.investmentAssets ?? 0;
    const endWithContribution = withContribution.timeline[withContribution.timeline.length - 1]?.investmentAssets ?? 0;
    expect(endWithContribution).toBeGreaterThan(endNoContribution);
  });

  it("emits CONTRIBUTION_SKIPPED when contribution cannot be funded", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 1_000_000,
      monthlyEssentialExpenses: 900_000,
      monthlyDiscretionaryExpenses: 300_000,
      liquidAssets: 100_000,
      investmentAssets: 0,
      debts: [],
      goals: [],
      cashflow: {
        contributions: [
          {
            id: "invest-dca",
            title: "Invest DCA",
            from: "cash",
            to: "investments",
            range: { startMonth: 0, endMonth: 5 },
            monthlyAmountKrw: 400_000,
          },
        ],
      },
    };

    const result = simulateMonthly(profile, { inflation: 0, expectedReturn: 0 }, 6);
    const codes = result.warnings.map((warning) => warning.reasonCode);
    expect(codes).toContain("CONTRIBUTION_SKIPPED");
  });
});
