import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

import { validateProfileV2 } from "../../src/lib/planning/v2/validate";
import emergencyCase from "./regression/corpus/case-006.json";

const zeroRates = { inflation: 0, expectedReturn: 0 };

function profile(targetAmount: number, targetMonth = 2, currentAmount = 0): ProfileV2 {
  return {
    monthlyIncomeNet: 100_000, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0, investmentAssets: 0, debts: [],
    goals: [{ id: "goal", name: "목표", targetAmount, targetMonth, currentAmount, priority: 3 }],
  };
}

describe("goal deadlines through public simulateMonthly", () => {
  it("warns for case-006's 18-month deadline even though the goal is achieved at month 23", () => {
    const { profile: input, assumptions, horizonMonths } = emergencyCase.input;
    const result = simulateMonthly(validateProfileV2(input), {
      inflation: assumptions.inflationPct,
      expectedReturn: assumptions.investReturnPct,
    }, horizonMonths);

    // Independent cash-flow sum: q = 1.02^(1/12);
    // F(n) = 600000 + 4100000*n - 3200000*(q^n - 1)/(q - 1).
    // F(18)=15984218.85; F(22)=19165602.81; F(23)=19947292.78.
    expect(result.goalStatus[0]).toMatchObject({
      goalId: "goal-emergency", targetMonth: 18,
      achieved: true, achievedMonth: 23, onTrack: false,
    });
    expect(result.warnings.find((item) => item.reasonCode === "GOAL_MISSED"))
      .toMatchObject({ month: 18, meta: { goalId: "goal-emergency", shortfall: 3_215_781.15 } });
    // F(60) + the separate investment account 3500000*1.045^5.
    expect(result.timeline.at(-1)?.netWorth).toBeCloseTo(49_301_222.09, 2);
  });

  it.each([
    { name: "reached at deadline", target: 200_000, deadline: 2, horizon: 3, initial: 0, achieved: true, month: 2, onTrack: true, missed: false },
    { name: "reached after deadline", target: 300_000, deadline: 2, horizon: 3, initial: 0, achieved: true, month: 3, onTrack: false, missed: true },
    { name: "unreached at deadline", target: 300_000, deadline: 2, horizon: 2, initial: 0, achieved: false, month: null, onTrack: false, missed: true },
    { name: "deadline beyond horizon", target: 400_000, deadline: 4, horizon: 2, initial: 0, achieved: false, month: null, onTrack: true, missed: false },
    { name: "already reached initially", target: 300_000, deadline: 2, horizon: 3, initial: 300_000, achieved: true, month: 0, onTrack: true, missed: false },
    { name: "near target but deadline missed", target: 210_000, deadline: 2, horizon: 2, initial: 0, achieved: false, month: null, onTrack: false, missed: true },
    { name: "slow progress before deadline", target: 1_000_000, deadline: 4, horizon: 2, initial: 0, achieved: false, month: null, onTrack: false, missed: false },
  ])("$name", ({ target, deadline, horizon, initial, achieved, month, onTrack, missed }) => {
    const result = simulateMonthly(profile(target, deadline, initial), zeroRates, horizon);
    const status = result.goalStatus[0];
    const warning = result.warnings.find((item) => item.reasonCode === "GOAL_MISSED");
    expect(status).toMatchObject({ achieved, achievedMonth: month, onTrack });
    expect(Boolean(warning)).toBe(missed);
  });

  it.each([3, 4])("uses exact deadline funds in warning, trace and explanation at horizon %i", (horizon) => {
    const input = profile(300_000.1);
    const atDeadline = simulateMonthly(input, zeroRates, 2).goalStatus[0];
    const result = simulateMonthly(input, zeroRates, horizon);
    const shortfall = atDeadline.shortfall;
    expect(shortfall).toBe(100_000.1);
    expect(result.goalStatus[0].shortfall).toBe(horizon === 3 ? 0.1 : 0);
    expect(result.warnings.find((item) => item.reasonCode === "GOAL_MISSED"))
      .toMatchObject({ month: 2, meta: { goalId: "goal", shortfall } });
    expect(result.traces?.find((item) => item.code === "GOAL_MISSED"))
      .toMatchObject({ monthIndex: 1, data: { shortfall, targetMonth: 2 } });
    expect(result.explainability.find((item) => item.reasonCode === "GOAL_MISSED"))
      .toMatchObject({ month: 2, meta: { shortfall }, why: [{ amount: -shortfall }] });
  });

  it("keeps on-time and late outcomes attached to IDs across goal permutations", () => {
    const input = profile(100_000);
    input.goals = [
      { ...input.goals[0], id: "on-time", minimumMonthlyContribution: 50_000 },
      { ...input.goals[0], id: "late", targetAmount: 200_000, minimumMonthlyContribution: 50_000 },
    ];
    for (const goals of [input.goals, [...input.goals].reverse()]) {
      const result = simulateMonthly({ ...input, goals }, zeroRates, 3);
      expect(result.goalStatus.find((item) => item.goalId === "on-time"))
        .toMatchObject({ achieved: true, achievedMonth: 2, onTrack: true, shortfall: 0 });
      expect(result.goalStatus.find((item) => item.goalId === "late"))
        .toMatchObject({ achieved: true, achievedMonth: 3, onTrack: false, shortfall: 0 });
      expect(result.warnings.filter((item) => item.reasonCode === "GOAL_MISSED"))
        .toMatchObject([{ month: 2, meta: { goalId: "late", shortfall: 100_000 } }]);
    }
  });

  it("keeps finite deadline evidence for a submonth target accepted as month zero", () => {
    // Preserve the existing public normalizer's truncation; do not change validation here.
    const result = simulateMonthly(profile(200_000, 0.5), zeroRates, 1);
    expect(result.goalStatus[0]).toMatchObject({ targetMonth: 0, shortfall: 100_000 });
    expect(result.warnings.find((item) => item.reasonCode === "GOAL_MISSED"))
      .toMatchObject({ month: 0, meta: { shortfall: 200_000 } });
  });

  it("keeps deadline evidence aligned with the existing lifecycle retirement assessment", () => {
    const input = profile(300_000, 2, 300_000);
    input.goals[0].id = "retirement";
    input.cashflow = { phases: [{
      id: "retired", title: "은퇴", range: { startMonth: 0, endMonth: 2 },
      monthlyIncomeKrw: 0, monthlyFixedExpensesKrw: 100_000,
    }] };
    const result = simulateMonthly(input, zeroRates, 3);
    const status = result.goalStatus[0];
    expect(status.achieved).toBe(false);
    expect(status.shortfall).toBeGreaterThan(300_000);
    expect(result.warnings.find((item) => item.reasonCode === "GOAL_MISSED"))
      .toMatchObject({ month: 2, meta: { goalId: "retirement", shortfall: status.shortfall } });
    expect(result.traces?.find((item) => item.code === "GOAL_MISSED")?.data?.shortfall).toBe(status.shortfall);
  });
});
