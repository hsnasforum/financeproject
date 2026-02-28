import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

describe("planning v2 monthly simulation edge cases", () => {
  it("flags negative cashflow and liquidity stress", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 1_800_000,
      monthlyEssentialExpenses: 1_300_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 100_000,
      investmentAssets: 0,
      debts: [
        {
          id: "debt-1",
          name: "Card",
          balance: 3_500_000,
          minimumPayment: 220_000,
          apr: 0.22,
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "Safety",
          targetAmount: 1_200_000,
          targetMonth: 12,
          priority: 4,
        },
      ],
    };

    const result = simulateMonthly(profile, { inflation: 0.02, expectedReturn: 0.01 }, 12);
    const warningCodes = result.warnings.map((warning) => warning.reasonCode);

    expect(warningCodes).toContain("NEGATIVE_CASHFLOW");
    expect(warningCodes).toContain("INSOLVENT");
    expect(result.timeline[result.timeline.length - 1]?.liquidAssets ?? 0).toBeLessThan(0);
  });

  it("flags high debt ratio and negative amortization", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_000_000,
      monthlyDiscretionaryExpenses: 300_000,
      liquidAssets: 500_000,
      investmentAssets: 0,
      debts: [
        {
          id: "debt-heavy",
          name: "High APR loan",
          balance: 80_000_000,
          minimumPayment: 1_500_000,
          apr: 0.30,
        },
      ],
      goals: [],
    };

    const result = simulateMonthly(profile, { inflation: 0.01, expectedReturn: 0 }, 18);
    const warningCodes = result.warnings.map((warning) => warning.reasonCode);

    expect(warningCodes).toContain("HIGH_DEBT_RATIO");
    expect(warningCodes).toContain("DEBT_NEGATIVE_AMORTIZATION");

    const debtTrajectory = result.timeline.map((row) => row.totalDebt);
    expect(debtTrajectory[debtTrajectory.length - 1]).toBeGreaterThan(debtTrajectory[0]);
  });

  it("prioritizes urgent and high-priority goals in multi-goal setup", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 5_200_000,
      monthlyEssentialExpenses: 1_400_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 500_000,
      investmentAssets: 1_000_000,
      debts: [],
      goals: [
        {
          id: "goal-home",
          name: "Home Down Payment",
          targetAmount: 12_000_000,
          targetMonth: 12,
          priority: 5,
          minimumMonthlyContribution: 200_000,
        },
        {
          id: "goal-retire",
          name: "Retirement",
          targetAmount: 24_000_000,
          targetMonth: 36,
          priority: 1,
          minimumMonthlyContribution: 80_000,
        },
      ],
    };

    const result = simulateMonthly(profile, { inflation: 0.01, expectedReturn: 0.04 }, 24);
    const homeGoal = result.goalStatus.find((goal) => goal.goalId === "goal-home");
    const retirementGoal = result.goalStatus.find((goal) => goal.goalId === "goal-retire");

    expect(homeGoal).toBeDefined();
    expect(retirementGoal).toBeDefined();

    expect(homeGoal?.achieved).toBe(true);
    expect(homeGoal?.achievedMonth ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(12);
    expect(homeGoal?.achievedMonth ?? Number.POSITIVE_INFINITY).toBeLessThan(
      retirementGoal?.achievedMonth ?? Number.POSITIVE_INFINITY,
    );
  });

  it("returns identical outputs for identical inputs", () => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_200_000,
      monthlyDiscretionaryExpenses: 650_000,
      liquidAssets: 800_000,
      investmentAssets: 1_600_000,
      debts: [
        {
          id: "debt-a",
          name: "Debt A",
          balance: 5_000_000,
          minimumPayment: 220_000,
          apr: 0.11,
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "Goal A",
          targetAmount: 8_000_000,
          targetMonth: 24,
          priority: 4,
          minimumMonthlyContribution: 120_000,
        },
      ],
    };

    const assumptions = { inflation: 0.015, expectedReturn: 0.05 };

    const runA = simulateMonthly(profile, assumptions, 24);
    const runB = simulateMonthly(profile, assumptions, 24);

    expect(runA).toEqual(runB);
  });
});
