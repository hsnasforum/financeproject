"use client";

import { useEffect, useState } from "react";
import {
  buildDataSourceImpactOperatorCardSummaries,
  type DataSourceImpactHealthSummary,
  type DataSourceImpactOperatorCardSummary,
  type DataSourceImpactReadOnlyHealth,
} from "@/lib/dataSources/impactHealth";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

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
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

export function DataSourceHealthTable() {
  const [rows, setRows] = useState<SourceHealthRow[] | null>(null);
  const [opendartConfigured, setOpendartConfigured] = useState<boolean | null>(null);
  const [impactHealthByCardId, setImpactHealthByCardId] = useState<Partial<Record<string, DataSourceImpactHealthSummary>>>({});
  const [impactReadOnlyByCardId, setImpactReadOnlyByCardId] = useState<Partial<Record<string, DataSourceImpactReadOnlyHealth>>>({});
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
          setImpactHealthByCardId(typeof json?.meta?.impactHealthByCardId === "object" && json.meta.impactHealthByCardId
            ? json.meta.impactHealthByCardId as Partial<Record<string, DataSourceImpactHealthSummary>>
            : {});
          setImpactReadOnlyByCardId(typeof json?.meta?.impactReadOnlyByCardId === "object" && json.meta.impactReadOnlyByCardId
            ? json.meta.impactReadOnlyByCardId as Partial<Record<string, DataSourceImpactReadOnlyHealth>>
            : {});
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setRows(null);
          setOpendartConfigured(null);
          setImpactHealthByCardId({});
          setImpactReadOnlyByCardId({});
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

  const impactCards = buildDataSourceImpactOperatorCardSummaries({
    impactHealthByCardId,
    impactReadOnlyByCardId,
  });

  return (
    <div className="mt-8 space-y-8">
      <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
        <SubSectionHeader title="Fallback & 쿨다운 진단" description="최근 데이터 재생 상태와 재시도 대기 시점을 확인합니다." />
        {opendartConfigured !== null ? (
          <p className="mt-1 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">OpenDART Configured: {opendartConfigured ? "YES" : "NO"}</p>
        ) : null}
        
        {error ? <p className="text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl mb-4">{error}</p> : null}
        
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="min-w-full text-sm border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Configured</th>
                <th className="px-4 py-2">Replay</th>
                <th className="px-4 py-2">Next Retry</th>
                <th className="px-4 py-2">Last Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={5} className="p-8 text-center text-xs font-bold text-slate-400 animate-pulse">진단 로딩 중...</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.sourceKey} className="group transition-colors">
                    <td className="px-4 py-4 rounded-l-2xl border-y border-l border-slate-100 bg-slate-50/50 font-black text-slate-900">{row.sourceKey}</td>
                    <td className="px-4 py-4 border-y border-slate-100 bg-slate-50/50">
                      <span className={cn("inline-flex rounded-lg px-2 py-0.5 text-[10px] font-black", row.configured ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                        {row.configured ? "YES" : "NO"}
                      </span>
                    </td>
                    <td className="px-4 py-4 border-y border-slate-100 bg-slate-50/50">
                      <span className={cn("inline-flex rounded-lg px-2 py-0.5 text-[10px] font-black", row.replayEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                        {row.replayEnabled ? "YES" : "NO"}
                      </span>
                    </td>
                    <td className="px-4 py-4 border-y border-slate-100 bg-slate-50/50 tabular-nums text-xs font-bold text-slate-500">{formatDateTime(row.cooldownNextRetryAt)}</td>
                    <td className="px-4 py-4 rounded-r-2xl border-y border-r border-slate-100 bg-slate-50/50 tabular-nums text-xs font-bold text-slate-500">{formatDateTime(row.lastSnapshotGeneratedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
        <SubSectionHeader title="사용자 도움 기준 요약" description="Health API가 사용자 인터페이스에 주입하는 최신 데이터 집계 상태입니다." />
        
        {impactCards.length === 0 ? (
          <div className="py-12 text-center rounded-3xl border border-dashed border-slate-200">
            <p className="text-sm font-black text-slate-300">집계된 카드 요약 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {impactCards.map((card: DataSourceImpactOperatorCardSummary) => {
              const { cardId, healthSummary, label, readOnly } = card;
              return (
                <div key={cardId} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex flex-col" data-testid={`data-source-impact-meta-${cardId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <p className="text-sm font-black text-slate-900 tracking-tight">{label}</p>
                    {readOnly && (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", readOnly.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700 border border-emerald-100")}>
                        {readOnly.statusLabel}
                      </span>
                    )}
                  </div>
                  
                  {readOnly ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{readOnly.title}</p>
                      <p className="text-xs font-bold text-slate-600 leading-relaxed">{readOnly.description}</p>
                      <p className="text-[10px] font-bold text-slate-400 tabular-nums">{(readOnly.checkedAtLabel ?? "확인 시각")} {formatDateTime(readOnly.checkedAt)}</p>
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-slate-300 italic">Read-only 최신 기준 없음</p>
                  )}

                  {healthSummary && (
                    <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-inner">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">health API 집계</p>
                        <p className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(healthSummary.latestCheckedAt)}</p>
                      </div>
                      <div className="space-y-3">
                        {healthSummary.items.map((item) => (
                          <div key={`${cardId}-${item.label}`} className="rounded-xl bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-[11px] font-black text-slate-700">{item.label}</p>
                              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest", item.statusLabel === "주의" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500")}>
                                {item.statusLabel}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 leading-relaxed">{item.summaryText}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
        <SubSectionHeader title="최근 오류 로그" description="시스템에서 발생한 최근 20건의 API 오류를 분석합니다." />
        
        {recentErrorsError ? <p className="text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl mb-4">{recentErrorsError}</p> : null}
        
        <div className="overflow-x-auto -mx-2 px-2 mt-6">
          <table className="min-w-full text-[11px] border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left font-black uppercase tracking-widest text-slate-400">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Trace ID</th>
              </tr>
            </thead>
            <tbody>
              {!recentErrors ? (
                <tr><td colSpan={7} className="p-8 text-center font-bold text-slate-400 animate-pulse">오류 로딩 중...</td></tr>
              ) : recentErrors.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center font-bold text-slate-300 italic">기록된 오류가 없습니다.</td></tr>
              ) : (
                recentErrors.map((row) => (
                  <tr key={`${row.time}:${row.traceId}:${row.route}:${row.code}`} className="group align-top">
                    <td className="px-3 py-3 border-y border-l border-slate-100 bg-white tabular-nums text-slate-500 whitespace-nowrap">{formatDateTime(row.time)}</td>
                    <td className="px-3 py-3 border-y border-slate-100 bg-white font-black text-slate-700">{row.source || "-"}</td>
                    <td className="px-3 py-3 border-y border-slate-100 bg-white font-bold text-slate-500 whitespace-nowrap">{row.route || "-"}</td>
                    <td className="px-3 py-3 border-y border-slate-100 bg-white"><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{row.code}</span></td>
                    <td className="px-3 py-3 border-y border-slate-100 bg-white font-black text-rose-600">{row.status}</td>
                    <td className="px-3 py-3 border-y border-slate-100 bg-white max-w-[20rem] font-medium text-slate-600 whitespace-normal break-words leading-relaxed">{row.message || "-"}</td>
                    <td className="px-3 py-3 rounded-r-2xl border-y border-r border-slate-100 bg-white">
                      <div className="flex items-center gap-2">
                        <code className="max-w-[8rem] truncate rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                          {row.traceId || "-"}
                        </code>
                        {row.traceId ? (
                          <button
                            type="button"
                            onClick={() => void copyTraceId(row.traceId)}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-colors"
                          >
                            {copiedTraceId === row.traceId ? "Copied" : "Copy"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
