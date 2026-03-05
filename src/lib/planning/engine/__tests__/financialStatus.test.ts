import { describe, expect, it } from "vitest";
import { determineFinancialStatus } from "../financialStatus";

describe("determineFinancialStatus", () => {
  it("returns DEFICIT when monthly cashflow is negative", () => {
    const result = determineFinancialStatus({
      monthlyIncome: 2_000_000,
      monthlyExpense: 2_500_000,
      liquidAssets: 0,
      debtBalance: 0,
    });

    expect(result.stage).toBe("DEFICIT");
  });

  it("returns DEBT when debt exists and cashflow is not negative", () => {
    const result = determineFinancialStatus({
      monthlyIncome: 3_000_000,
      monthlyExpense: 2_000_000,
      liquidAssets: 1_000_000,
      debtBalance: 5_000_000,
    });

    expect(result.stage).toBe("DEBT");
  });

  it("returns EMERGENCY when emergency fund is insufficient", () => {
    const result = determineFinancialStatus({
      monthlyIncome: 3_000_000,
      monthlyExpense: 2_000_000,
      liquidAssets: 1_000_000,
      debtBalance: 0,
      emergencyFundMonths: 6,
    });

    expect(result.stage).toBe("EMERGENCY");
  });

  it("returns INVEST when no debt and emergency fund is filled", () => {
    const result = determineFinancialStatus({
      monthlyIncome: 3_000_000,
      monthlyExpense: 2_000_000,
      liquidAssets: 12_000_000,
      debtBalance: 0,
      emergencyFundMonths: 6,
    });

    expect(result.stage).toBe("INVEST");
  });
});
