import { getPlanningFallbackUsageSnapshot } from "../../planning/engine";
import { summarizeLegacyRunBackfill } from "../../planning/store/runStore";
import {
  type OpsMetricEvent,
  type OpsMetricEventType,
  type OpsMetricsSummary,
  listOpsMetricEvents,
  summarizeOpsMetricEvents,
} from "../metricsLog";
import { loadOpsPolicy } from "../opsPolicy";
import {
  type MetricsEvent,
  type MetricsEventType,
  type MetricsSummary,
  readRecent,
  summarize,
} from "./metricsStore";

export type OpsMetricsSummaryRangeHours = 24 | 168;

export type OpsMetricsLogPage = {
  rows: OpsMetricEvent[];
  summary: OpsMetricsSummary;
  meta: {
    limit: number;
    type?: OpsMetricEventType;
    types: OpsMetricEventType[];
    thresholds: {
      failureRateWarnPct: number;
      latencyRegressionWarnMs: number;
      refreshFailureWarnCount: number;
    };
  };
};

export type OpsMetricsEventsPage = {
  rows: MetricsEvent[];
  meta: {
    limit: number;
    type?: MetricsEventType;
    types: MetricsEventType[];
  };
};

export type OpsMetricsSummaryPage = {
  data: {
    requested: MetricsSummary;
    last24h: MetricsSummary;
    last7d: MetricsSummary;
    planningFallbacks: {
      engineEnvelopeFallbackCount: number;
      reportContractFallbackCount: number;
      runEngineMigrationCount: number;
      lastEventAt?: string;
      sourceBreakdown?: Record<string, Record<string, number>>;
      recentEvents?: Array<Record<string, unknown>>;
    };
    legacyRunBackfill: Awaited<ReturnType<typeof summarizeLegacyRunBackfill>>;
  };
  range: "24h" | "7d";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toOpsMetricsSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseOpsMetricsLogType(value: unknown): OpsMetricEventType | undefined {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "SCHEDULED_TASK"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
  ) {
    return normalized;
  }
  return undefined;
}

export function parseOpsMetricsStoreType(value: unknown): MetricsEventType | undefined {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "RUN_PIPELINE"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
    || normalized === "SCHEDULED_TASK"
  ) {
    return normalized;
  }
  return undefined;
}

export function parseOpsMetricsSummaryRange(value: unknown): OpsMetricsSummaryRangeHours {
  return asString(value).toLowerCase() === "7d" ? 168 : 24;
}

export async function readOpsMetricsLogPage(input: {
  limit: number;
  type?: OpsMetricEventType;
}): Promise<OpsMetricsLogPage> {
  const [rows, sourceRows] = await Promise.all([
    listOpsMetricEvents({
      limit: input.limit,
      ...(input.type ? { type: input.type } : {}),
    }),
    listOpsMetricEvents({ limit: 5000 }),
  ]);

  const summary = summarizeOpsMetricEvents(sourceRows);
  const types = Array.from(new Set(sourceRows.map((row) => row.type))).sort((a, b) => a.localeCompare(b));
  const policy = loadOpsPolicy();

  return {
    rows,
    summary,
    meta: {
      limit: input.limit,
      ...(input.type ? { type: input.type } : {}),
      types,
      thresholds: {
        failureRateWarnPct: policy.metrics.failureRateWarnPct,
        latencyRegressionWarnMs: policy.metrics.latencyRegressionWarnMs,
        refreshFailureWarnCount: policy.metrics.refreshFailureWarnCount,
      },
    },
  };
}

export async function readOpsMetricsEventsPage(input: {
  limit: number;
  type?: MetricsEventType;
}): Promise<OpsMetricsEventsPage> {
  const rows = await readRecent({
    limit: input.limit,
    ...(input.type ? { type: input.type } : {}),
  });
  const types = Array.from(new Set(rows.map((row) => row.type))).sort((a, b) => a.localeCompare(b));

  return {
    rows,
    meta: {
      limit: input.limit,
      ...(input.type ? { type: input.type } : {}),
      types,
    },
  };
}

export async function readOpsMetricsSummaryPage(input: {
  rangeHours: OpsMetricsSummaryRangeHours;
}): Promise<OpsMetricsSummaryPage> {
  const [last24h, last7d, legacyRunBackfill] = await Promise.all([
    summarize({ rangeHours: 24 }),
    summarize({ rangeHours: 168 }),
    summarizeLegacyRunBackfill(),
  ]);
  const fallbackSnapshot = getPlanningFallbackUsageSnapshot();
  const planningFallbacks = {
    engineEnvelopeFallbackCount: fallbackSnapshot.legacyEnvelopeFallbackCount,
    reportContractFallbackCount: fallbackSnapshot.legacyReportContractFallbackCount,
    runEngineMigrationCount: fallbackSnapshot.legacyRunEngineMigrationCount,
    ...(fallbackSnapshot.lastEventAt ? { lastEventAt: fallbackSnapshot.lastEventAt } : {}),
    ...(fallbackSnapshot.sourceBreakdown ? { sourceBreakdown: fallbackSnapshot.sourceBreakdown } : {}),
    ...(fallbackSnapshot.recentEvents?.length ? { recentEvents: fallbackSnapshot.recentEvents } : {}),
  };

  return {
    data: {
      requested: input.rangeHours === 168 ? last7d : last24h,
      last24h,
      last7d,
      planningFallbacks,
      legacyRunBackfill,
    },
    range: input.rangeHours === 168 ? "7d" : "24h",
  };
}

export function toOpsMetricsStorageErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
