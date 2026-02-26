"use client";

import { useEffect, useState } from "react";

type SourceHealthRow = {
  sourceKey: string;
  configured: boolean;
  replayEnabled: boolean;
  cooldownNextRetryAt: string | null;
  lastSnapshotGeneratedAt: string | null;
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

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
  );
}
