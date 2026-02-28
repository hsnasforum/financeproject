import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";

function assumptions() {
  return {
    inflation: 0.02,
    expectedReturn: 0.05,
  };
}

function profileCaseA() {
  return {
    monthlyIncomeNet: 4_600_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_000_000,
    investmentAssets: 1_000_000,
    debts: [
      { id: "d1", name: "loan-a", balance: 12_000_000, minimumPayment: 280_000, apr: 0.11 },
    ],
    goals: [
      { id: "g1", name: "goal-a", targetAmount: 5_000_000, targetMonth: 24, priority: 3 },
    ],
  };
}

function profileCaseB() {
  return {
    monthlyIncomeNet: 5_000_000,
    monthlyEssentialExpenses: 1_800_000,
    monthlyDiscretionaryExpenses: 900_000,
    liquidAssets: 4_000_000,
    investmentAssets: 3_000_000,
    debts: [
      { id: "d1", name: "loan-b1", balance: 8_000_000, minimumPayment: 180_000, apr: 0.09 },
      { id: "d2", name: "loan-b2", balance: 6_000_000, minimumPayment: 150_000, apr: 0.07 },
    ],
    goals: [
      { id: "g1", name: "goal-b1", targetAmount: 8_000_000, targetMonth: 36, priority: 4 },
      { id: "g2", name: "goal-b2", targetAmount: 4_500_000, targetMonth: 18, priority: 5 },
    ],
  };
}

function profileCaseC() {
  return {
    monthlyIncomeNet: 3_700_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 6_000_000,
    debts: [],
    goals: [
      { id: "g1", name: "goal-c1", targetAmount: 3_000_000, targetMonth: 12, priority: 5, minimumMonthlyContribution: 150_000 },
    ],
  };
}

describe("allocation policy regression", () => {
  it("keeps legacy behavior when policy is omitted vs balanced preset", () => {
    const scenarios = [
      { profile: profileCaseA(), horizon: 24 },
      { profile: profileCaseB(), horizon: 36 },
      { profile: profileCaseC(), horizon: 18 },
    ];

    for (const scenario of scenarios) {
      const legacy = simulateMonthly(scenario.profile, assumptions(), scenario.horizon);
      const balanced = simulateMonthly(scenario.profile, assumptions(), scenario.horizon, { policyId: "balanced" });
      expect(legacy).toEqual(balanced);
    }
  });
});

describe("allocation policy presets", () => {
  it("changes trajectory between safety and growth presets", () => {
    const profile = profileCaseA();
    const horizon = 30;

    const balanced = simulateMonthly(profile, assumptions(), horizon, { policyId: "balanced" });
    const safety = simulateMonthly(profile, assumptions(), horizon, { policyId: "safety" });
    const growth = simulateMonthly(profile, assumptions(), horizon, { policyId: "growth" });

    const endBalanced = balanced.timeline[balanced.timeline.length - 1];
    const endSafety = safety.timeline[safety.timeline.length - 1];
    const endGrowth = growth.timeline[growth.timeline.length - 1];

    expect(endSafety.netWorth).not.toBe(endGrowth.netWorth);
    expect(endGrowth.investmentAssets).toBeGreaterThan(endBalanced.investmentAssets);
    expect(endSafety.totalDebt).toBeLessThanOrEqual(endGrowth.totalDebt);
  });
});
