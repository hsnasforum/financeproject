import { WARNING_SEVERITY_BY_CODE, type WarningSeverity } from "../../../../lib/planning/v2/report/warningsAggregate";
import { resolveWarningCatalog, warningFallbackMessage } from "./warningCatalog";

type WarningLike = {
  reasonCode?: unknown;
  code?: unknown;
  severity?: unknown;
  message?: unknown;
  month?: unknown;
  meta?: unknown;
  data?: unknown;
};

export type DashboardWarningAggRow = {
  code: string;
  title: string;
  plainDescription: string;
  suggestedActionId?: string;
  severity: WarningSeverity;
  severityMax: WarningSeverity;
  count: number;
  periodMinMax: string;
  subjectKey?: string;
  subjectLabel?: string;
  sampleMessage: string;
  firstMonth?: number;
  lastMonth?: number;
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asMonthIndex(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

function asMonth1Based(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return undefined;
  return Math.trunc(value) - 1;
}

function warningMonthIndex(warning: WarningLike): number | undefined {
  const meta = asRecord(warning.meta);
  const data = asRecord(warning.data);
  return asMonthIndex(meta.monthIndex)
    ?? asMonth1Based(meta.month)
    ?? asMonthIndex(data.monthIndex)
    ?? asMonth1Based(data.month)
    ?? asMonth1Based(warning.month);
}

function warningCode(warning: WarningLike): string {
  const code = asString(warning.reasonCode) || asString(warning.code);
  return code || "UNKNOWN";
}

function warningSeverity(code: string, warning: WarningLike): WarningSeverity {
  const raw = asString(warning.severity).toLowerCase();
  if (raw === "critical" || raw === "warn" || raw === "info") return raw;
  const mapped = WARNING_SEVERITY_BY_CODE[code as keyof typeof WARNING_SEVERITY_BY_CODE];
  return mapped ?? "info";
}

function warningMessage(code: string, warning: WarningLike): string {
  return asString(warning.message) || warningFallbackMessage(code);
}

function warningSubjectKey(warning: WarningLike): string {
  const meta = asRecord(warning.meta);
  const data = asRecord(warning.data);
  return asString(
    meta.subjectKey
      ?? meta.goalId
      ?? meta.liabilityId
      ?? data.subjectKey
      ?? data.goalId
      ?? data.liabilityId,
  );
}

function warningSubjectLabel(warning: WarningLike): string {
  const meta = asRecord(warning.meta);
  const data = asRecord(warning.data);
  return asString(
    meta.subjectLabel
      ?? meta.goalName
      ?? meta.liabilityName
      ?? data.subjectLabel
      ?? data.goalName
      ?? data.liabilityName,
  );
}

function formatPeriodMinMax(firstMonth?: number, lastMonth?: number): string {
  if (typeof firstMonth !== "number" && typeof lastMonth !== "number") return "-";
  if (typeof firstMonth === "number" && typeof lastMonth === "number") {
    if (firstMonth === lastMonth) return `M${firstMonth + 1}`;
    return `M${firstMonth + 1}~M${lastMonth + 1}`;
  }
  if (typeof firstMonth === "number") return `M${firstMonth + 1}`;
  return `M${(lastMonth ?? 0) + 1}`;
}

function maxSeverity(a: WarningSeverity, b: WarningSeverity): WarningSeverity {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b;
}

function normalizeWarnings(input: unknown): WarningLike[] {
  return asArray(input).map((entry) => {
    if (typeof entry === "string") {
      return {
        reasonCode: entry,
        message: warningFallbackMessage(entry),
      };
    }
    const row = asRecord(entry);
    return {
      reasonCode: row.reasonCode,
      code: row.code,
      severity: row.severity,
      message: row.message,
      month: row.month,
      meta: row.meta,
      data: row.data,
    };
  });
}

type MutableRow = Omit<DashboardWarningAggRow, "periodMinMax" | "title" | "plainDescription"> & {
  seenMonths: Set<number>;
};

export function aggregateWarningsByUniqueMonth(input: unknown): DashboardWarningAggRow[] {
  const warnings = normalizeWarnings(input);
  const grouped = new Map<string, MutableRow>();

  for (const warning of warnings) {
    const code = warningCode(warning);
    const severity = warningSeverity(code, warning);
    const subjectKey = warningSubjectKey(warning);
    const subjectLabel = warningSubjectLabel(warning);
    const key = `${code}:${subjectKey || "-"}`;
    const monthIndex = warningMonthIndex(warning);
    const existing = grouped.get(key);

    if (!existing) {
      const row: MutableRow = {
        code,
        severity,
        severityMax: severity,
        count: 0,
        sampleMessage: warningMessage(code, warning),
        ...(subjectKey ? { subjectKey } : {}),
        ...(subjectLabel ? { subjectLabel } : {}),
        seenMonths: new Set<number>(),
      };
      grouped.set(key, row);
      if (typeof monthIndex === "number") {
        row.seenMonths.add(monthIndex);
        row.count = 1;
        row.firstMonth = monthIndex;
        row.lastMonth = monthIndex;
      } else {
        row.count = 1;
      }
      continue;
    }

    existing.severityMax = maxSeverity(existing.severityMax, severity);
    existing.severity = existing.severityMax;
    if (!existing.sampleMessage) existing.sampleMessage = warningMessage(code, warning);

    if (typeof monthIndex === "number") {
      if (existing.seenMonths.has(monthIndex)) continue;
      existing.seenMonths.add(monthIndex);
      existing.count += 1;
      existing.firstMonth = typeof existing.firstMonth === "number"
        ? Math.min(existing.firstMonth, monthIndex)
        : monthIndex;
      existing.lastMonth = typeof existing.lastMonth === "number"
        ? Math.max(existing.lastMonth, monthIndex)
        : monthIndex;
      continue;
    }

    existing.count += 1;
  }

  return Array.from(grouped.values())
    .map(({ seenMonths, ...row }) => {
      void seenMonths;
      const catalog = resolveWarningCatalog(row.code);
      return {
        ...row,
        title: catalog.title,
        plainDescription: catalog.plainDescription,
        ...(catalog.suggestedActionId ? { suggestedActionId: catalog.suggestedActionId } : {}),
        periodMinMax: formatPeriodMinMax(row.firstMonth, row.lastMonth),
      };
    })
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severityMax] - SEVERITY_ORDER[b.severityMax];
      if (bySeverity !== 0) return bySeverity;
      if (b.count !== a.count) return b.count - a.count;
      return a.code.localeCompare(b.code);
    });
}
