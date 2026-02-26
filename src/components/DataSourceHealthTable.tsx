"use client";

import { useEffect, useState } from "react";

type SourceHealthRow = {
  sourceKey: string;
  configured: boolean;
  replayEnabled: boolean;
  cooldownNextRetryAt: string | null;
  lastSnapshotGeneratedAt: string | null;
};

type RecentErrorRow = {
  time: string;
  traceId: string;
  route: string;
  source: string;
  code: string;
  message: string;
  status: number;
  elapsedMs: number;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

export function DataSourceHealthTable() {
  const [rows, setRows] = useState<SourceHealthRow[] | null>(null);
  const [opendartConfigured, setOpendartConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [recentErrors, setRecentErrors] = useState<RecentErrorRow[] | null>(null);
  const [recentErrorsError, setRecentErrorsError] = useState("");
  const [copiedTraceId, setCopiedTraceId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/dev/data-sources/health", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok || !Array.isArray(json?.data)) {
          throw new Error(json?.error?.message ?? "진단 정보를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setRows(json.data as SourceHealthRow[]);
          setOpendartConfigured(typeof json?.meta?.opendartConfigured === "boolean" ? json.meta.opendartConfigured : null);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setRows(null);
          setOpendartConfigured(null);
          setError(e instanceof Error ? e.message : "진단 정보를 불러오지 못했습니다.");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/dev/errors/recent?limit=20", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok || !Array.isArray(json?.data)) {
          throw new Error(json?.error?.message ?? "최근 오류를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setRecentErrors(json.data as RecentErrorRow[]);
          setRecentErrorsError("");
        }
      } catch (e) {
        if (!cancelled) {
          setRecentErrors(null);
          setRecentErrorsError(e instanceof Error ? e.message : "최근 오류를 불러오지 못했습니다.");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyTraceId(traceId: string) {
    if (!traceId || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(traceId);
      setCopiedTraceId(traceId);
    } catch {
      setCopiedTraceId("");
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">Fallback/쿨다운 진단</p>
        {opendartConfigured !== null ? (
          <p className="mt-1 text-xs text-slate-600">opendartConfigured: {opendartConfigured ? "yes" : "no"}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-amber-700">{error}</p> : null}
        {!rows ? (
          <p className="mt-2 text-xs text-slate-500">진단 로딩 중...</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-1">source</th>
                  <th className="px-2 py-1">configured</th>
                  <th className="px-2 py-1">replayEnabled</th>
                  <th className="px-2 py-1">cooldownNextRetryAt</th>
                  <th className="px-2 py-1">lastSnapshotGeneratedAt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sourceKey} className="border-b border-slate-100">
                    <td className="px-2 py-1 font-medium text-slate-900">{row.sourceKey}</td>
                    <td className="px-2 py-1">{row.configured ? "yes" : "no"}</td>
                    <td className="px-2 py-1">{row.replayEnabled ? "yes" : "no"}</td>
                    <td className="px-2 py-1">{formatDateTime(row.cooldownNextRetryAt)}</td>
                    <td className="px-2 py-1">{formatDateTime(row.lastSnapshotGeneratedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">최근 오류</p>
        <p className="mt-1 text-xs text-slate-500">최근 API 오류 20건을 표시합니다.</p>
        {recentErrorsError ? <p className="mt-2 text-xs text-amber-700">{recentErrorsError}</p> : null}
        {!recentErrors ? (
          <p className="mt-2 text-xs text-slate-500">최근 오류 로딩 중...</p>
        ) : recentErrors.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">최근 오류가 없습니다.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-1">time</th>
                  <th className="px-2 py-1">source</th>
                  <th className="px-2 py-1">route</th>
                  <th className="px-2 py-1">code</th>
                  <th className="px-2 py-1">status</th>
                  <th className="px-2 py-1">elapsedMs</th>
                  <th className="px-2 py-1">message</th>
                  <th className="px-2 py-1">traceId</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((row) => (
                  <tr key={`${row.time}:${row.traceId}:${row.route}:${row.code}`} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-1 whitespace-nowrap">{formatDateTime(row.time)}</td>
                    <td className="px-2 py-1">{row.source || "-"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{row.route || "-"}</td>
                    <td className="px-2 py-1">{row.code}</td>
                    <td className="px-2 py-1">{row.status}</td>
                    <td className="px-2 py-1">{row.elapsedMs}</td>
                    <td className="px-2 py-1 max-w-[28rem] whitespace-normal break-words">{row.message || "-"}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-2">
                        <code className="max-w-[10rem] truncate rounded bg-white px-1 py-0.5 text-[11px] text-slate-700">
                          {row.traceId || "-"}
                        </code>
                        {row.traceId ? (
                          <button
                            type="button"
                            onClick={() => {
                              void copyTraceId(row.traceId);
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                          >
                            {copiedTraceId === row.traceId ? "복사됨" : "복사"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
