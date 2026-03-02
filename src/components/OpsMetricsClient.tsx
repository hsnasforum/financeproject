"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsMetricsClientProps = {
  csrf?: string;
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

export function OpsMetricsClient(_props: OpsMetricsClientProps) {
  const [rows, setRows] = useState<MetricsRow[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [summary24h, setSummary24h] = useState<MetricsSummary | undefined>(undefined);
  const [summary7d, setSummary7d] = useState<MetricsSummary | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setSummary24h(undefined);
      setSummary7d(undefined);
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
