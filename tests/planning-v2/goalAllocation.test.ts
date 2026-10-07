import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2, type ProfileV2Goal } from "../../src/lib/planning/v2/types";
import { type AllocationPolicyId } from "../../src/lib/planning/v2/policy/types";

const zeroRates = { inflation: 0, expectedReturn: 0 };
// Public money values are rounded to two decimals; allow one output unit.
const moneyTolerance = 0.01;

function expectMoney(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(moneyTolerance);
}

function goal(id: string, overrides: Partial<ProfileV2Goal> = {}): ProfileV2Goal {
  return { id, name: id, targetAmount: 10_000_000, targetMonth: 12, priority: 3, ...overrides };
}

function profile(budget: number, goals: ProfileV2Goal[]): ProfileV2 {
  return {
    monthlyIncomeNet: budget,
    monthlyEssentialExpenses: 0,
    monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals,
  };
}

describe("goal allocation through the public monthly simulation", () => {
  it.each([
    { budget: 100_000, minima: [0, 0], amounts: [50_000, 50_000] },
    { budget: 200_000, minima: [100_000, 100_000], amounts: [100_000, 100_000] },
    { budget: 100_000, minima: [120_000, 80_000], amounts: [60_000, 40_000] },
  ])("funds both goals from the same stage budget: $budget / $minima", ({ budget, minima, amounts }) => {
    const goals = [goal("a", { minimumMonthlyContribution: minima[0] }), goal("b", { minimumMonthlyContribution: minima[1] })];
    for (const order of [goals, [...goals].reverse()]) {
      const result = simulateMonthly(profile(budget, order), zeroRates, 1);
      expect(Object.fromEntries(result.goalStatus.map((item) => [item.goalId, item.currentAmount])))
        .toEqual({ a: amounts[0], b: amounts[1] });
      expect(result.timeline[0]).toMatchObject({ goalContribution: budget, goalFundAssets: budget, liquidAssets: 0, netWorth: budget });
      expect(result.goalStatus.map((item) => item.goalId)).toEqual(order.map((item) => item.id));
    }
  });

  it.each([45_000, 60_000, 120_000])("keeps ID results and monthly transfers across all three-goal permutations at %i", (budget) => {
    const goals = [
      goal("a", { targetMonth: 3, priority: 1, minimumMonthlyContribution: 10_000 }),
      goal("b", { targetMonth: 4, priority: 2, minimumMonthlyContribution: 20_000 }),
      goal("c", { targetMonth: 12, priority: 5, minimumMonthlyContribution: 30_000 }),
    ];
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const baseline = simulateMonthly(profile(budget, goals), zeroRates, 6);
    for (const order of orders) {
      const input = profile(budget, order.map((index) => goals[index]));
      const before = structuredClone(input);
      const result = simulateMonthly(input, zeroRates, 6);
      expect(input).toEqual(before);
      expect(simulateMonthly(input, zeroRates, 6)).toEqual(result);
      expect(simulateMonthly(input, zeroRates, 6, { policyId: "balanced" })).toEqual(result);
      expect(result.goalStatus.map((item) => item.goalId)).toEqual(input.goals.map((item) => item.id));
      for (const expected of baseline.goalStatus) {
        const actual = result.goalStatus.find((item) => item.goalId === expected.goalId)!;
        expectMoney(actual.currentAmount, expected.currentAmount);
        expectMoney(actual.progressPct, expected.progressPct);
        expect(actual.achievedMonth).toBe(expected.achievedMonth);
      }
      result.timeline.forEach((row, index) => {
        const previous = result.timeline[index - 1];
        const available = (previous?.liquidAssets ?? 0) + row.income - row.expenses;
        expectMoney(row.goalContribution, budget);
        expectMoney(row.goalFundAssets - (previous?.goalFundAssets ?? 0), row.goalContribution);
        expectMoney(available - row.liquidAssets, row.goalContribution);
        expectMoney(row.netWorth, budget * (index + 1));
        expectMoney(row.goalFundAssets, baseline.timeline[index].goalFundAssets);
        expect(row.goalContribution).toBeLessThanOrEqual(available + moneyTolerance);
      });
    }
  });

  it("uses priority divided by remaining months for the budget left after minima", () => {
    // 160,000 remains after minima; weights 1/4 and 3/4 receive 40,000 and 120,000.
    const goals = [goal("a", { priority: 1, targetMonth: 4, minimumMonthlyContribution: 10_000 }),
      goal("b", { priority: 3, targetMonth: 4, minimumMonthlyContribution: 30_000 })];
    for (const order of [goals, [...goals].reverse()]) {
      const result = simulateMonthly(profile(200_000, order), zeroRates, 1);
      expect(Object.fromEntries(result.goalStatus.map((item) => [item.goalId, item.currentAmount])))
        .toEqual({ a: 50_000, b: 150_000 });
      expect(result.timeline[0].liquidAssets).toBe(0);
    }
  });

  it.each([
    { name: "single goal", goals: [goal("a")], contribution: 100_000, initialFunds: 0 },
    { name: "no goals", goals: [], contribution: 0, initialFunds: 0 },
    { name: "all reached", goals: [goal("a", { targetAmount: 50_000, currentAmount: 50_000 })], contribution: 0, initialFunds: 50_000 },
  ])("handles $name", ({ goals, contribution, initialFunds }) => {
    const result = simulateMonthly(profile(100_000, goals), zeroRates, 1);
    expect(result.timeline[0]).toMatchObject({
      goalContribution: contribution, goalFundAssets: initialFunds + contribution,
      liquidAssets: 100_000 - contribution, netWorth: 100_000 + initialFunds,
    });
  });

  it("does not fund minima or weights with zero available cash", () => {
    const result = simulateMonthly(profile(0, [goal("a", { minimumMonthlyContribution: 100_000 }), goal("b")]), zeroRates, 1);
    expect(result.goalStatus.map((item) => item.currentAmount)).toEqual([0, 0]);
    expect(result.timeline[0]).toMatchObject({ goalContribution: 0, goalFundAssets: 0, liquidAssets: 0, netWorth: 0 });
  });

  it.each([
    { minimum: 0, expectedB: 50_000, cash: 40_000 },
    { minimum: 100_000, expectedB: 90_000, cash: 0 },
  ])("caps the remaining target without recycling weighted cap leftovers: minimum=$minimum", ({ minimum, expectedB, cash }) => {
    const goals = [goal("a", { currentAmount: 90_000, targetAmount: 100_000, minimumMonthlyContribution: minimum }), goal("b")];
    for (const order of [goals, [...goals].reverse()]) {
      const result = simulateMonthly(profile(100_000, order), zeroRates, 1);
      expect(Object.fromEntries(result.goalStatus.map((item) => [item.goalId, item.currentAmount])))
        .toEqual({ a: 100_000, b: expectedB });
      expect(result.goalStatus.find((item) => item.goalId === "a")?.achievedMonth).toBe(1);
      expect(result.timeline[0]).toMatchObject({ goalContribution: 10_000 + expectedB, liquidAssets: cash, netWorth: 190_000 });
    }
  });

  it("reaches equal goals in the same month and retains later cash", () => {
    const goals = [goal("a", { targetAmount: 100_000 }), goal("b", { targetAmount: 100_000 })];
    for (const order of [goals, [...goals].reverse()]) {
      const result = simulateMonthly(profile(100_000, order), zeroRates, 3);
      expect(result.goalStatus.map((item) => item.achievedMonth)).toEqual([2, 2]);
      expect(result.timeline.map((row) => row.goalContribution)).toEqual([100_000, 100_000, 0]);
      expect(result.timeline.map((row) => row.goalFundAssets)).toEqual([100_000, 200_000, 200_000]);
      expect(result.timeline.map((row) => row.liquidAssets)).toEqual([0, 0, 100_000]);
      expect(result.timeline.map((row) => row.netWorth)).toEqual([100_000, 200_000, 300_000]);
    }
  });

  it.each([
    { policyId: "balanced", goalBudget: 1_000_000, invest: 0, cash: 0 },
    { policyId: "safety", goalBudget: 200_000, invest: 0, cash: 800_000 },
    { policyId: "growth", goalBudget: 200_000, invest: 600_000, cash: 200_000 },
  ] as const)("does not use cash reserved outside the $policyId goal budget", ({ policyId, goalBudget, invest, cash }) => {
    const goals = [goal("a", { minimumMonthlyContribution: 1_000_000 }), goal("b", { minimumMonthlyContribution: 1_000_000 })];
    for (const order of [goals, [...goals].reverse()]) {
      const result = simulateMonthly(profile(1_000_000, order), zeroRates, 1, { policyId });
      expect(result.goalStatus.map((item) => item.currentAmount)).toEqual([goalBudget / 2, goalBudget / 2]);
      expect(result.timeline[0]).toMatchObject({ goalContribution: goalBudget, liquidAssets: cash, investmentAssets: invest, netWorth: 1_000_000 });
    }
  });

  it.each([
    { policyId: "balanced", debtPayment: 1_000_000, invest: 0, pension: 0, goals: 0 },
    { policyId: "safety", debtPayment: 820_000, invest: 40_000, pension: 20_000, goals: 120_000 },
    { policyId: "growth", debtPayment: 280_000, invest: 580_000, pension: 20_000, goals: 120_000 },
  ] as const)("keeps debt and scheduled contributions ahead of goals under $policyId", ({ policyId, debtPayment, invest, pension, goals }) => {
    const input = profile(1_000_000, [goal("a"), goal("b")]);
    input.debts = [{ id: "loan", name: "loan", balance: 1_000_000, minimumPayment: 100_000, apr: 0 }];
    input.cashflow = { phases: [
      { id: "income", title: "income", range: { startMonth: 0, endMonth: 0 }, monthlyIncomeKrw: 1_000_000 },
    ], contributions: [
      { id: "invest", title: "invest", range: { startMonth: 0, endMonth: 0 }, from: "cash", to: "investments", monthlyAmountKrw: 40_000 },
      { id: "pension", title: "pension", range: { startMonth: 0, endMonth: 0 }, from: "cash", to: "pension", monthlyAmountKrw: 20_000 },
    ] };
    const result = simulateMonthly(input, zeroRates, 1, { policyId });
    expect(result.timeline[0]).toMatchObject({ debtPayment, contributionToInvest: invest, contributionToPension: pension,
      goalContribution: goals, goalFundAssets: goals, liquidAssets: 0, netWorth: 0 });
    expect(result.goalStatus.map((item) => item.currentAmount)).toEqual([goals / 2, goals / 2]);
  });

  it.each(["safety", "growth"] as AllocationPolicyId[])("keeps emergency protection under %s", (policyId) => {
    const input = profile(200_000, [goal("a"), goal("b")]);
    input.monthlyEssentialExpenses = 100_000;
    const result = simulateMonthly(input, zeroRates, 1, { policyId });
    expect(result.timeline[0]).toMatchObject({ contributionToInvest: 0, netWorth: 100_000 });
    expect(result.timeline[0].goalContribution).toBe(policyId === "safety" ? 0 : 80_000);
    expect(result.timeline[0].liquidAssets).toBe(policyId === "safety" ? 100_000 : 20_000);
  });
});
