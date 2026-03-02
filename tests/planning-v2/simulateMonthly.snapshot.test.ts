import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2, type SimulationAssumptionsV2 } from "../../src/lib/planning/v2/types";

type Scenario = {
  name: string;
  profile: ProfileV2;
  assumptions: SimulationAssumptionsV2;
  horizonMonths: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000;
}

function roundDebtRates(rates: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(rates).map(([key, value]) => [key, normalizeRate(value)]),
  );
}

function makeScenario(seed: number): Scenario {
  const profile: ProfileV2 = {
    monthlyIncomeNet: 2_300_000 + seed * 65_000,
    monthlyEssentialExpenses: 900_000 + (seed % 5) * 120_000,
    monthlyDiscretionaryExpenses: 350_000 + (seed % 4) * 85_000,
    liquidAssets: 250_000 + (seed % 6) * 180_000,
    investmentAssets: 300_000 + (seed % 7) * 220_000,
    debts: [],
    goals: [
      {
        id: `goal-emergency-${seed}`,
        name: "Emergency Reserve",
        targetAmount: 2_500_000 + (seed % 4) * 700_000,
        targetMonth: 12 + (seed % 5) * 6,
        priority: 5,
        minimumMonthlyContribution: 80_000,
      },
    ],
  };

  if (seed % 2 === 0) {
    profile.debts.push({
      id: `debt-card-${seed}`,
      name: "Card Loan",
      balance: 2_000_000 + (seed % 5) * 650_000,
      minimumPayment: 120_000 + (seed % 4) * 25_000,
      apr: seed % 6 === 0 ? undefined : 0.12 + (seed % 5) * 0.01,
    });
  }

  if (seed % 3 === 0) {
    profile.debts.push({
      id: `debt-auto-${seed}`,
      name: "Auto Loan",
      balance: 3_000_000 + (seed % 4) * 900_000,
      minimumPayment: 150_000 + (seed % 3) * 20_000,
      apr: 0.055 + (seed % 2) * 0.01,
    });
  }

  if (seed % 2 === 1) {
    profile.goals.push({
      id: `goal-travel-${seed}`,
      name: "Travel",
      targetAmount: 1_500_000 + (seed % 4) * 350_000,
      targetMonth: 10 + (seed % 6) * 4,
      priority: 2,
      minimumMonthlyContribution: 20_000,
    });
  }

  if (seed % 5 === 0) {
    profile.goals.push({
      id: `goal-education-${seed}`,
      name: "Education",
      targetAmount: 3_500_000 + (seed % 3) * 900_000,
      targetMonth: 24 + (seed % 3) * 12,
      priority: 4,
      minimumMonthlyContribution: 90_000,
    });
  }

  const assumptions: SimulationAssumptionsV2 = {
    inflation: 0.01 + (seed % 5) * 0.005,
    expectedReturn: 0.02 + (seed % 6) * 0.01,
    debtRates: seed % 4 === 0
      ? {
        [`debt-card-${seed}`]: 0.11 + (seed % 3) * 0.01,
      }
      : undefined,
  };

  return {
    name: `scenario-${seed}`,
    profile,
    assumptions,
    horizonMonths: 12 + (seed % 4) * 12,
  };
}

function summarizeScenario(seed: number) {
  const scenario = makeScenario(seed);
  const result = simulateMonthly(scenario.profile, scenario.assumptions, scenario.horizonMonths);
  const last = result.timeline[result.timeline.length - 1];

  return {
    scenario: scenario.name,
    horizonMonths: scenario.horizonMonths,
    assumptionsUsed: {
      annualInflationRate: round2(result.assumptionsUsed.annualInflationRate),
      annualExpectedReturnRate: round2(result.assumptionsUsed.annualExpectedReturnRate),
      annualDebtRates: roundDebtRates(result.assumptionsUsed.annualDebtRates),
    },
    finalRow: {
      month: last.month,
      netWorth: last.netWorth,
      liquidAssets: last.liquidAssets,
      investmentAssets: last.investmentAssets,
      totalDebt: last.totalDebt,
      goalFundAssets: last.goalFundAssets,
    },
    warnings: result.warnings.map((warning) => ({
      reasonCode: warning.reasonCode,
      month: warning.month ?? null,
      meta: warning.meta ?? null,
    })),
    goalStatus: result.goalStatus.map((goal) => ({
      goalId: goal.goalId,
      achieved: goal.achieved,
      achievedMonth: goal.achievedMonth,
      onTrack: goal.onTrack,
      progressPct: goal.progressPct,
      shortfall: goal.shortfall,
    })),
    explainabilityTail: result.explainability.slice(-2).map((entry) => ({
      month: entry.month,
      reasonCode: entry.reasonCode,
      why: entry.why.slice(0, 3),
    })),
  };
}

describe("planning v2 monthly simulation snapshots", () => {
  it("matches snapshot for 30 deterministic scenarios", () => {
    const seeds = Array.from({ length: 30 }, (_, index) => index + 1);
    expect(seeds.length).toBe(30);

    const snapshots = seeds.map((seed) => summarizeScenario(seed));
    expect(snapshots).toMatchSnapshot();
  });
});
