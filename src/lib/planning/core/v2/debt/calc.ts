import { type DebtSummary, type LiabilityV2 } from "./types";

const EPSILON = 1e-9;

function roundMoney(value: number): number {
  return Math.round(value);
}

export function normalizeAprPct(aprInput: number): number {
  if (!Number.isFinite(aprInput)) return 0;
  if (Math.abs(aprInput) <= 1) return aprInput * 100;
  return aprInput;
}

export function monthlyRateFromAprPct(aprPct: number): number {
  const normalizedAprPct = normalizeAprPct(aprPct);
  return normalizedAprPct / 100 / 12;
}

export function amortizingMonthlyPayment(principalKrw: number, aprPct: number, months: number): number {
  const principal = Math.max(0, principalKrw);
  const n = Math.max(1, Math.trunc(months));
  const monthlyRate = monthlyRateFromAprPct(aprPct);

  if (monthlyRate <= 0) return principal / n;
  const growth = (1 + monthlyRate) ** n;
  return (principal * monthlyRate * growth) / (growth - 1);
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
  const principal = Math.max(0, principalKrw);
  const n = Math.max(1, Math.trunc(months));
  const extraPayment = Math.max(0, extraPaymentKrw);
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const monthlyPayment = amortizingMonthlyPayment(principal, aprPct, n);

  if (principal <= 0) {
    return {
      payoffMonths: 0,
      totalInterestKrw: 0,
      monthlyPaymentKrw: roundMoney(monthlyPayment),
      negativeAmortizationRisk: false,
    };
  }

  let remain = principal;
  let month = 0;
  let totalInterest = 0;
  let negativeAmortizationRisk = false;
  const maxMonths = n + 1_200;

  while (remain > EPSILON && month < maxMonths) {
    month += 1;
    const interest = remain * monthlyRate;
    const payment = monthlyPayment + extraPayment;
    if (payment <= interest + EPSILON) {
      negativeAmortizationRisk = true;
      break;
    }

    const principalPaid = Math.min(remain, payment - interest);
    remain -= principalPaid;
    totalInterest += interest;
  }

  if (remain > EPSILON && !negativeAmortizationRisk) {
    negativeAmortizationRisk = true;
  }

  return {
    payoffMonths: month,
    totalInterestKrw: roundMoney(totalInterest),
    monthlyPaymentKrw: roundMoney(monthlyPayment),
    negativeAmortizationRisk,
  };
}

export function summarizeDebt(liability: LiabilityV2, nowMonthIndex = 0): DebtSummary {
  const principalKrw = Math.max(0, liability.principalKrw);
  const remainingMonths = Math.max(1, Math.trunc(liability.remainingMonths));
  const aprPct = normalizeAprPct(liability.aprPct);
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const monthlyInterestKrw = roundMoney(principalKrw * monthlyRate);

  if (liability.type === "interestOnly") {
    return {
      liabilityId: liability.id,
      name: liability.name,
      type: "interestOnly",
      principalKrw: roundMoney(principalKrw),
      aprPct,
      remainingMonths,
      monthlyPaymentKrw: monthlyInterestKrw,
      monthlyInterestKrw,
      totalInterestRemainingKrw: roundMoney(monthlyInterestKrw * remainingMonths),
      payoffMonthIndex: nowMonthIndex + remainingMonths,
    };
  }

  const payoff = simulateAmortizingPayoff(principalKrw, aprPct, remainingMonths, 0);
  return {
    liabilityId: liability.id,
    name: liability.name,
    type: "amortizing",
    principalKrw: roundMoney(principalKrw),
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
