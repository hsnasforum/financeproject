import { roundToDigits } from "../../calc/roundingPolicy";
import {
  type ExplainabilityDriverDelta,
  type ExplainabilityEntryV2,
  type ExplainabilityMetaValue,
  type ReasonCode,
  type SimulationWarningV2,
  type TimelineRowV2,
} from "./types";
import { REASON_CODE_MESSAGES_KO } from "./warningsCatalog.ko";

export const REASON_CODE_MESSAGES: Record<ReasonCode, string> = REASON_CODE_MESSAGES_KO;

function round2(value: number): number {
  return roundToDigits(value, 2);
}

function mergeMeta(
  meta: Record<string, ExplainabilityMetaValue> | undefined,
): Record<string, ExplainabilityMetaValue> | undefined {
  if (!meta) return undefined;
  const next: Record<string, ExplainabilityMetaValue> = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (typeof value === "number") {
      next[key] = round2(value);
      return;
    }
    next[key] = value;
  });
  return next;
}

export function reasonMessage(reasonCode: ReasonCode): string {
  return REASON_CODE_MESSAGES[reasonCode];
}

export function buildWarning(
  reasonCode: ReasonCode,
  input?: {
    month?: number;
    message?: string;
    meta?: Record<string, ExplainabilityMetaValue>;
  },
): SimulationWarningV2 {
  return {
    reasonCode,
    month: input?.month,
    message: input?.message ?? reasonMessage(reasonCode),
    meta: mergeMeta(input?.meta),
  };
}

export function buildExplainabilityEntry(
  reasonCode: ReasonCode,
  month: number,
  why: ExplainabilityDriverDelta[],
  meta?: Record<string, ExplainabilityMetaValue>,
  message?: string,
): ExplainabilityEntryV2 {
  return {
    reasonCode,
    month,
    message: message ?? reasonMessage(reasonCode),
    why: why.map((entry) => ({
      ...entry,
      amount: round2(entry.amount),
    })),
    meta: mergeMeta(meta),
  };
}

export function classifyMonthlyReason(row: TimelineRowV2): ReasonCode {
  if (row.operatingCashflow < 0) return "NEGATIVE_CASHFLOW";
  if (row.debtInterest > 0 && row.debtInterest > row.investmentReturn) return "HIGH_DEBT_RATIO";
  if (row.expenses > row.income && row.expenses - row.income > Math.abs(row.investmentReturn)) return "INFLATION_DRAG";
  if (row.investmentReturn > Math.max(0, row.debtInterest)) return "RETURN_BOOST";
  return "STEADY_PROGRESS";
}

export function explainFromTimelineRow(row: TimelineRowV2): ExplainabilityEntryV2 {
  const reasonCode = classifyMonthlyReason(row);
  return buildExplainabilityEntry(reasonCode, row.month, [
    { driver: "income", amount: row.income },
    { driver: "expenses", amount: -row.expenses },
    { driver: "debtInterest", amount: -row.debtInterest },
    { driver: "investmentReturn", amount: row.investmentReturn },
    { driver: "debtPrincipalTransfer", amount: 0, note: "Principal repayment shifts value from cash to lower liabilities." },
    { driver: "goalFundingTransfer", amount: 0, note: "Goal contribution is a relabeling of assets, not a net worth change." },
    { driver: "netCashflow", amount: row.operatingCashflow },
  ], {
    netWorth: row.netWorth,
    netWorthDelta: row.netWorthDelta,
    debtServiceRatio: row.debtServiceRatio,
  });
}
