import { resolveWarningCatalog, warningFallbackMessage } from "@/lib/planning/catalog/warningCatalog";
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
  return warningFallbackMessage(code || "UNKNOWN");
}

function resolveWarningMessage(code: string): string {
  if (!code) return unknownWarningMessage(code);
  const catalog = resolveWarningCatalog(code);
  return catalog.plainDescription || unknownWarningMessage(code);
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

  const collect = (codes: string[]) => {
    for (const code of codes) {
      const normalizedCode = code.trim() || "UNKNOWN";
      const message = resolveWarningMessage(normalizedCode);
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

  collect(simulateWarningCodes(run));
  collect(healthWarningCodes(run));
  collect(debtWarningCodes(run));

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.code.localeCompare(right.code);
  });
}
