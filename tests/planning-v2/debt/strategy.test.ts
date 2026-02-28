import { describe, expect, it } from "vitest";
import { computeDebtStrategy } from "../../../src/lib/planning/v2/debt/strategy";

describe("planning v2 debt strategy", () => {
  it("summarizes amortizing debt with reasonable monthly payment and total interest", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "loan-1",
          name: "Loan 1",
          type: "amortizing",
          principalKrw: 10_000_000,
          aprPct: 6,
          remainingMonths: 36,
          minimumPaymentKrw: 304_000,
        },
      ],
      monthlyIncomeKrw: 4_000_000,
    });

    const summary = result.summaries[0];
    expect(summary).toBeDefined();
    expect(summary.monthlyPaymentKrw).toBeGreaterThan(300_000);
    expect(summary.monthlyPaymentKrw).toBeLessThan(310_000);
    expect(summary.totalInterestRemainingKrw).toBeGreaterThan(900_000);
    expect(summary.totalInterestRemainingKrw).toBeLessThan(1_100_000);
  });

  it("reduces payoff months and interest when extra payment is applied", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "loan-1",
          name: "Loan 1",
          type: "amortizing",
          principalKrw: 30_000_000,
          aprPct: 7.5,
          remainingMonths: 120,
          minimumPaymentKrw: 356_000,
        },
      ],
      monthlyIncomeKrw: 5_000_000,
      options: {
        extraPaymentKrw: 200_000,
      },
    });

    const row = result.whatIf.extraPayments[0];
    expect(row).toBeDefined();
    expect(row.payoffMonthsReduced).toBeGreaterThan(0);
    expect(row.interestSavingsKrw).toBeGreaterThan(0);
  });

  it("produces positive refinance savings and break-even when APR drops and fee is modest", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "loan-1",
          name: "Loan 1",
          type: "amortizing",
          principalKrw: 20_000_000,
          aprPct: 8.2,
          remainingMonths: 84,
          minimumPaymentKrw: 315_000,
        },
      ],
      monthlyIncomeKrw: 4_500_000,
      offers: [
        {
          liabilityId: "loan-1",
          newAprPct: 5.6,
          feeKrw: 120_000,
          title: "Offer A",
        },
      ],
    });

    const refi = result.refinance?.[0];
    expect(refi).toBeDefined();
    expect((refi?.interestSavingsKrw ?? 0)).toBeGreaterThan(0);
    expect(refi?.breakEvenMonths).toBeDefined();
  });

  it("calculates DSR from total monthly payment and monthly income", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "loan-1",
          name: "Loan 1",
          type: "amortizing",
          principalKrw: 10_000_000,
          aprPct: 6,
          remainingMonths: 36,
          minimumPaymentKrw: 304_000,
        },
      ],
      monthlyIncomeKrw: 2_000_000,
    });

    const expected = result.meta.totalMonthlyPaymentKrw / 2_000_000;
    expect(result.meta.debtServiceRatio).toBeCloseTo(expected, 4);
  });

  it("emits NEGATIVE_AMORTIZATION_RISK when minimum payment is below first-month interest", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "risk-loan",
          name: "Risk Loan",
          type: "amortizing",
          principalKrw: 10_000_000,
          aprPct: 24,
          remainingMonths: 120,
          minimumPaymentKrw: 100_000,
        },
      ],
      monthlyIncomeKrw: 1_500_000,
    });

    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain("NEGATIVE_AMORTIZATION_RISK");
  });

  it("includes interest-only to amortizing what-if row", () => {
    const result = computeDebtStrategy({
      liabilities: [
        {
          id: "io-loan",
          name: "IO Loan",
          type: "interestOnly",
          principalKrw: 50_000_000,
          aprPct: 5.5,
          remainingMonths: 60,
          minimumPaymentKrw: 230_000,
        },
      ],
      monthlyIncomeKrw: 4_000_000,
    });

    const conversion = result.whatIf.termReductions.find((row) => row.liabilityId === "io-loan");
    expect(conversion).toBeDefined();
    expect(conversion?.newMonthlyPaymentKrw ?? 0).toBeGreaterThan(0);
    expect((conversion?.notes ?? []).join(" ")).toContain("interest-only");
  });
});
