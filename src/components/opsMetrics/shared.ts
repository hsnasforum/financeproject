import { resolveClientApiError } from "@/lib/http/clientApiError";

export type MetricType =
  | "RUN_STAGE"
  | "RUN_PIPELINE"
  | "SCHEDULED_TASK"
  | "ASSUMPTIONS_REFRESH"
  | "BACKUP_EXPORT"
  | "BACKUP_PREVIEW"
  | "BACKUP_RESTORE"
  | "VAULT_UNLOCK"
  | "MIGRATION_ACTION";

export type MetricsRow = {
  type: MetricType;
  at: string;
  status?: string;
  runId?: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
};

export type MetricsSummary = {
  rangeHours: number;
  total: number;
  runPipeline: {
    successRatePct: number;
    total: number;
    failed: number;
  };
  simulate: {
    avgDurationMs?: number;
  };
  assumptionsRefresh: {
    lastStatus?: string;
    failed: number;
    consecutiveFailures: number;
  };
  backup: {
    success: number;
    failed: number;
  };
};

export type EventsPayload = {
  ok?: boolean;
  data?: MetricsRow[];
  meta?: {
    types?: string[];
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

export type PlanningFallbackSourceKey =
  | "legacyEngineFallback"
  | "legacyResultDtoFallback"
  | "compatRebuild"
  | "legacySnapshot"
  | "contractBuildFailureFallback";

export type PlanningFallbackCounterKey =
  | "legacyEnvelopeFallbackCount"
  | "legacyReportContractFallbackCount"
  | "legacyRunEngineMigrationCount";

export type RawPlanningFallbackSourceBreakdown =
  Partial<Record<PlanningFallbackCounterKey, Partial<Record<PlanningFallbackSourceKey, number>>>>;

export type RawPlanningFallbackEvent = {
  at?: string;
  key?: PlanningFallbackCounterKey;
  source?: string;
  sourceKey?: PlanningFallbackSourceKey;
  runKind?: "opsDoctor" | "user" | "unknown";
  runId?: string;
};

export type PlanningFallbackEvent = {
  at: string;
  key: PlanningFallbackCounterKey;
  source: string;
  sourceKey?: PlanningFallbackSourceKey;
  runKind?: "opsDoctor" | "user" | "unknown";
  runId?: string;
};

export type LegacyRunBackfillSummary = {
  totalRuns: number;
  opsDoctorRuns: number;
  userRuns: number;
  legacyCandidates: number;
  opsDoctorLegacyCandidates: number;
  userLegacyCandidates: number;
  resultDtoOnlyCandidates: number;
  missingResultDtoCandidates: number;
  missingEngineSchemaCandidates: number;
  unreadableCandidates: number;
};

export type PlanningFallbackSummary = {
  engineEnvelopeFallbackCount: number;
  reportContractFallbackCount: number;
  runEngineMigrationCount: number;
  lastEventAt?: string;
  sourceBreakdown?: RawPlanningFallbackSourceBreakdown;
  recentEvents?: PlanningFallbackEvent[];
};

export type PlanningFallbackDelta = {
  engineEnvelopeFallbackCount: number;
  reportContractFallbackCount: number;
  runEngineMigrationCount: number;
};

type RawPlanningFallbackSummary = {
  engineEnvelopeFallbackCount?: number;
  reportContractFallbackCount?: number;
  runEngineMigrationCount?: number;
  lastEventAt?: string;
  sourceBreakdown?: RawPlanningFallbackSourceBreakdown;
  recentEvents?: RawPlanningFallbackEvent[];
};

export type SummaryPayload = {
  ok?: boolean;
  data?: {
    last24h?: MetricsSummary;
    last7d?: MetricsSummary;
    planningFallbacks?: RawPlanningFallbackSummary;
    legacyRunBackfill?: {
      totalRuns?: number;
      opsDoctorRuns?: number;
      userRuns?: number;
      legacyCandidates?: number;
      opsDoctorLegacyCandidates?: number;
      userLegacyCandidates?: number;
      resultDtoOnlyCandidates?: number;
      missingResultDtoCandidates?: number;
      missingEngineSchemaCandidates?: number;
      unreadableCandidates?: number;
    };
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

export type MetricsSummaryCard = {
  title: string;
  value: string;
  hint: string;
};

export type PlanningFallbackCard = {
  title: string;
  value: number;
  delta: number;
  level: "ok" | "warn" | "check";
  levelLabel: string;
};

export type PlanningFallbackSourceRow = {
  counterKey: PlanningFallbackCounterKey;
  label: string;
  sourceKey: PlanningFallbackSourceKey;
  count: number;
};

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

export function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return `${ms.toFixed(1)}ms`;
}

export function shortMeta(row: MetricsRow): string {
  const parts = [
    row.status ? `status=${row.status}` : "",
    row.stage ? `stage=${row.stage}` : "",
    row.runId ? `run=${row.runId}` : "",
    typeof row.durationMs === "number" ? `dur=${formatMs(row.durationMs)}` : "",
    row.errorCode ? `code=${row.errorCode}` : "",
  ].filter((item) => item.length > 0);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function toSafeCount(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

const FALLBACK_COUNTER_KEYS: PlanningFallbackCounterKey[] = [
  "legacyEnvelopeFallbackCount",
  "legacyReportContractFallbackCount",
  "legacyRunEngineMigrationCount",
];

const FALLBACK_SOURCE_KEYS: PlanningFallbackSourceKey[] = [
  "legacyEngineFallback",
  "legacyResultDtoFallback",
  "compatRebuild",
  "legacySnapshot",
  "contractBuildFailureFallback",
];

function toSourceBreakdown(
  value: RawPlanningFallbackSourceBreakdown | undefined,
): RawPlanningFallbackSourceBreakdown | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next: RawPlanningFallbackSourceBreakdown = {};
  for (const counterKey of FALLBACK_COUNTER_KEYS) {
    const bucket = value[counterKey];
    if (!bucket || typeof bucket !== "object") continue;
    const normalized: Partial<Record<PlanningFallbackSourceKey, number>> = {};
    for (const sourceKey of FALLBACK_SOURCE_KEYS) {
      const count = toSafeCount(bucket[sourceKey]);
      if (count > 0) normalized[sourceKey] = count;
    }
    if (Object.keys(normalized).length > 0) {
      next[counterKey] = normalized;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function toFallbackEvents(value: RawPlanningFallbackEvent[] | undefined): PlanningFallbackEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next = value.flatMap((row) => {
    const at = asString(row.at);
    const source = asString(row.source);
    const key = row.key;
    if (!at || !source || !key) return [];
    return [{
      at,
      key,
      source,
      ...(row.sourceKey ? { sourceKey: row.sourceKey } : {}),
      ...(row.runKind ? { runKind: row.runKind } : {}),
      ...(asString(row.runId) ? { runId: asString(row.runId) } : {}),
    }];
  });
  return next.length > 0 ? next : undefined;
}

export function toFallbackSummary(value: RawPlanningFallbackSummary | undefined): PlanningFallbackSummary {
  const sourceBreakdown = toSourceBreakdown(value?.sourceBreakdown);
  const recentEvents = toFallbackEvents(value?.recentEvents);
  return {
    engineEnvelopeFallbackCount: toSafeCount(value?.engineEnvelopeFallbackCount),
    reportContractFallbackCount: toSafeCount(value?.reportContractFallbackCount),
    runEngineMigrationCount: toSafeCount(value?.runEngineMigrationCount),
    ...(asString(value?.lastEventAt) ? { lastEventAt: asString(value?.lastEventAt) } : {}),
    ...(sourceBreakdown ? { sourceBreakdown } : {}),
    ...(recentEvents ? { recentEvents } : {}),
  };
}

export function fallbackLevel(count: number): "ok" | "warn" | "check" {
  if (count <= 0) return "ok";
  if (count <= 5) return "warn";
  return "check";
}

function migrationLevel(
  total: number,
  delta: number,
  recentEvents: PlanningFallbackEvent[] | undefined,
): "ok" | "warn" | "check" {
  const migrationEvents = (recentEvents ?? []).filter((event) => event.key === "legacyRunEngineMigrationCount");
  const hasUserEvent = migrationEvents.some((event) => event.runKind === "user" || event.runKind === "unknown");
  if (hasUserEvent) return "check";
  if (delta > 0) return "warn";
  if (total > 0) return "warn";
  return "ok";
}

export function backlogLevel(summary: LegacyRunBackfillSummary): "ok" | "warn" | "check" {
  if (summary.unreadableCandidates > 0) return "check";
  if (
    summary.userLegacyCandidates > 0
    || summary.resultDtoOnlyCandidates > 0
    || summary.missingResultDtoCandidates > 0
    || summary.missingEngineSchemaCandidates > 0
  ) return "warn";
  return "ok";
}

export function fallbackLevelLabel(level: "ok" | "warn" | "check"): string {
  if (level === "ok") return "정상";
  if (level === "warn") return "경고";
  return "점검 필요";
}

export function fallbackSourceKeyLabel(sourceKey: PlanningFallbackSourceKey): string {
  if (sourceKey === "legacyEngineFallback") return "legacy engine fallback";
  if (sourceKey === "legacyResultDtoFallback") return "legacy resultDto fallback";
  if (sourceKey === "compatRebuild") return "canonical dto rebuild";
  if (sourceKey === "legacySnapshot") return "legacy snapshot";
  return "contract build failure";
}

export function createEmptyLegacyRunBackfillSummary(): LegacyRunBackfillSummary {
  return {
    totalRuns: 0,
    opsDoctorRuns: 0,
    userRuns: 0,
    legacyCandidates: 0,
    opsDoctorLegacyCandidates: 0,
    userLegacyCandidates: 0,
    resultDtoOnlyCandidates: 0,
    missingResultDtoCandidates: 0,
    missingEngineSchemaCandidates: 0,
    unreadableCandidates: 0,
  };
}

export function createEmptyPlanningFallbackSummary(): PlanningFallbackSummary {
  return {
    engineEnvelopeFallbackCount: 0,
    reportContractFallbackCount: 0,
    runEngineMigrationCount: 0,
  };
}

export function createEmptyPlanningFallbackDelta(): PlanningFallbackDelta {
  return {
    engineEnvelopeFallbackCount: 0,
    reportContractFallbackCount: 0,
    runEngineMigrationCount: 0,
  };
}

export function buildMetricsSummaryCards(
  summary24h: MetricsSummary | undefined,
  summary7d: MetricsSummary | undefined,
): MetricsSummaryCard[] {
  const refreshStatus = summary24h?.assumptionsRefresh.lastStatus ?? "-";
  const backupSummary = `${summary24h?.backup.success ?? 0}/${summary24h?.backup.failed ?? 0}`;

  return [
    {
      title: "Run success rate (24h)",
      value: `${Number(summary24h?.runPipeline.successRatePct ?? 0).toFixed(1)}%`,
      hint: `성공 ${summary24h?.runPipeline.total ? (summary24h.runPipeline.total - summary24h.runPipeline.failed) : 0}/${summary24h?.runPipeline.total ?? 0}`,
    },
    {
      title: "Avg simulate duration (24h)",
      value: typeof summary24h?.simulate.avgDurationMs === "number" ? formatMs(summary24h.simulate.avgDurationMs) : "-",
      hint: `7d avg 참고: ${typeof summary7d?.simulate.avgDurationMs === "number" ? formatMs(summary7d.simulate.avgDurationMs) : "-"}`,
    },
    {
      title: "Assumptions refresh (last)",
      value: refreshStatus,
      hint: `연속 실패 ${summary24h?.assumptionsRefresh.consecutiveFailures ?? 0}회`,
    },
    {
      title: "Backup success/fail (24h)",
      value: backupSummary,
      hint: "성공/실패 건수",
    },
  ];
}

export function buildPlanningFallbackCards(
  planningFallbacks: PlanningFallbackSummary,
  planningFallbackDelta: PlanningFallbackDelta,
): PlanningFallbackCard[] {
  const engineLevel = fallbackLevel(planningFallbacks.engineEnvelopeFallbackCount);
  const reportLevel = fallbackLevel(planningFallbacks.reportContractFallbackCount);
  const migrationStatus = migrationLevel(
    planningFallbacks.runEngineMigrationCount,
    planningFallbackDelta.runEngineMigrationCount,
    planningFallbacks.recentEvents,
  );
  return [
    {
      title: "Engine envelope fallback",
      value: planningFallbacks.engineEnvelopeFallbackCount,
      delta: planningFallbackDelta.engineEnvelopeFallbackCount,
      level: engineLevel,
      levelLabel: fallbackLevelLabel(engineLevel),
    },
    {
      title: "Report contract fallback",
      value: planningFallbacks.reportContractFallbackCount,
      delta: planningFallbackDelta.reportContractFallbackCount,
      level: reportLevel,
      levelLabel: fallbackLevelLabel(reportLevel),
    },
    {
      title: "Run lazy migration",
      value: planningFallbacks.runEngineMigrationCount,
      delta: planningFallbackDelta.runEngineMigrationCount,
      level: migrationStatus,
      levelLabel: fallbackLevelLabel(migrationStatus),
    },
  ];
}

export function buildPlanningFallbackSourceRows(
  planningFallbacks: PlanningFallbackSummary,
): PlanningFallbackSourceRow[] {
  const labels: Record<PlanningFallbackCounterKey, string> = {
    legacyEnvelopeFallbackCount: "Engine envelope source",
    legacyReportContractFallbackCount: "Report contract source",
    legacyRunEngineMigrationCount: "Run migration source",
  };
  return FALLBACK_COUNTER_KEYS.flatMap((counterKey) => {
    const bucket = planningFallbacks.sourceBreakdown?.[counterKey];
    if (!bucket) return [];
    return Object.entries(bucket)
      .sort((a, b) => b[1] - a[1])
      .map(([sourceKey, count]) => ({
        counterKey,
        label: labels[counterKey],
        sourceKey: sourceKey as PlanningFallbackSourceKey,
        count,
      }));
  });
}

export function mapSummaryError(payload: SummaryPayload | null): Error {
  const apiError = resolveClientApiError(payload, "metrics 요약을 불러오지 못했습니다.");
  return new Error(apiError.message);
}

export function mapEventsError(payload: EventsPayload | null): Error {
  const apiError = resolveClientApiError(payload, "metrics 이벤트를 불러오지 못했습니다.");
  return new Error(apiError.message);
}
