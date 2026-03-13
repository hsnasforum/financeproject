"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";

type MetricType =
  | "RUN_STAGE"
  | "RUN_PIPELINE"
  | "SCHEDULED_TASK"
  | "ASSUMPTIONS_REFRESH"
  | "BACKUP_EXPORT"
  | "BACKUP_PREVIEW"
  | "BACKUP_RESTORE"
  | "VAULT_UNLOCK"
  | "MIGRATION_ACTION";

type MetricsRow = {
  type: MetricType;
  at: string;
  status?: string;
  runId?: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
};

type MetricsSummary = {
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

type EventsPayload = {
  ok?: boolean;
  data?: MetricsRow[];
  meta?: {
    types?: string[];
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type SummaryPayload = {
  ok?: boolean;
  data?: {
    last24h?: MetricsSummary;
    last7d?: MetricsSummary;
    planningFallbacks?: {
      engineEnvelopeFallbackCount?: number;
      reportContractFallbackCount?: number;
      runEngineMigrationCount?: number;
      lastEventAt?: string;
      sourceBreakdown?: RawPlanningFallbackSourceBreakdown;
      recentEvents?: RawPlanningFallbackEvent[];
    };
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

type PlanningFallbackSourceKey =
  | "legacyEngineFallback"
  | "legacyResultDtoFallback"
  | "compatRebuild"
  | "legacySnapshot"
  | "contractBuildFailureFallback";

type PlanningFallbackCounterKey =
  | "legacyEnvelopeFallbackCount"
  | "legacyReportContractFallbackCount"
  | "legacyRunEngineMigrationCount";

type RawPlanningFallbackSourceBreakdown =
  Partial<Record<PlanningFallbackCounterKey, Partial<Record<PlanningFallbackSourceKey, number>>>>;

type RawPlanningFallbackEvent = {
  at?: string;
  key?: PlanningFallbackCounterKey;
  source?: string;
  sourceKey?: PlanningFallbackSourceKey;
  runKind?: "opsDoctor" | "user" | "unknown";
  runId?: string;
};

type PlanningFallbackEvent = {
  at: string;
  key: PlanningFallbackCounterKey;
  source: string;
  sourceKey?: PlanningFallbackSourceKey;
  runKind?: "opsDoctor" | "user" | "unknown";
  runId?: string;
};

type LegacyRunBackfillSummary = {
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

type PlanningFallbackSummary = {
  engineEnvelopeFallbackCount: number;
  reportContractFallbackCount: number;
  runEngineMigrationCount: number;
  lastEventAt?: string;
  sourceBreakdown?: RawPlanningFallbackSourceBreakdown;
  recentEvents?: PlanningFallbackEvent[];
};

type PlanningFallbackDelta = {
  engineEnvelopeFallbackCount: number;
  reportContractFallbackCount: number;
  runEngineMigrationCount: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return `${ms.toFixed(1)}ms`;
}

function shortMeta(row: MetricsRow): string {
  const parts = [
    row.status ? `status=${row.status}` : "",
    row.stage ? `stage=${row.stage}` : "",
    row.runId ? `run=${row.runId}` : "",
    typeof row.durationMs === "number" ? `dur=${formatMs(row.durationMs)}` : "",
    row.errorCode ? `code=${row.errorCode}` : "",
  ].filter((item) => item.length > 0);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function toSafeCount(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

type RawPlanningFallbackSummary = {
  engineEnvelopeFallbackCount?: number;
  reportContractFallbackCount?: number;
  runEngineMigrationCount?: number;
  lastEventAt?: string;
  sourceBreakdown?: RawPlanningFallbackSourceBreakdown;
  recentEvents?: RawPlanningFallbackEvent[];
};

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

function toFallbackSummary(value: RawPlanningFallbackSummary | undefined): PlanningFallbackSummary {
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

function fallbackLevel(count: number): "ok" | "warn" | "check" {
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

function backlogLevel(summary: LegacyRunBackfillSummary): "ok" | "warn" | "check" {
  if (summary.unreadableCandidates > 0) return "check";
  if (
    summary.userLegacyCandidates > 0
    || summary.resultDtoOnlyCandidates > 0
    || summary.missingResultDtoCandidates > 0
    || summary.missingEngineSchemaCandidates > 0
  ) return "warn";
  return "ok";
}

function fallbackLevelLabel(level: "ok" | "warn" | "check"): string {
  if (level === "ok") return "정상";
  if (level === "warn") return "경고";
  return "점검 필요";
}

function fallbackSourceKeyLabel(sourceKey: PlanningFallbackSourceKey): string {
  if (sourceKey === "legacyEngineFallback") return "legacy engine fallback";
  if (sourceKey === "legacyResultDtoFallback") return "legacy resultDto fallback";
  if (sourceKey === "compatRebuild") return "canonical dto rebuild";
  if (sourceKey === "legacySnapshot") return "legacy snapshot";
  return "contract build failure";
}

export function OpsMetricsClient() {
  const [rows, setRows] = useState<MetricsRow[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [summary24h, setSummary24h] = useState<MetricsSummary | undefined>(undefined);
  const [summary7d, setSummary7d] = useState<MetricsSummary | undefined>(undefined);
  const [planningFallbacks, setPlanningFallbacks] = useState<PlanningFallbackSummary>({
    engineEnvelopeFallbackCount: 0,
    reportContractFallbackCount: 0,
    runEngineMigrationCount: 0,
  });
  const [legacyRunBackfill, setLegacyRunBackfill] = useState<LegacyRunBackfillSummary>({
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
  });
  const [planningFallbackDelta, setPlanningFallbackDelta] = useState<PlanningFallbackDelta>({
    engineEnvelopeFallbackCount: 0,
    reportContractFallbackCount: 0,
    runEngineMigrationCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const previousFallbacksRef = useRef<PlanningFallbackSummary | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const eventsParams = new URLSearchParams();
      eventsParams.set("limit", "200");
      if (asString(eventType)) eventsParams.set("type", eventType);

      const [eventsRes, summaryRes] = await Promise.all([
        fetch(`/api/ops/metrics/events?${eventsParams.toString()}`, { cache: "no-store" }),
        fetch("/api/ops/metrics/summary?range=24h", { cache: "no-store" }),
      ]);

      const eventsPayload = (await eventsRes.json().catch(() => null)) as EventsPayload | null;
      const summaryPayload = (await summaryRes.json().catch(() => null)) as SummaryPayload | null;

      if (!eventsRes.ok || !eventsPayload?.ok || !Array.isArray(eventsPayload.data)) {
        const apiError = resolveClientApiError(eventsPayload, "metrics 이벤트를 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }

      if (!summaryRes.ok || !summaryPayload?.ok || !summaryPayload.data) {
        const apiError = resolveClientApiError(summaryPayload, "metrics 요약을 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }

      setRows(eventsPayload.data);
      const nextTypes = Array.isArray(eventsPayload.meta?.types)
        ? eventsPayload.meta?.types.map((row) => asString(row)).filter((row) => row.length > 0)
        : [];
      setEventTypes(nextTypes);
      setSummary24h(summaryPayload.data.last24h);
      setSummary7d(summaryPayload.data.last7d);
      const nextFallbacks = toFallbackSummary(summaryPayload.data.planningFallbacks);
      setLegacyRunBackfill({
        totalRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.totalRuns),
        opsDoctorRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.opsDoctorRuns),
        userRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.userRuns),
        legacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.legacyCandidates),
        opsDoctorLegacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.opsDoctorLegacyCandidates),
        userLegacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.userLegacyCandidates),
        resultDtoOnlyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.resultDtoOnlyCandidates),
        missingResultDtoCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.missingResultDtoCandidates),
        missingEngineSchemaCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.missingEngineSchemaCandidates),
        unreadableCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.unreadableCandidates),
      });
      const previousFallbacks = previousFallbacksRef.current;
      const delta: PlanningFallbackDelta = previousFallbacks
        ? {
          engineEnvelopeFallbackCount: Math.max(
            0,
            nextFallbacks.engineEnvelopeFallbackCount - previousFallbacks.engineEnvelopeFallbackCount,
          ),
          reportContractFallbackCount: Math.max(
            0,
            nextFallbacks.reportContractFallbackCount - previousFallbacks.reportContractFallbackCount,
          ),
          runEngineMigrationCount: Math.max(
            0,
            nextFallbacks.runEngineMigrationCount - previousFallbacks.runEngineMigrationCount,
          ),
        }
        : {
          engineEnvelopeFallbackCount: 0,
          reportContractFallbackCount: 0,
          runEngineMigrationCount: 0,
        };
      setPlanningFallbackDelta(delta);
      setPlanningFallbacks(nextFallbacks);
      previousFallbacksRef.current = nextFallbacks;
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setSummary24h(undefined);
      setSummary7d(undefined);
      setLegacyRunBackfill({
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
      });
      setPlanningFallbackDelta({
        engineEnvelopeFallbackCount: 0,
        reportContractFallbackCount: 0,
        runEngineMigrationCount: 0,
      });
      setError(loadError instanceof Error ? loadError.message : "metrics를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [eventType]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const summaryCards = useMemo(() => {
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
  }, [summary24h, summary7d]);

  const planningFallbackCards = useMemo(() => {
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
  }, [planningFallbackDelta, planningFallbacks]);

  const legacyBacklogStatus = useMemo(() => backlogLevel(legacyRunBackfill), [legacyRunBackfill]);

  const planningFallbackSourceRows = useMemo(() => {
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
          sourceKey,
          count,
        }));
    });
  }, [planningFallbacks.sourceBreakdown]);

  return (
    <PageShell>
      <div data-testid="ops-metrics">
      <PageHeader
        title="Ops Metrics"
        description="로컬 운영 메트릭 추이 (최근 이벤트 + 24h/7d 요약)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadMetrics()} disabled={loading}>
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
            <Link href="/ops/doctor">
              <Button type="button" size="sm" variant="outline">Ops Doctor</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" size="sm" variant="outline">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="metrics-summary">
        {summaryCards.map((card) => (
          <Card className="p-4" key={card.title}>
            <p className="text-xs font-semibold text-slate-500">{card.title}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{card.value}</p>
            <p className="mt-1 text-[11px] text-slate-600">{card.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4 p-4" data-testid="planning-fallback-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">Planning fallback usage</h2>
          <p className="text-xs text-slate-500">
            마지막 발생: {planningFallbacks.lastEventAt ? formatDateTime(planningFallbacks.lastEventAt) : "-"}
          </p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {planningFallbackCards.map((card) => (
            <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold text-slate-500">{card.title}</p>
              <p className="mt-1 text-lg font-black text-slate-900">{card.value.toLocaleString()}</p>
              <p className="mt-1 text-[11px] text-slate-600">최근 증가량 +{card.delta.toLocaleString()}</p>
              <p className={`mt-1 text-[11px] font-semibold ${
                card.level === "ok" ? "text-emerald-600" : card.level === "warn" ? "text-amber-600" : "text-rose-600"
              }`}
              >
                {card.levelLabel}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-600">Fallback source breakdown</p>
            <p className="text-[11px] text-slate-500">docs/planning-report-p4-observation-kit.md</p>
          </div>
          {planningFallbackSourceRows.length > 0 ? (
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {planningFallbackSourceRows.map((row) => (
                <div key={`${row.counterKey}-${row.sourceKey}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-[11px] font-semibold text-slate-500">{row.label}</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{fallbackSourceKeyLabel(row.sourceKey as PlanningFallbackSourceKey)}</p>
                  <p className="text-[11px] text-slate-500">{row.sourceKey}</p>
                  <p className="text-[11px] text-slate-600">count {row.count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">표준 source_key 기준 breakdown 데이터가 아직 없습니다.</p>
          )}
        </div>
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-600">Recent fallback events</p>
          {planningFallbacks.recentEvents?.length ? (
            <div className="mt-2 space-y-2">
              {planningFallbacks.recentEvents.slice(0, 8).map((event, index) => (
                <div key={`${event.at}-${event.key}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold text-slate-900">
                    {event.sourceKey ? fallbackSourceKeyLabel(event.sourceKey) : "unknown"} · {event.key}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {formatDateTime(event.at)} · source={event.source}
                    {event.runKind ? ` · kind=${event.runKind}` : ""}
                    {event.runId ? ` · run=${event.runId}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">최근 fallback 이벤트가 없습니다.</p>
          )}
        </div>
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-600">Legacy run backlog</p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Legacy candidates</p>
              <p className="mt-1 text-sm font-black text-slate-900">{legacyRunBackfill.legacyCandidates.toLocaleString()}</p>
              <p className="text-[11px] text-slate-600">user {legacyRunBackfill.userLegacyCandidates.toLocaleString()} / ops-doctor {legacyRunBackfill.opsDoctorLegacyCandidates.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Canonical DTO gap</p>
              <p className="mt-1 text-sm font-black text-slate-900">{legacyRunBackfill.resultDtoOnlyCandidates.toLocaleString()}</p>
              <p className="text-[11px] text-slate-600">engine schema missing {legacyRunBackfill.missingEngineSchemaCandidates.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Backlog status</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fallbackLevelLabel(legacyBacklogStatus)}</p>
              <p className="text-[11px] text-slate-600">backfillable {legacyRunBackfill.missingResultDtoCandidates.toLocaleString()} / unreadable {legacyRunBackfill.unreadableCandidates.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Run split</p>
              <p className="mt-1 text-sm font-black text-slate-900">user {legacyRunBackfill.userRuns.toLocaleString()}</p>
              <p className="text-[11px] text-slate-600">ops-doctor {legacyRunBackfill.opsDoctorRuns.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Backfillable missing resultDto</p>
              <p className="mt-1 text-sm font-black text-slate-900">{legacyRunBackfill.missingResultDtoCandidates.toLocaleString()}</p>
              <p className="text-[11px] text-slate-600">total runs {legacyRunBackfill.totalRuns.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-500">Unreadable meta</p>
              <p className="mt-1 text-sm font-black text-slate-900">{legacyRunBackfill.unreadableCandidates.toLocaleString()}</p>
              <p className="text-[11px] text-slate-600">separate investigation needed</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="text-base font-black text-slate-900">필터</h2>
        <label className="mt-3 block text-xs text-slate-600">
          Event Type
          <select
            className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm md:max-w-[360px]"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="">ALL</option>
            {eventTypes.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
        </label>
      </Card>

      {loading && rows.length < 1 ? <LoadingState className="mb-4" title="metrics를 불러오는 중입니다" /> : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={() => void loadMetrics()} retryLabel="다시 시도" /> : null}
      {!loading && !error && rows.length < 1 ? (
        <EmptyState
          className="mb-4"
          title="metrics 이벤트가 없습니다"
          description="조건에 맞는 이벤트가 없습니다."
          actionLabel="새로고침"
          onAction={() => void loadMetrics()}
          icon="data"
        />
      ) : null}

      {rows.length > 0 ? (
        <Card className="overflow-x-auto p-0" data-testid="metrics-events">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">유형</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold">duration</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${row.type}-${index}`} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(row.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.type}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.status ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatMs(row.durationMs)}</td>
                  <td className="max-w-[520px] px-3 py-2 text-slate-700">{shortMeta(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      </div>
    </PageShell>
  );
}
