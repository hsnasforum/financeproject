import { WARNING_SEVERITY_BY_CODE, type WarningSeverity } from "./warningsAggregate";

export type WarningV2 = {
  reasonCode?: unknown;
  code?: unknown;
  severity?: unknown;
  message?: unknown;
  month?: unknown;
  meta?: unknown;
  data?: unknown;
};

export type AggregatedWarning = {
  code: string;
  severity: WarningSeverity;
  count: number;
  firstMonth?: number;
  lastMonth?: number;
  sampleMessage: string;
};

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asMonthIndex(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

function asMonth1Based(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return undefined;
  return Math.trunc(value) - 1;
}

function warningMonthIndex(warning: WarningV2): number | undefined {
  const meta = asRecord(warning.meta);
  const data = asRecord(warning.data);
  return asMonthIndex(meta.monthIndex)
    ?? asMonth1Based(meta.month)
    ?? asMonthIndex(data.monthIndex)
    ?? asMonth1Based(data.month)
    ?? asMonth1Based(warning.month);
}

function resolveSeverity(code: string, severityRaw: unknown): WarningSeverity {
  const normalizedSeverity = asString(severityRaw).toLowerCase();
  if (normalizedSeverity === "critical" || normalizedSeverity === "warn" || normalizedSeverity === "info") {
    return normalizedSeverity;
  }
  const mapped = WARNING_SEVERITY_BY_CODE[code as keyof typeof WARNING_SEVERITY_BY_CODE];
  return mapped ?? "info";
}

function resolveWarningCode(warning: WarningV2): string {
  const code = asString(warning.reasonCode) || asString(warning.code);
  return code || "UNKNOWN";
}

function resolveMessage(warning: WarningV2, code: string): string {
  return asString(warning.message) || `${code} 경고가 감지되었습니다.`;
}

export function aggregateWarnings(warnings: WarningV2[]): AggregatedWarning[] {
  const grouped = new Map<string, AggregatedWarning>();

  for (const warning of warnings) {
    const code = resolveWarningCode(warning);
    const severity = resolveSeverity(code, warning.severity);
    const key = `${code}:${severity}`;
    const monthIndex = warningMonthIndex(warning);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        code,
        severity,
        count: 1,
        sampleMessage: resolveMessage(warning, code),
        ...(typeof monthIndex === "number"
          ? {
              firstMonth: monthIndex,
              lastMonth: monthIndex,
            }
          : {}),
      });
      continue;
    }

    existing.count += 1;
    if (typeof monthIndex === "number") {
      existing.firstMonth = typeof existing.firstMonth === "number"
        ? Math.min(existing.firstMonth, monthIndex)
        : monthIndex;
      existing.lastMonth = typeof existing.lastMonth === "number"
        ? Math.max(existing.lastMonth, monthIndex)
        : monthIndex;
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (b.count !== a.count) return b.count - a.count;
    return a.code.localeCompare(b.code);
  });
}
