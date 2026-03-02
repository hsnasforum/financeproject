import { describe, expect, it } from "vitest";
import { normalizeProfileWithReport } from "../../../src/lib/planning/v2/normalizationReport";

describe("normalizeProfileWithReport", () => {
  it("records APR_DECIMAL_TO_PCT fix when legacy decimal apr is provided", () => {
    const result = normalizeProfileWithReport({
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 2_000_000,
      investmentAssets: 3_000_000,
      debts: [
        {
          id: "loan-1",
          name: "Loan",
          balance: 10_000_000,
          minimumPayment: 300_000,
          aprPct: 0.075,
          remainingMonths: 48,
          repaymentType: "amortizing",
        },
      ],
      goals: [],
    }, "balanced");

    const aprFix = result.report.fixesApplied.find((item) => item.code === "APR_DECIMAL_TO_PCT");
    expect(aprFix).toBeDefined();
    expect(aprFix?.path).toBe("/debts/0/aprPct");
    expect(aprFix?.before).toBe(0.075);
    expect(aprFix?.after).toBe(7.5);
  });

  it("records DEFAULT_TAX_RATE when tax rate is not provided", () => {
    const result = normalizeProfileWithReport({
      monthlyIncomeNet: 5_100_000,
      monthlyEssentialExpenses: 1_900_000,
      monthlyDiscretionaryExpenses: 900_000,
      liquidAssets: 4_000_000,
      investmentAssets: 8_000_000,
      debts: [],
      goals: [],
    }, "balanced");

    const taxDefault = result.report.defaultsApplied.find((item) => item.code === "DEFAULT_TAX_RATE");
    expect(taxDefault).toBeDefined();
    expect(taxDefault?.path).toBe("/assumptions/taxRatePct");
    expect(taxDefault?.value).toBe(15.4);
  });

  it("throws validation error for negative essential expense instead of silently fixing", () => {
    expect(() =>
      normalizeProfileWithReport({
        monthlyIncomeNet: 4_000_000,
        monthlyEssentialExpenses: -10,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 1_000_000,
        investmentAssets: 2_000_000,
        debts: [],
        goals: [],
      }, "balanced"),
    ).toThrow();
  });
});
