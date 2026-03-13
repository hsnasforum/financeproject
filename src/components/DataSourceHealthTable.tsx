"use client";

import { useEffect, useState } from "react";
import {
  buildDataSourceImpactOperatorCardSummaries,
  type DataSourceImpactHealthSummary,
  type DataSourceImpactOperatorCardSummary,
  type DataSourceImpactReadOnlyHealth,
} from "@/lib/dataSources/impactHealth";

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
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">Fallback/쿨다운 진단</p>
        {opendartConfigured !== null ? (
          <p className="mt-1 text-xs text-slate-600">opendartConfigured: {opendartConfigured ? "yes" : "no"}</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          `replayEnabled`는 최근 스냅샷 재생 가능 상태를 뜻하며, live upstream 성공과 같은 의미는 아닙니다. 일부 ping은 fallback/mock으로 200을 반환할 수 있습니다.
        </p>
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
        <p className="text-sm font-semibold text-slate-800">사용자 도움 카드 기준 요약</p>
        <p className="mt-1 text-xs text-slate-500">
          health API가 카드에 주입하는 read-only 최신 기준과 최근 집계 시각을 함께 보여줍니다.
        </p>
        {impactCards.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">카드 기준 요약이 없습니다.</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {impactCards.map((card: DataSourceImpactOperatorCardSummary) => {
              const { cardId, healthSummary, label, readOnly } = card;
              return (
                <div
                  key={cardId}
                  className="rounded-xl border border-slate-200 bg-white/90 p-3"
                  data-testid={`data-source-impact-meta-${cardId}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900">{label}</p>
                    {readOnly ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${readOnly.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                        {readOnly.statusLabel}
                      </span>
                    ) : null}
                  </div>
                  {readOnly ? (
                    <>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{readOnly.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{readOnly.description}</p>
                      {readOnly.checkedAt ? (
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          {(readOnly.checkedAtLabel ?? "기준 확인")} {formatDateTime(readOnly.checkedAt)}
                        </p>
                      ) : null}
                      {readOnly.details.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {readOnly.details.map((detail) => (
                            <span
                              key={`${cardId}-${detail.label}-${detail.value}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
                            >
                              {detail.label} {formatDateTime(detail.value)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">read-only 최신 기준이 아직 없습니다.</p>
                  )}
                  {healthSummary ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">health API 집계</p>
                      <p className="mt-1 text-[11px] text-slate-500">최근 집계 {formatDateTime(healthSummary.latestCheckedAt)}</p>
                      <div className="mt-2 space-y-2">
                        {healthSummary.items.map((item) => (
                          <div key={`${cardId}-${item.label}`} className="rounded-lg border border-white bg-white px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.statusLabel === "주의" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                                {item.statusLabel}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{item.summaryText}</p>
                            {item.checkedAt ? (
                              <p className="mt-1 text-[11px] text-slate-500">항목 확인 {formatDateTime(item.checkedAt)}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
