import { type DebtSummary, type LiabilityV2 } from "./types";
import {
  amortizingMonthlyPayment as ssotAmortizingMonthlyPayment,
  monthlyRateFromAprPct as ssotMonthlyRateFromAprPct,
  normalizeAprPct as ssotNormalizeAprPct,
  simulateAmortizingPayoff as ssotSimulateAmortizingPayoff,
} from "../../../calc/amortization";
import { roundKrw } from "../../../calc/roundingPolicy";

export function normalizeAprPct(aprInput: number): number {
  return ssotNormalizeAprPct(aprInput);
}

export function monthlyRateFromAprPct(aprPct: number): number {
  return ssotMonthlyRateFromAprPct(aprPct);
}

export function amortizingMonthlyPayment(principalKrw: number, aprPct: number, months: number): number {
  return ssotAmortizingMonthlyPayment(principalKrw, aprPct, months);
}

export function simulateAmortizingPayoff(
  principalKrw: number,
  aprPct: number,
  months: number,
  extraPaymentKrw = 0,
): {
  payoffMonths: number;
  totalInterestKrw: number;
  monthlyPaymentKrw: number;
  negativeAmortizationRisk: boolean;
} {
  return ssotSimulateAmortizingPayoff(principalKrw, aprPct, months, extraPaymentKrw);
}

export function summarizeDebt(liability: LiabilityV2, nowMonthIndex = 0): DebtSummary {
  const principalKrw = Math.max(0, liability.principalKrw);
  const remainingMonths = Math.max(1, Math.trunc(liability.remainingMonths));
  const aprPct = normalizeAprPct(liability.aprPct);
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const monthlyInterestKrw = roundKrw(principalKrw * monthlyRate);

  if (liability.type === "interestOnly") {
    return {
      liabilityId: liability.id,
      name: liability.name,
      type: "interestOnly",
      principalKrw: roundKrw(principalKrw),
      aprPct,
      remainingMonths,
      monthlyPaymentKrw: monthlyInterestKrw,
      monthlyInterestKrw,
      totalInterestRemainingKrw: roundKrw(monthlyInterestKrw * remainingMonths),
      payoffMonthIndex: nowMonthIndex + remainingMonths,
    };
  }

  const payoff = simulateAmortizingPayoff(principalKrw, aprPct, remainingMonths, 0);
  return {
    liabilityId: liability.id,
    name: liability.name,
    type: "amortizing",
    principalKrw: roundKrw(principalKrw),
    aprPct,
    remainingMonths,
    monthlyPaymentKrw: payoff.monthlyPaymentKrw,
    monthlyInterestKrw,
    totalInterestRemainingKrw: payoff.totalInterestKrw,
    payoffMonthIndex: nowMonthIndex + payoff.payoffMonths,
  };
}

export function computeDebtServiceRatio(summaries: DebtSummary[], monthlyIncomeKrw: number): number {
  const totalMonthlyPayment = summaries.reduce((sum, summary) => sum + summary.monthlyPaymentKrw, 0);
  if (monthlyIncomeKrw <= 0) return totalMonthlyPayment > 0 ? 1 : 0;
  return totalMonthlyPayment / monthlyIncomeKrw;
}
