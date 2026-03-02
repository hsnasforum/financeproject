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
  meta?: Record<string, unknown>;
};

type MetricsWindowSummary = {
  total: number;
  failed: number;
  failureRatePct: number;
  durationAvgMs?: number;
  durationP95Ms?: number;
  assumptionsRefreshFailures: number;
};

type MetricsPayload = {
  ok?: boolean;
  data?: MetricsRow[];
  summary?: {
    last24h?: MetricsWindowSummary;
    last7d?: MetricsWindowSummary;
  };
  meta?: {
    types?: string[];
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsMetricsClientProps = {
  csrf: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function shortMeta(value: unknown): string {
  if (!value) return "-";
  try {
    const text = JSON.stringify(value);
    if (!text) return "-";
    return text.length > 100 ? `${text.slice(0, 100)}...` : text;
  } catch {
    return "-";
  }
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return `${ms.toFixed(1)}ms`;
}

function summaryCard(label: string, summary?: MetricsWindowSummary): Array<{ key: string; value: string }> {
  return [
    { key: `${label} total`, value: String(summary?.total ?? 0) },
    { key: `${label} fail`, value: String(summary?.failed ?? 0) },
    { key: `${label} fail rate`, value: `${Number(summary?.failureRatePct ?? 0).toFixed(1)}%` },
    { key: `${label} avg`, value: typeof summary?.durationAvgMs === "number" ? formatMs(summary.durationAvgMs) : "-" },
    { key: `${label} p95`, value: typeof summary?.durationP95Ms === "number" ? formatMs(summary.durationP95Ms) : "-" },
    { key: `${label} refresh fail`, value: String(summary?.assumptionsRefreshFailures ?? 0) },
  ];
}

export function OpsMetricsClient({ csrf }: OpsMetricsClientProps) {
  const [rows, setRows] = useState<MetricsRow[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [summary24h, setSummary24h] = useState<MetricsWindowSummary | undefined>(undefined);
  const [summary7d, setSummary7d] = useState<MetricsWindowSummary | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasCsrf = asString(csrf).length > 0;

  const loadMetrics = useCallback(async () => {
    if (!hasCsrf) {
      setRows([]);
      setError("Dev unlock/CSRF가 없어 metrics를 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      params.set("limit", "200");
      if (asString(eventType)) {
        params.set("type", eventType);
      }

      const response = await fetch(`/api/ops/metrics?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as MetricsPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        const apiError = resolveClientApiError(payload, "metrics를 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }

      setRows(payload.data);
      setSummary24h(payload.summary?.last24h);
      setSummary7d(payload.summary?.last7d);
      const nextTypes = Array.isArray(payload.meta?.types)
        ? payload.meta?.types.map((row) => asString(row)).filter((row) => row.length > 0)
        : [];
      setEventTypes(nextTypes);
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setSummary24h(undefined);
      setSummary7d(undefined);
      setError(loadError instanceof Error ? loadError.message : "metrics를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrf, eventType, hasCsrf]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const cards = useMemo(() => {
    return {
      short: summaryCard("24h", summary24h),
      long: summaryCard("7d", summary7d),
    };
  }, [summary24h, summary7d]);

  return (
    <PageShell>
      <PageHeader
        title="Ops Metrics"
        description="로컬 운영 메트릭 추이 (최근 이벤트 + 24h/7d 요약)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadMetrics()} disabled={loading || !hasCsrf}>
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

      {!hasCsrf ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dev unlock/CSRF가 없어 metrics를 조회할 수 없습니다.
        </Card>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-black text-slate-900">최근 24시간</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {cards.short.map((item) => (
              <div key={item.key} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                <div className="text-slate-600">{item.key}</div>
                <div className="font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-black text-slate-900">최근 7일</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {cards.long.map((item) => (
              <div key={item.key} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                <div className="text-slate-600">{item.key}</div>
                <div className="font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
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
        <Card className="overflow-x-auto p-0">
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
              {rows.map((row, index) => {
                const status = asString(row.meta?.status);
                return (
                  <tr key={`${row.at}-${row.type}-${index}`} className="border-t border-slate-200 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(row.at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.type}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{status || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatMs(row.meta?.durationMs)}</td>
                    <td className="max-w-[520px] px-3 py-2 text-slate-700">
                      {row.meta ? (
                        <details>
                          <summary className="cursor-pointer">{shortMeta(row.meta)}</summary>
                          <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                            {JSON.stringify(row.meta, null, 2)}
                          </pre>
                        </details>
                      ) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </PageShell>
  );
}
