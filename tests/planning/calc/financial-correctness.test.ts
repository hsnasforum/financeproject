import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  amortizingMonthlyPayment,
  buildAmortizationSchedule,
  calcDeposit,
  calcSaving,
  computeDsrPct,
  computeEmergencyFundMonths,
  computeMonthlySurplusKrw,
  estimateDepositInterest,
  estimateSavingInterest,
  roundKrw,
  roundPercent,
  simulateAmortizingPayoff,
} from "../../../src/lib/planning/calc";

type AmortizationFixture = {
  input: {
    principalKrw: number;
    aprPct: number;
    months: number;
    extraPaymentKrw: number;
  };
  expected: {
    monthlyPaymentRaw: number;
    payoffMonths: number;
    totalInterestKrw: number;
    monthlyPaymentKrw: number;
    negativeAmortizationRisk: boolean;
    firstRow: Record<string, unknown>;
    lastRow: Record<string, unknown>;
  };
};

type DepositFixture = {
  input: {
    principalKrw: number;
    termMonths: number;
    annualRatePct: number;
    taxRatePct: number;
  };
  expected: {
    grossInterestKrw: number;
    taxKrw: number;
    netInterestKrw: number;
    maturityAmountKrw: number;
  };
};

type SavingFixture = {
  input: {
    monthlyPaymentKrw: number;
    termMonths: number;
    annualRatePct: number;
    taxRatePct: number;
  };
  expected: {
    principalKrw: number;
    grossInterestKrw: number;
    taxKrw: number;
    netInterestKrw: number;
    maturityAmountKrw: number;
  };
};

type SummaryMetricsFixture = {
  input: {
    monthlyIncomeKrw: number;
    monthlyExpensesKrw: number;
    monthlyDebtPaymentKrw: number;
    emergencyFundKrw: number;
  };
  rounding: {
    dsrPctDigits: number;
    emergencyMonthsDigits: number;
  };
  expected: {
    monthlySurplusKrw: number;
    dsrPct: number;
    emergencyFundMonths: number;
  };
};

function readFixture<T>(name: string): T {
  const filePath = path.join(process.cwd(), "tests/fixtures/planning-v2/calc", name);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

describe("planning calc SSOT financial correctness", () => {
  it("matches amortization fixture values and rounded schedule endpoints", () => {
    const fixture = readFixture<AmortizationFixture>("amortization-fixed-12pct-12m.json");
    const { input, expected } = fixture;

    const paymentRaw = amortizingMonthlyPayment(input.principalKrw, input.aprPct, input.months);
    const payoff = simulateAmortizingPayoff(input.principalKrw, input.aprPct, input.months, input.extraPaymentKrw);
    const schedule = buildAmortizationSchedule(input.principalKrw, input.aprPct, input.months, input.extraPaymentKrw);

    expect(paymentRaw).toBeCloseTo(expected.monthlyPaymentRaw, 10);
    expect(payoff).toEqual({
      payoffMonths: expected.payoffMonths,
      totalInterestKrw: expected.totalInterestKrw,
      monthlyPaymentKrw: expected.monthlyPaymentKrw,
      negativeAmortizationRisk: expected.negativeAmortizationRisk,
    });
    expect(schedule[0]).toEqual(expected.firstRow);
    expect(schedule[schedule.length - 1]).toEqual(expected.lastRow);
  });

  it("is deterministic across repeated amortization executions", () => {
    const base = buildAmortizationSchedule(50_000_000, 5.4, 180, 50_000);
    const baseline = JSON.stringify(base);

    for (let i = 0; i < 30; i += 1) {
      const candidate = buildAmortizationSchedule(50_000_000, 5.4, 180, 50_000);
      expect(JSON.stringify(candidate)).toBe(baseline);
    }
  });

  it("matches deposit fixture totals and finlife caller output", () => {
    const fixture = readFixture<DepositFixture>("deposit-simple-tax.json");
    const { input, expected } = fixture;

    const ssot = estimateDepositInterest(
      input.principalKrw,
      input.termMonths,
      input.annualRatePct,
      { taxRatePct: input.taxRatePct, model: "simple_interest" },
    );
    const caller = calcDeposit({
      principalWon: input.principalKrw,
      months: input.termMonths,
      annualRatePct: input.annualRatePct,
      taxRatePct: input.taxRatePct,
      interestType: "simple",
    });

    expect(ssot.estimate).toEqual(expected);
    expect(caller).toEqual({
      principalWon: input.principalKrw,
      grossInterestWon: expected.grossInterestKrw,
      taxWon: expected.taxKrw,
      netInterestWon: expected.netInterestKrw,
      maturityWon: expected.maturityAmountKrw,
    });
  });

  it("matches saving fixture totals and finlife caller output", () => {
    const fixture = readFixture<SavingFixture>("saving-simple-tax.json");
    const { input, expected } = fixture;

    const ssot = estimateSavingInterest(
      input.monthlyPaymentKrw,
      input.termMonths,
      input.annualRatePct,
      { taxRatePct: input.taxRatePct, model: "simple_interest" },
    );
    const caller = calcSaving({
      monthlyPaymentWon: input.monthlyPaymentKrw,
      months: input.termMonths,
      annualRatePct: input.annualRatePct,
      taxRatePct: input.taxRatePct,
      interestType: "simple",
    });

    expect(ssot.assumptionsUsed.principalKrw).toBe(expected.principalKrw);
    expect(ssot.estimate).toEqual({
      grossInterestKrw: expected.grossInterestKrw,
      taxKrw: expected.taxKrw,
      netInterestKrw: expected.netInterestKrw,
      maturityAmountKrw: expected.maturityAmountKrw,
    });
    expect(caller).toEqual({
      principalWon: expected.principalKrw,
      grossInterestWon: expected.grossInterestKrw,
      taxWon: expected.taxKrw,
      netInterestWon: expected.netInterestKrw,
      maturityWon: expected.maturityAmountKrw,
    });
  });

  it("applies rounding policy consistently", () => {
    expect(roundKrw(1234.4)).toBe(1234);
    expect(roundKrw(1234.5)).toBe(1235);
    expect(roundPercent(4.87654)).toBe(4.8765);
  });

  it("matches summary metrics fixture values with centralized rounding rules", () => {
    const fixture = readFixture<SummaryMetricsFixture>("summary-metrics.json");
    const { input, rounding, expected } = fixture;
    expect(
      computeMonthlySurplusKrw(
        input.monthlyIncomeKrw,
        input.monthlyExpensesKrw,
        input.monthlyDebtPaymentKrw,
      ),
    ).toBe(expected.monthlySurplusKrw);
    expect(
      computeDsrPct(input.monthlyDebtPaymentKrw, input.monthlyIncomeKrw, rounding.dsrPctDigits),
    ).toBe(expected.dsrPct);
    expect(
      computeEmergencyFundMonths(
        input.emergencyFundKrw,
        input.monthlyExpensesKrw,
        rounding.emergencyMonthsDigits,
      ),
    ).toBe(expected.emergencyFundMonths);
  });
});
