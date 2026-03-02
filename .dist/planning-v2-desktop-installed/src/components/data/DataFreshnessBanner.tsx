"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SourceStatusRow } from "@/lib/sources/types";
import {
  formatAge,
  formatTtl,
  summarizeFreshness,
  type FreshnessItemStatus,
  type FreshnessSourceSpec,
  type FreshnessSummary,
} from "@/components/data/freshness";

type StatusApiResponse = {
  ok: boolean;
  data?: SourceStatusRow[];
};

type Props = {
  title?: string;
  sources: FreshnessSourceSpec[];
  showWhenFresh?: boolean;
  infoDisplay?: "banner" | "compact" | "hidden";
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { hour12: false });
}

function levelStyle(level: FreshnessSummary["level"]): string {
  if (level === "error") return "border-rose-300 bg-rose-50 text-rose-800";
  if (level === "info") return "border-sky-300 bg-sky-50 text-sky-800";
  if (level === "warn") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-emerald-300 bg-emerald-50 text-emerald-900";
}

function statusLabel(status: FreshnessItemStatus): string {
  if (status === "error") return "실패";
  if (status === "stale") return "오래됨";
  if (status === "empty") return "데이터 없음";
  return "최신";
}

export function DataFreshnessBanner({
  title = "데이터 최신 상태",
  sources,
  showWhenFresh = false,
  infoDisplay = "banner",
}: Props) {
  const autoSmokeDefault = process.env.NODE_ENV !== "production";
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SourceStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [autoSmoke, setAutoSmoke] = useState(autoSmokeDefault);
  const [autoSmokeReady, setAutoSmokeReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const strict = searchParams.get("strict") === "1" || searchParams.get("freshness") === "strict";
  const autoSmokeSessionKeyRef = useRef<string>("");

  useEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : "global";
    autoSmokeSessionKeyRef.current = `freshness:autoSmoke:run:${path}`;
    try {
      const stored = localStorage.getItem("freshness:autoSmoke");
      if (stored === "1") setAutoSmoke(true);
      else if (stored === "0") setAutoSmoke(false);
      else setAutoSmoke(autoSmokeDefault);
    } catch {
      setAutoSmoke(autoSmokeDefault);
    } finally {
      setAutoSmokeReady(true);
    }
  }, [autoSmokeDefault]);

  useEffect(() => {
    if (!autoSmokeReady) return;
    try {
      localStorage.setItem("freshness:autoSmoke", autoSmoke ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [autoSmoke, autoSmokeReady]);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/sources/status", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const json = (await response.json()) as StatusApiResponse;
      if (!response.ok || !json.ok || !Array.isArray(json.data)) {
        setRows([]);
        setError("상태 정보를 불러오지 못했습니다.");
        return;
      }
      setRows(json.data);
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") return;
      setRows([]);
      setError("상태 정보를 불러오지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const runSmokeSync = useCallback(async (trigger: "manual" | "auto") => {
    setSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      const response = await fetch("/api/sync/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as { ok?: boolean; reportPath?: string | null; error?: { message?: string } };
      if (!response.ok || !json.ok) {
        setSyncError(json.error?.message ?? "스모크 업데이트에 실패했습니다.");
        return;
      }
      setSyncMessage(
        trigger === "auto"
          ? "자동 스모크 업데이트를 완료했습니다."
          : "스모크 업데이트를 완료했습니다.",
      );
      await refresh();
    } catch {
      setSyncError("스모크 업데이트에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const summary = useMemo(
    () => summarizeFreshness(rows, sources, { strict }),
    [rows, sources, strict],
  );
  const requiredItems = useMemo(
    () => summary.items.filter((item) => item.importance === "required"),
    [summary.items],
  );
  const optionalItems = useMemo(
    () => summary.items.filter((item) => item.importance === "optional"),
    [summary.items],
  );
  const effectiveInfoDisplay = strict && infoDisplay === "hidden" ? "compact" : infoDisplay;

  useEffect(() => {
    if (!autoSmoke || loading || syncing) return;
    if (error) return;
    if (summary.level !== "warn" && summary.level !== "error") return;
    const key = autoSmokeSessionKeyRef.current;
    if (!key) return;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore storage errors
    }
    void runSmokeSync("auto");
  }, [autoSmoke, error, loading, runSmokeSync, summary.level, syncing]);

  if (sources.length === 0) return null;
  if (!loading && !error && summary.level === "info" && effectiveInfoDisplay === "hidden") return null;
  if (!loading && !error && summary.level === "ok" && !showWhenFresh) return null;

  if (!error && summary.level === "info" && effectiveInfoDisplay === "compact") {
    return (
      <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">데이터 상태(참고)</p>
            <p className="mt-0.5">선택 소스 이슈 {summary.optionalIssuesCount}건, 핵심 소스는 최신입니다.</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-sky-300 bg-white/80 px-2 py-0.5 text-[11px] font-semibold"
            disabled={loading}
          >
            {loading ? "확인 중..." : "재확인"}
          </button>
        </div>
        <details className="mt-2 rounded-md border border-sky-200 bg-white/70 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold">자세히 보기</summary>
          <div className="mt-2 space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">Required sources</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-sky-200">
                      <th className="px-2 py-1 font-semibold">소스</th>
                      <th className="px-2 py-1 font-semibold">상태</th>
                      <th className="px-2 py-1 font-semibold">건수</th>
                      <th className="px-2 py-1 font-semibold">경과/TTL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requiredItems.map((item) => (
                      <tr key={`${item.sourceId}:${item.kind}`} className="border-b border-sky-100 last:border-0">
                        <td className="px-2 py-1">{item.label ?? `${item.sourceId} ${item.kind}`}</td>
                        <td className="px-2 py-1">{statusLabel(item.status)}</td>
                        <td className="px-2 py-1">{item.counts}</td>
                        <td className="px-2 py-1">{formatAge(item.ageMs)} / {formatTtl(item.ttlMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {optionalItems.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">Optional sources</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-sky-200">
                        <th className="px-2 py-1 font-semibold">소스</th>
                        <th className="px-2 py-1 font-semibold">상태</th>
                        <th className="px-2 py-1 font-semibold">건수</th>
                        <th className="px-2 py-1 font-semibold">경과/TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionalItems.map((item) => (
                        <tr key={`${item.sourceId}:${item.kind}`} className="border-b border-sky-100 last:border-0">
                          <td className="px-2 py-1">{item.label ?? `${item.sourceId} ${item.kind}`}</td>
                          <td className="px-2 py-1">{statusLabel(item.status)}</td>
                          <td className="px-2 py-1">{item.counts}</td>
                          <td className="px-2 py-1">{formatAge(item.ageMs)} / {formatTtl(item.ttlMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            <p className="text-[11px]">
              상세 상태: <Link href="/debug/unified" className="underline">/debug/unified</Link>
            </p>
          </div>
        </details>
      </section>
    );
  }

  return (
    <section className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${levelStyle(error ? "error" : summary.level)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs opacity-90">
            {error ? "상태 조회 실패" : summary.message}
          </p>
          <p className="mt-1 text-xs opacity-80">
            자동 동기화는 수행하지 않으며, stale 감지만 제공합니다.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] opacity-85">
            <span>Required 이슈 {summary.requiredIssuesCount}건</span>
            <span>Optional 이슈 {summary.optionalIssuesCount}건</span>
            {strict ? <span className="rounded-full border border-current/30 px-2 py-0.5">Strict mode</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-current/30 bg-white/60 px-3 py-1 text-xs font-semibold"
          disabled={loading}
        >
          {loading ? "확인 중..." : "재확인"}
        </button>
      </div>

      <details className="mt-3 rounded-xl border border-current/25 bg-white/60 p-3">
        <summary className="cursor-pointer text-xs font-semibold">소스별 상태 보기</summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">Required sources</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-current/20">
                    <th className="px-2 py-1 font-semibold">소스</th>
                    <th className="px-2 py-1 font-semibold">상태</th>
                    <th className="px-2 py-1 font-semibold">건수</th>
                    <th className="px-2 py-1 font-semibold">동기화 시각</th>
                    <th className="px-2 py-1 font-semibold">경과</th>
                    <th className="px-2 py-1 font-semibold">TTL</th>
                    <th className="px-2 py-1 font-semibold">오류</th>
                  </tr>
                </thead>
                <tbody>
                  {requiredItems.map((item) => (
                    <tr key={`${item.sourceId}:${item.kind}`} className="border-b border-current/10 last:border-0">
                      <td className="px-2 py-1">{item.label ?? `${item.sourceId} ${item.kind}`}</td>
                      <td className="px-2 py-1">{statusLabel(item.status)}</td>
                      <td className="px-2 py-1">{item.counts}</td>
                      <td className="px-2 py-1">{formatDate(item.lastSyncedAt)}</td>
                      <td className="px-2 py-1">{formatAge(item.ageMs)}</td>
                      <td className="px-2 py-1">{formatTtl(item.ttlMs)}</td>
                      <td className="px-2 py-1">{item.lastError ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {optionalItems.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">Optional sources</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-current/20">
                      <th className="px-2 py-1 font-semibold">소스</th>
                      <th className="px-2 py-1 font-semibold">상태</th>
                      <th className="px-2 py-1 font-semibold">건수</th>
                      <th className="px-2 py-1 font-semibold">동기화 시각</th>
                      <th className="px-2 py-1 font-semibold">경과</th>
                      <th className="px-2 py-1 font-semibold">TTL</th>
                      <th className="px-2 py-1 font-semibold">오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionalItems.map((item) => (
                      <tr key={`${item.sourceId}:${item.kind}`} className="border-b border-current/10 last:border-0">
                        <td className="px-2 py-1">{item.label ?? `${item.sourceId} ${item.kind}`}</td>
                        <td className="px-2 py-1">{statusLabel(item.status)}</td>
                        <td className="px-2 py-1">{item.counts}</td>
                        <td className="px-2 py-1">{formatDate(item.lastSyncedAt)}</td>
                        <td className="px-2 py-1">{formatAge(item.ageMs)}</td>
                        <td className="px-2 py-1">{formatTtl(item.ttlMs)}</td>
                        <td className="px-2 py-1">{item.lastError ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      {(error || summary.level === "warn" || summary.level === "error") ? (
        <div className="mt-3 rounded-xl border border-current/25 bg-white/60 p-3 text-xs">
          <p className="font-semibold">권장 액션(수동)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runSmokeSync("manual")}
              disabled={syncing}
              className="rounded-md border border-current/40 bg-white/80 px-3 py-1 font-semibold"
            >
              {syncing ? "스모크 업데이트 중..." : "스모크 업데이트"}
            </button>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={autoSmoke}
                onChange={(event) => setAutoSmoke(event.target.checked)}
              />
              자동 스모크 업데이트(세션당 1회)
            </label>
          </div>
          {syncMessage ? <p className="mt-2 text-emerald-700">{syncMessage}</p> : null}
          {syncError ? <p className="mt-2 text-rose-700">{syncError}</p> : null}
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
{`pnpm live:smoke
pnpm live:sync
pnpm seed:debug`}
          </pre>
          <p className="mt-2">
            상세 상태: <Link href="/debug/unified" className="underline">/debug/unified</Link>
          </p>
        </div>
      ) : null}

      {summary.level === "info" && !error ? (
        <div className="mt-3 rounded-xl border border-current/25 bg-white/60 p-3 text-xs">
          <p className="font-semibold">참고</p>
          <p className="mt-1">핵심(required) 소스는 최신이며, optional 소스는 필요 시 수동 동기화하세요.</p>
          <p className="mt-2">
            상세 상태: <Link href="/debug/unified" className="underline">/debug/unified</Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
