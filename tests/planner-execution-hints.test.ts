import { describe, expect, it } from "vitest";
import { buildBenefitQueries, inferSubscriptionRegion } from "../src/lib/planner/executionHints";
import { type PlannerInput } from "../src/lib/planner/metrics";

const baseInput: PlannerInput = {
  unit: "MANWON",
  goalName: "목돈 마련",
  goalAmount: 2000,
  goalDeadlineMonths: 36,
  goalPriority: "medium",
  monthlyIncome: 420,
  monthlyFixedExpense: 150,
  monthlyVariableExpense: 90,
  cashAssets: 600,
  debtBalance: 300,
  debtRateAnnual: 8,
  monthlyDebtPayment: 25,
  emergencyTargetMonths: 3,
  assumedAnnualReturn: 3,
  assumedInflationRate: 2.5,
  extraMonthlySaving: 0,
  extraMonthlyDebtPayment: 0,
  riskProfile: "balanced",
  insuranceStatus: "unknown",
  monthlyInsurancePremium: 0,
  indemnityStatus: "unknown",
  insurancePurposeHealth: false,
  insurancePurposeAccident: false,
  insurancePurposeLife: false,
  insurancePurposeIncome: false,
  retirementAssets: 0,
  retirementMonthlyContribution: 0,
  npsExpectedMonthly: 0,
  retirementNeedRatioPct: 70,
  retirementWithdrawalRatePct: 3.5,
};

describe("planner execution hints", () => {
  it("builds benefit query list from goal keywords with fallback", () => {
    expect(buildBenefitQueries({ ...baseInput, goalName: "내집 마련 청년 취업" })).toEqual(["주거", "청년", "취업"]);
    expect(buildBenefitQueries(baseInput)).toEqual(["주거", "청년", "의료"]);
  });

  it("infers subscription region from goal name", () => {
    expect(inferSubscriptionRegion("부산 내집마련")).toBe("부산");
    expect(inferSubscriptionRegion("기타 목표")).toBe("서울");
  });
});
