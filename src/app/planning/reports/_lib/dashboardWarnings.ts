import {
  REASON_CODE_MESSAGES_KO,
  assumptionsHealthMessage,
  debtStrategyWarningMessage,
  type AssumptionsHealthWarningCode,
} from "../../../../lib/planning/core/v2/warningsCatalog.ko";
import { type PlanningRunRecord } from "../../../../lib/planning/store/types";

export type ReportDashboardWarningRow = {
  code: string;
  message: string;
  count: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unknownWarningMessage(code: string): string {
  return `알 수 없는 경고 (${code || "UNKNOWN"})`;
}

function isAssumptionsHealthWarningCode(value: string): value is AssumptionsHealthWarningCode {
  return value === "SNAPSHOT_MISSING"
    || value === "SNAPSHOT_STALE"
    || value === "SNAPSHOT_VERY_STALE"
    || value === "OPTIMISTIC_RETURN"
    || value === "OPTIMISTIC_RETURN_HIGH"
    || value === "RISK_ASSUMPTION_MISMATCH"
    || value === "RISK_ASSUMPTION_MISMATCH_LOW";
}

function resolveWarningMessage(code: string, source: "simulate" | "health" | "debt"): string {
  if (!code) return unknownWarningMessage(code);
  if (source === "debt") return debtStrategyWarningMessage(code);
  if (code in REASON_CODE_MESSAGES_KO) {
    return REASON_CODE_MESSAGES_KO[code as keyof typeof REASON_CODE_MESSAGES_KO];
  }
  if (source === "health" && isAssumptionsHealthWarningCode(code)) {
    return assumptionsHealthMessage(code);
  }
  return unknownWarningMessage(code);
}

function simulateWarningCodes(run: PlanningRunRecord): string[] {
  return asArray(run.outputs?.simulate?.warnings)
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      const row = asRecord(entry);
      return asString(row.reasonCode) || asString(row.code);
    })
    .filter((code) => code.length > 0);
}

function healthWarningCodes(run: PlanningRunRecord): string[] {
  return asArray(run.meta?.health?.warningsCodes)
    .map((entry) => asString(entry))
    .filter((code) => code.length > 0);
}

function debtWarningCodes(run: PlanningRunRecord): string[] {
  return asArray(run.outputs?.debtStrategy?.warnings)
    .map((entry) => asString(asRecord(entry).code))
    .filter((code) => code.length > 0);
}

export function aggregateReportWarningsFromRun(run: PlanningRunRecord | null): ReportDashboardWarningRow[] {
  if (!run) return [];
  const grouped = new Map<string, ReportDashboardWarningRow>();

  const collect = (codes: string[], source: "simulate" | "health" | "debt") => {
    for (const code of codes) {
      const normalizedCode = code.trim() || "UNKNOWN";
      const message = resolveWarningMessage(normalizedCode, source);
      const key = `${normalizedCode}:${message}`;
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      grouped.set(key, {
        code: normalizedCode,
        message,
        count: 1,
      });
    }
  };

  collect(simulateWarningCodes(run), "simulate");
  collect(healthWarningCodes(run), "health");
  collect(debtWarningCodes(run), "debt");

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.code.localeCompare(right.code);
  });
}

