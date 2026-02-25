import { describe, expect, it } from "vitest";
import { computeInsuranceMetrics } from "../src/lib/planner/insuranceMetrics";
import { computeRetirementMetrics } from "../src/lib/planner/retirementMetrics";

describe("planner insurance/retirement metrics", () => {
  it("computes insurance premium ratio and level", () => {
    const metrics = computeInsuranceMetrics({
      unit: "KRW",
      monthlyIncome: 4_000_000,
      monthlyInsurancePremium: 450_000,
    });
    expect(metrics.premiumRatioPct).toBeCloseTo(11.25, 2);
    expect(metrics.level).toBe("ok");
  });

  it("computes retirement gap and actions", () => {
    const metrics = computeRetirementMetrics({
      unit: "KRW",
      monthlyIncome: 4_000_000,
      monthlyFixedExpense: 1_500_000,
      monthlyVariableExpense: 1_000_000,
      retirementAssets: 80_000_000,
      retirementMonthlyContribution: 300_000,
      npsExpectedMonthly: 700_000,
      retirementNeedRatioPct: 70,
      retirementWithdrawalRatePct: 3.5,
    });
    expect(metrics.retirementNeedMonthlyWon).toBeGreaterThan(0);
    expect(metrics.assetNeededApproxWon).toBeGreaterThan(metrics.currentAssetsWon);
    expect(Array.isArray(metrics.actions)).toBe(true);
    expect(metrics.actions.length).toBeGreaterThan(0);
  });
});

