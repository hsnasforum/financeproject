import { describe, expect, it } from "vitest";
import { buildActionsFromPlan } from "../../src/lib/planning/v2/actions/buildActions";
import { type AssumptionsV2 } from "../../src/lib/planning/v2/scenarios";
import { type ProfileV2, type SimulationResultV2, type TimelineRowV2 } from "../../src/lib/planning/v2/types";

function row(input: {
  month: number;
  operatingCashflow?: number;
  liquidAssets?: number;
  debtServiceRatio?: number;
}): TimelineRowV2 {
  return {
    month: input.month,
    income: 0,
    pensionIncome: 0,
    expenses: 0,
    operatingCashflow: input.operatingCashflow ?? 0,
    debtPayment: 0,
    debtInterest: 0,
    debtPrincipalPaid: 0,
    contributionToInvest: 0,
    contributionToPension: 0,
    goalContribution: 0,
    investmentReturn: 0,
    liquidAssets: input.liquidAssets ?? 0,
    investmentAssets: 0,
    pensionAssets: 0,
    goalFundAssets: 0,
    totalDebt: 0,
    netWorth: 0,
    netWorthDelta: 0,
    debtServiceRatio: input.debtServiceRatio ?? 0,
    goalProgress: {},
  };
}

function baseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 3000,
    monthlyEssentialExpenses: 1000,
    monthlyDiscretionaryExpenses: 500,
    liquidAssets: 2000,
    investmentAssets: 0,
    debts: [],
    goals: [],
  };
}

function baseAssumptions(): AssumptionsV2 {
  return {
    inflationPct: 2,
    investReturnPct: 5,
    cashReturnPct: 2,
    withdrawalRatePct: 4,
    debtRates: {},
  };
}

function planFixture(): SimulationResultV2 {
  return {
    assumptionsUsed: {
      annualInflationRate: 0.02,
      annualExpectedReturnRate: 0.05,
      monthlyInflationRate: 0,
      monthlyExpectedReturnRate: 0,
      annualDebtRates: {},
      monthlyDebtRates: {},
    },
    timeline: [
      row({ month: 1, operatingCashflow: -200, liquidAssets: 1500, debtServiceRatio: 0.35 }),
      row({ month: 2, operatingCashflow: -300, liquidAssets: -200, debtServiceRatio: 0.55 }),
    ],
    goalStatus: [],
    warnings: [],
    explainability: [],
  };
}

describe("planning v2 action builder", () => {
  it("creates FIX_NEGATIVE_CASHFLOW as top priority when negative cashflow warning exists", () => {
    const plan = planFixture();
    plan.warnings = [
      { reasonCode: "NEGATIVE_CASHFLOW", message: "negative cashflow" },
      { reasonCode: "INSOLVENT", message: "insolvent" },
    ];

    const actions = buildActionsFromPlan({
      plan,
      profile: baseProfile(),
      baseAssumptions: baseAssumptions(),
      snapshotMeta: { missing: true },
    });

    expect(actions[0]?.code).toBe("FIX_NEGATIVE_CASHFLOW");
    expect(actions[0]?.severity).toBe("critical");
    expect(actions[0]?.metrics.monthlyDeficitKrw).toBe(300);
    expect(actions[0]?.metrics.worstCashMonthIndex).toBe(1);
  });

  it("creates BUILD_EMERGENCY_FUND with emergency gap metrics", () => {
    const plan = planFixture();
    plan.warnings = [{ reasonCode: "EMERGENCY_FUND_SHORT" as never, message: "emergency short" }];

    const actions = buildActionsFromPlan({
      plan,
      profile: baseProfile(),
      baseAssumptions: baseAssumptions(),
      snapshotMeta: { missing: false, asOf: "2026-02-28" },
    });

    const action = actions.find((entry) => entry.code === "BUILD_EMERGENCY_FUND");
    expect(action).toBeDefined();
    expect(action?.metrics.currentCashKrw).toBe(2000);
    expect(action?.metrics.emergencyTargetKrw).toBe(9000);
    expect(action?.metrics.emergencyGapKrw).toBe(7000);
  });

  it("creates REDUCE_DEBT_SERVICE and captures debt service ratio", () => {
    const plan = planFixture();
    plan.warnings = [{ reasonCode: "HIGH_DEBT_SERVICE" as never, message: "high debt service" }];

    const actions = buildActionsFromPlan({
      plan,
      profile: baseProfile(),
      baseAssumptions: baseAssumptions(),
      snapshotMeta: { missing: false, asOf: "2026-02-28" },
    });

    const action = actions.find((entry) => entry.code === "REDUCE_DEBT_SERVICE");
    expect(action).toBeDefined();
    expect(action?.metrics.debtServiceRatio).toBe(0.55);
  });
});
