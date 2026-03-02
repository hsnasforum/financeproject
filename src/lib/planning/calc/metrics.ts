import { roundMonths, roundToDigits } from "./roundingPolicy";

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeMonthlySurplusKrw(
  monthlyIncomeKrw: number,
  monthlyExpensesKrw: number,
  monthlyDebtPaymentKrw = 0,
): number {
  const income = toFiniteNumber(monthlyIncomeKrw) ?? 0;
  const expenses = toFiniteNumber(monthlyExpensesKrw) ?? 0;
  const debtPayment = toFiniteNumber(monthlyDebtPaymentKrw) ?? 0;
  return income - expenses - debtPayment;
}

export function computeDsrPct(
  monthlyDebtPaymentKrw: number,
  monthlyIncomeKrw: number,
  digits = 4,
): number {
  const debtPayment = toFiniteNumber(monthlyDebtPaymentKrw) ?? 0;
  const income = toFiniteNumber(monthlyIncomeKrw) ?? 0;
  if (income <= 0) return debtPayment > 0 ? 100 : 0;
  return roundToDigits((debtPayment / income) * 100, digits);
}

export function computeEmergencyFundMonths(
  emergencyFundKrw: number,
  monthlyExpensesKrw: number,
  digits = 1,
): number | undefined {
  const emergencyFund = toFiniteNumber(emergencyFundKrw);
  const monthlyExpenses = toFiniteNumber(monthlyExpensesKrw);
  if (emergencyFund === null || monthlyExpenses === null || monthlyExpenses <= 0) return undefined;
  return roundMonths(emergencyFund / monthlyExpenses, digits);
}

