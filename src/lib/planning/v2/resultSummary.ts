import {
  buildDsrPctEvidence,
  buildEmergencyMonthsEvidence,
  buildMonthlySurplusEvidence,
  computeDsrPct,
  computeEmergencyFundMonths,
  computeMonthlySurplusKrw,
  type CalcEvidence,
} from "../calc";
import { type ResultDtoV1 } from "./resultDto";

export type ResultSummaryEvidence = {
  monthlySurplusKrw?: CalcEvidence;
  dsrPct?: CalcEvidence;
  emergencyFundMonths?: CalcEvidence;
};

export type ResultSummaryMetrics = {
  monthlySurplusKrw?: number;
  emergencyFundMonths?: number;
  debtTotalKrw?: number;
  totalMonthlyDebtPaymentKrw?: number;
  dsrPct?: number;
  evidence: ResultSummaryEvidence;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildResultSummaryMetrics(
  dto: ResultDtoV1,
  options?: {
    debtMonthlyPaymentKrw?: number;
    fallbackStart?: {
      monthlyIncomeKrw?: number;
      monthlyExpensesKrw?: number;
      monthlyDebtPaymentKrw?: number;
    };
  },
): ResultSummaryMetrics {
  const start = dto.timeline.points.find((point) => point.label === "start") ?? dto.timeline.points[0];
  const startIncomeKrw = asNumber(start?.incomeKrw);
  const startExpensesKrw = asNumber(start?.expensesKrw);
  const startDebtPaymentKrw = asNumber(start?.debtPaymentKrw);
  const fallbackIncomeKrw = asNumber(options?.fallbackStart?.monthlyIncomeKrw);
  const fallbackExpensesKrw = asNumber(options?.fallbackStart?.monthlyExpensesKrw);
  const fallbackDebtPaymentKrw = asNumber(options?.fallbackStart?.monthlyDebtPaymentKrw);

  const monthlyIncomeKrw = typeof startIncomeKrw === "number" && (startIncomeKrw > 0 || typeof fallbackIncomeKrw !== "number")
    ? startIncomeKrw
    : fallbackIncomeKrw;
  const monthlyExpensesKrw = typeof startExpensesKrw === "number" && (startExpensesKrw > 0 || typeof fallbackExpensesKrw !== "number")
    ? startExpensesKrw
    : fallbackExpensesKrw;
  const timelineDebtPaymentKrw = typeof startDebtPaymentKrw === "number" && (startDebtPaymentKrw > 0 || typeof fallbackDebtPaymentKrw !== "number")
    ? startDebtPaymentKrw
    : fallbackDebtPaymentKrw ?? 0;
  const totalMonthlyDebtPaymentOption = asNumber(options?.debtMonthlyPaymentKrw);
  const totalMonthlyDebtPaymentKrw = typeof totalMonthlyDebtPaymentOption === "number" && totalMonthlyDebtPaymentOption > 0
    ? totalMonthlyDebtPaymentOption
    : timelineDebtPaymentKrw;

  // Monthly surplus is the engine's recurring operating cashflow (income - expenses - required minimum
  // debt payment). The start-month debtPayment may include a one-off extra repayment from existing cash,
  // so it must not be subtracted as a monthly cost. Runs without the field omit the metric (even when
  // start income is zero or missing) instead of estimating it from totals, zero, the current profile,
  // or fallbackStart. A finite zero from the engine is kept.
  const startOperatingCashflowKrw = asNumber(start?.operatingCashflowKrw);
  const monthlySurplusKrw = startOperatingCashflowKrw;
  // Required minimum payment implied by the same start row (income - expenses - operating cashflow),
  // so the evidence inputs reproduce the displayed surplus.
  const regularDebtPaymentKrw = typeof startOperatingCashflowKrw === "number"
    && typeof startIncomeKrw === "number"
    && typeof startExpensesKrw === "number"
    ? computeMonthlySurplusKrw(startIncomeKrw, startExpensesKrw, startOperatingCashflowKrw)
    : undefined;

  const emergencyGoal = dto.goals.find((goal) => goal.type === "emergencyFund");
  const emergencyFundMonths = typeof emergencyGoal?.currentKrw === "number"
    && typeof monthlyExpensesKrw === "number"
    && monthlyExpensesKrw > 0
    ? computeEmergencyFundMonths(emergencyGoal.currentKrw, monthlyExpensesKrw)
    : undefined;

  const debtRows = Array.isArray(dto.debt?.summaries) ? dto.debt.summaries.map((entry) => asRecord(entry)) : [];
  const debtPrincipalRows = debtRows
    .map((row) => asNumber(row.principalKrw))
    .filter((value): value is number => typeof value === "number");
  const debtTotalKrw = debtPrincipalRows.length > 0
    ? debtPrincipalRows.reduce((sum, value) => sum + value, 0)
    : asNumber(start?.totalDebtKrw);

  const dsrPct = typeof monthlyIncomeKrw === "number" && typeof totalMonthlyDebtPaymentKrw === "number"
    ? computeDsrPct(totalMonthlyDebtPaymentKrw, monthlyIncomeKrw)
    : undefined;

  const evidence: ResultSummaryEvidence = {
    ...(typeof regularDebtPaymentKrw === "number"
      && typeof startIncomeKrw === "number"
      && typeof startExpensesKrw === "number"
      ? {
        monthlySurplusKrw: buildMonthlySurplusEvidence({
          monthlyIncomeKrw: startIncomeKrw,
          monthlyExpensesKrw: startExpensesKrw,
          monthlyDebtPaymentKrw: regularDebtPaymentKrw,
        }),
      }
      : {}),
    ...(typeof monthlyIncomeKrw === "number"
      ? {
        dsrPct: buildDsrPctEvidence({
          monthlyDebtPaymentKrw: totalMonthlyDebtPaymentKrw,
          monthlyIncomeKrw,
        }),
      }
      : {}),
    ...(typeof emergencyGoal?.currentKrw === "number"
      && typeof monthlyExpensesKrw === "number"
      && monthlyExpensesKrw > 0
      ? {
        emergencyFundMonths: buildEmergencyMonthsEvidence({
          emergencyFundKrw: emergencyGoal.currentKrw,
          monthlyExpensesKrw,
        }),
      }
      : {}),
  };

  return {
    ...(typeof monthlySurplusKrw === "number" ? { monthlySurplusKrw } : {}),
    ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
    ...(typeof debtTotalKrw === "number" ? { debtTotalKrw } : {}),
    ...(typeof totalMonthlyDebtPaymentKrw === "number" ? { totalMonthlyDebtPaymentKrw } : {}),
    ...(typeof dsrPct === "number" ? { dsrPct } : {}),
    evidence,
  };
}
