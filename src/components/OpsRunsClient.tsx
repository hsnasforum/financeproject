"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type RunStatus = "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

type RunSummary = {
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  overallStatus?: RunStatus;
  snapshot?: {
    id?: string;
    asOf?: string;
    missing?: boolean;
  };
  warningsCount?: number;
  criticalCount?: number;
};

type RunsListPayload = {
  ok?: boolean;
  data?: RunSummary[];
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
  message?: string;
};

type CleanupPayload = {
  ok?: boolean;
  data?: {
    dryRun?: boolean;
    total?: number;
    kept?: number;
    toDelete?: number;
    deleted?: number;
    failed?: Array<{ id?: string; message?: string }>;
    sample?: Array<{ id?: string; profileId?: string; createdAt?: string; reasons?: string[] }>;
  };
  message?: string;
};

type OpsRunsClientProps = {
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

function formatStatus(value: RunStatus | undefined): string {
  if (!value) return "-";
  if (value === "PARTIAL_SUCCESS") return "PARTIAL";
  return value;
}

function toInt(value: string, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(5000, parsed));
}

export function OpsRunsClient({ csrf }: OpsRunsClientProps) {
  const [rows, setRows] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [cleanupKeepDays, setCleanupKeepDays] = useState("90");
  const [cleanupKeepCount, setCleanupKeepCount] = useState("50");
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [cleanupPreview, setCleanupPreview] = useState<Array<{ id: string; profileId: string; createdAt: string; reasons: string[] }>>([]);

  const hasCsrf = asString(csrf).length > 0;

  const canPrev = offset > 0;
  const canNext = hasMore;

  const statusOptions = useMemo(() => ["", "RUNNING", "SUCCESS", "PARTIAL_SUCCESS", "FAILED"], []);

  const loadRuns = useCallback(async () => {
    if (!hasCsrf) {
      setError("Dev unlock/CSRF가 없어 조회할 수 없습니다.");
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (asString(status)) params.set("status", status);
      if (asString(profileId)) params.set("profileId", profileId);
      if (asString(query)) params.set("q", query);
      if (asString(dateFrom)) params.set("dateFrom", dateFrom);
      if (asString(dateTo)) params.set("dateTo", dateTo);

      const response = await fetch(`/api/ops/runs?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RunsListPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.message ?? "runs 조회에 실패했습니다.");
      }

      setRows(payload.data);
      setTotal(typeof payload.meta?.total === "number" ? payload.meta.total : payload.data.length);
      setHasMore(payload.meta?.hasMore === true);
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(loadError instanceof Error ? loadError.message : "runs 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrf, dateFrom, dateTo, hasCsrf, limit, offset, profileId, query, status]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function deleteRunAction(runId: string): Promise<void> {
    if (!hasCsrf) return;
    const ok = window.confirm(`실행 기록을 삭제(휴지통 이동)할까요?\n${runId}`);
    if (!ok) return;

    try {
      const response = await fetch(`/api/ops/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({})),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "삭제에 실패했습니다.");
      }
      await loadRuns();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : "삭제에 실패했습니다.");
    }
  }

  async function runCleanup(dryRun: boolean): Promise<void> {
    if (!hasCsrf) return;
    setCleanupRunning(true);
    setCleanupMessage("");
    try {
      const keepDays = toInt(cleanupKeepDays, 90);
      const keepCount = toInt(cleanupKeepCount, 50);

      const response = await fetch("/api/ops/runs/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          keepDays,
          keepCount,
          ...(asString(profileId) ? { profileId } : {}),
          dryRun,
        })),
      });
      const payload = (await response.json().catch(() => null)) as CleanupPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message ?? "runs cleanup에 실패했습니다.");
      }

      setCleanupMessage(payload.message ?? "완료");
      const preview = Array.isArray(payload.data.sample)
        ? payload.data.sample
          .map((row) => ({
            id: asString(row.id),
            profileId: asString(row.profileId),
            createdAt: asString(row.createdAt),
            reasons: Array.isArray(row.reasons) ? row.reasons.map((entry) => asString(entry)).filter((entry) => entry.length > 0) : [],
          }))
          .filter((row) => row.id.length > 0)
        : [];
      setCleanupPreview(preview);

      if (!dryRun) {
        await loadRuns();
      }
    } catch (cleanupError) {
      setCleanupMessage(cleanupError instanceof Error ? cleanupError.message : "runs cleanup에 실패했습니다.");
    } finally {
      setCleanupRunning(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops Runs"
        description="실행 기록 조회/필터/삭제/보존정리"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button size="sm" variant="outline" type="button">Ops 허브</Button>
            </Link>
            <Link href="/ops/planning-cleanup">
              <Button size="sm" variant="outline" type="button">기존 정리 도구</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dev unlock/CSRF가 없어 실행되지 않습니다.
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <h2 className="text-base font-black text-slate-900">필터</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs text-slate-600">
            Status
            <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={status} onChange={(event) => {
              setOffset(0);
              setStatus(event.target.value);
            }}>
              {statusOptions.map((option) => (
                <option key={option || "ALL"} value={option}>{option || "ALL"}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Profile ID
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={profileId} onChange={(event) => {
              setOffset(0);
              setProfileId(event.target.value);
            }} />
          </label>
          <label className="text-xs text-slate-600">
            Search
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={query} onChange={(event) => {
              setOffset(0);
              setQuery(event.target.value);
            }} placeholder="runId/title/snapshot" />
          </label>
          <label className="text-xs text-slate-600">
            Date From
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => {
              setOffset(0);
              setDateFrom(event.target.value);
            }} />
          </label>
          <label className="text-xs text-slate-600">
            Date To
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" type="date" value={dateTo} onChange={(event) => {
              setOffset(0);
              setDateTo(event.target.value);
            }} />
          </label>
          <label className="text-xs text-slate-600">
            Limit
            <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={String(limit)} onChange={(event) => {
              setOffset(0);
              setLimit(toInt(event.target.value, 20));
            }}>
              {[20, 50, 100].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => void loadRuns()} disabled={loading || !hasCsrf}>{loading ? "조회 중..." : "조회"}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => {
            setStatus("");
            setProfileId("");
            setQuery("");
            setDateFrom("");
            setDateTo("");
            setOffset(0);
          }}>필터 초기화</Button>
          <p className="text-xs text-slate-500">총 {total}건</p>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="text-base font-black text-slate-900">보존 정리</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-slate-600">
            keepDays
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={cleanupKeepDays} onChange={(event) => setCleanupKeepDays(event.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            keepCount
            <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={cleanupKeepCount} onChange={(event) => setCleanupKeepCount(event.target.value)} />
          </label>
          <div className="md:col-span-2 flex items-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void runCleanup(true)} disabled={cleanupRunning || !hasCsrf}>
              {cleanupRunning ? "실행 중..." : "Dry-run"}
            </Button>
            <Button type="button" size="sm" onClick={() => void runCleanup(false)} disabled={cleanupRunning || !hasCsrf}>
              {cleanupRunning ? "실행 중..." : "Cleanup 적용"}
            </Button>
          </div>
        </div>
        {cleanupMessage ? <p className="mt-2 text-sm text-slate-700">{cleanupMessage}</p> : null}
        {cleanupPreview.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {cleanupPreview.map((row) => (
              <li key={row.id}>{row.id} / {row.profileId} / {formatDateTime(row.createdAt)} / {row.reasons.join(",") || "-"}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-black text-slate-900">Runs</h2>
        {loading && rows.length < 1 ? (
          <LoadingState className="mt-3" title="실행 기록을 불러오는 중입니다" />
        ) : null}
        {!loading && error ? (
          <ErrorState
            className="mt-3"
            message={error}
            onRetry={() => void loadRuns()}
            retryLabel="다시 시도"
          />
        ) : null}
        {!loading && !error && rows.length < 1 ? (
          <EmptyState
            actionLabel="다시 조회"
            className="mt-3"
            description="필터 조건을 확인하거나 범위를 넓혀 다시 조회해 주세요."
            icon="data"
            onAction={() => void loadRuns()}
            title="실행 기록이 없습니다"
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">runId</th>
                  <th className="px-2 py-2">createdAt</th>
                  <th className="px-2 py-2">status</th>
                  <th className="px-2 py-2">profileId</th>
                  <th className="px-2 py-2">snapshot</th>
                  <th className="px-2 py-2">warnings</th>
                  <th className="px-2 py-2">critical</th>
                  <th className="px-2 py-2">actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-100" key={row.id}>
                    <td className="px-2 py-2">{row.title || row.id}</td>
                    <td className="px-2 py-2">{formatDateTime(row.createdAt)}</td>
                    <td className="px-2 py-2">{formatStatus(row.overallStatus)}</td>
                    <td className="px-2 py-2">{row.profileId}</td>
                    <td className="px-2 py-2">{row.snapshot?.id || row.snapshot?.asOf || (row.snapshot?.missing ? "missing" : "latest")}</td>
                    <td className="px-2 py-2">{typeof row.warningsCount === "number" ? row.warningsCount : "-"}</td>
                    <td className="px-2 py-2">{typeof row.criticalCount === "number" ? row.criticalCount : "-"}</td>
                    <td className="px-2 py-2">
                      <a
                        aria-label={`run ${row.id} 리포트 열기`}
                        className="font-semibold text-emerald-700"
                        href={`/planning/reports/${encodeURIComponent(row.id)}`}
                      >
                        리포트
                      </a>
                      <span className="mx-1 text-slate-300">|</span>
                      <button
                        aria-label={`run ${row.id} 삭제`}
                        className="font-semibold text-rose-700"
                        onClick={() => void deleteRunAction(row.id)}
                        type="button"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOffset((prev) => Math.max(0, prev - limit))} disabled={!canPrev}>이전</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setOffset((prev) => prev + limit)} disabled={!canNext}>다음</Button>
          <p className="text-xs text-slate-500">offset {offset}</p>
        </div>
      </Card>
    </PageShell>
  );
}
