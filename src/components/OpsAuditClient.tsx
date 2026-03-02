"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";

type OpsAuditEvent = {
  eventType: string;
  at: string;
  actor: "local";
  meta?: Record<string, unknown>;
};

type OpsAuditPayload = {
  ok?: boolean;
  data?: OpsAuditEvent[];
  meta?: {
    limit?: number;
    eventType?: string;
    types?: string[];
  };
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsAuditClientProps = {
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

function previewMeta(value: unknown): string {
  if (!value) return "-";
  try {
    const text = JSON.stringify(value);
    if (!text) return "-";
    return text.length > 100 ? `${text.slice(0, 100)}...` : text;
  } catch {
    return "-";
  }
}

export function OpsAuditClient({ csrf }: OpsAuditClientProps) {
  const [rows, setRows] = useState<OpsAuditEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasCsrf = asString(csrf).length > 0;

  const loadAudit = useCallback(async () => {
    if (!hasCsrf) {
      setRows([]);
      setError("Dev unlock/CSRF가 없어 감사 로그를 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      params.set("limit", "200");
      if (asString(eventType)) {
        params.set("eventType", eventType);
      }

      const response = await fetch(`/api/ops/audit?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as OpsAuditPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        const apiError = resolveClientApiError(payload, "감사 로그를 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }

      setRows(payload.data);
      const nextTypes = Array.isArray(payload.meta?.types)
        ? payload.meta?.types.map((row) => asString(row)).filter((row) => row.length > 0)
        : [];
      setEventTypes(nextTypes);
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setError(loadError instanceof Error ? loadError.message : "감사 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrf, eventType, hasCsrf]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <PageShell>
      <PageHeader
        title="Ops Audit"
        description="보안/운영 이벤트 감사 로그 (최근 200건)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadAudit()} disabled={loading || !hasCsrf}>
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
            <Link href="/ops">
              <Button type="button" size="sm" variant="outline">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dev unlock/CSRF가 없어 감사 로그를 조회할 수 없습니다.
        </Card>
      ) : null}

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

      {loading && rows.length < 1 ? <LoadingState className="mb-4" title="감사 로그를 불러오는 중입니다" /> : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={() => void loadAudit()} retryLabel="다시 시도" /> : null}
      {!loading && !error && rows.length < 1 ? (
        <EmptyState
          className="mb-4"
          title="감사 로그가 없습니다"
          description="조건에 맞는 감사 이벤트가 없습니다."
          actionLabel="새로고침"
          onAction={() => void loadAudit()}
          icon="data"
        />
      ) : null}

      {rows.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">이벤트</th>
                <th className="px-3 py-2 font-semibold">Actor</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${row.eventType}-${index}`} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(row.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.eventType}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.actor}</td>
                  <td className="max-w-[520px] px-3 py-2 text-slate-700">
                    {row.meta ? (
                      <details>
                        <summary className="cursor-pointer">{previewMeta(row.meta)}</summary>
                        <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      </details>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </PageShell>
  );
}
