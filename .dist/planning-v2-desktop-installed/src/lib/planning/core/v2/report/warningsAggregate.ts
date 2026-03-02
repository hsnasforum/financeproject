import { type ReasonCode, type SimulationWarningV2 } from "../types";

export type WarningSeverity = "info" | "warn" | "critical";

export type AggregatedWarning = {
  code: ReasonCode;
  severity: WarningSeverity;
  count: number;
  months?: { first?: number; last?: number };
  sampleMessage: string;
};

export const WARNING_SEVERITY_BY_CODE: Record<ReasonCode, WarningSeverity> = {
  NEGATIVE_CASHFLOW: "critical",
  HIGH_DEBT_RATIO: "warn",
  DEBT_NEGATIVE_AMORTIZATION: "warn",
  DEBT_RATE_ASSUMED: "warn",
  CONTRIBUTION_SKIPPED: "warn",
  PHASES_OVERLAP: "info",
  EMERGENCY_FUND_DRAWDOWN: "warn",
  INSOLVENT: "critical",
  GOAL_MISSED: "warn",
  GOAL_REACHED: "info",
  CASHFLOW_SCHEDULE: "info",
  INFLATION_DRAG: "info",
  RETURN_BOOST: "info",
  STEADY_PROGRESS: "info",
};

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asMonthIndex(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function asMonth1Based(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.trunc(value - 1)
    : undefined;
}

function warningMonthIndex(warning: SimulationWarningV2): number | undefined {
  const metaMonthIndex = asMonthIndex(warning.meta?.monthIndex);
  if (typeof metaMonthIndex === "number") return metaMonthIndex;

  const metaMonth = asMonth1Based(warning.meta?.month);
  if (typeof metaMonth === "number") return metaMonth;

  const legacyData = asRecord((warning as SimulationWarningV2 & { data?: unknown }).data);
  const dataMonthIndex = asMonthIndex(legacyData.monthIndex);
  if (typeof dataMonthIndex === "number") return dataMonthIndex;

  const dataMonth = asMonth1Based(legacyData.month);
  if (typeof dataMonth === "number") return dataMonth;

  const month = asMonth1Based(warning.month);
  if (typeof month === "number") return month;

  return undefined;
}

export function aggregateWarnings(warnings: SimulationWarningV2[]): AggregatedWarning[] {
  const grouped = new Map<string, AggregatedWarning>();

  for (const warning of warnings) {
    const code = warning.reasonCode;
    const severity = WARNING_SEVERITY_BY_CODE[code];
    const key = `${code}:${severity}`;
    const monthIndex = warningMonthIndex(warning);

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        code,
        severity,
        count: 1,
        sampleMessage: warning.message,
        ...(typeof monthIndex === "number"
          ? {
              months: { first: monthIndex, last: monthIndex },
            }
          : {}),
      });
      continue;
    }

    existing.count += 1;
    if (typeof monthIndex === "number") {
      existing.months = {
        first: typeof existing.months?.first === "number" ? Math.min(existing.months.first, monthIndex) : monthIndex,
        last: typeof existing.months?.last === "number" ? Math.max(existing.months.last, monthIndex) : monthIndex,
      };
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (b.count !== a.count) return b.count - a.count;
    return a.code.localeCompare(b.code);
  });
}
