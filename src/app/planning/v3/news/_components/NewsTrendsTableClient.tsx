"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";

type NewsTrendsTableClientProps = {
  csrf?: string;
};

type TrendsResponse = {
  ok?: boolean;
  windowDays?: number;
  data?: {
    date?: string;
    topics?: Array<{
      topicId?: string;
      topicLabel?: string;
      count?: number;
      burstGrade?: string;
      sourceDiversity?: number;
      series?: Array<{
        date?: string;
        count?: number;
        burstGrade?: string;
        hasBurstMarker?: boolean;
      }>;
    }>;
  } | null;
  error?: { message?: string };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatPercent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${(number * 100).toFixed(1)}%`;
}

function maxSeriesValue(series: Array<{ count?: number }> | undefined): number {
  const values = (series ?? []).map((row) => Number(row.count ?? 0)).filter((row) => Number.isFinite(row));
  return Math.max(1, ...values, 1);
}

function buildPolylinePoints(series: Array<{ count?: number }> | undefined): string {
  const rows = series ?? [];
  if (rows.length < 1) return "";
  const maxValue = maxSeriesValue(rows);
  const width = 240;
  const height = 56;
  return rows.map((row, index) => {
    const x = rows.length === 1 ? 0 : Math.round((index / (rows.length - 1)) * width);
    const y = Math.round(height - ((Number(row.count ?? 0) / maxValue) * height));
    return `${x},${Math.max(0, Math.min(height, y))}`;
  }).join(" ");
}

export function NewsTrendsTableClient({ csrf }: NewsTrendsTableClientProps) {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<TrendsResponse["data"]>(null);

  const load = useCallback(async (windowArg: 7 | 30) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/planning/v3/news/trends?window=${windowArg}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as TrendsResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setData(payload.data ?? null);
      setWindowDays(payload?.windowDays === 30 ? 30 : 7);
    } catch (error) {
      setData(null);
      setErrorMessage(error instanceof Error ? error.message : "트렌드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(windowDays);
  }, [load, windowDays]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Trends</h1>
              <p className="text-sm text-slate-600">토픽/기간 기준 동향 요약</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">Digest</Link>
              <button
                type="button"
                onClick={() => setWindowDays(7)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${windowDays === 7 ? "bg-emerald-100 text-emerald-800" : "border border-slate-300 text-slate-700"}`}
              >
                7일
              </button>
              <button
                type="button"
                onClick={() => setWindowDays(30)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${windowDays === 30 ? "bg-emerald-100 text-emerald-800" : "border border-slate-300 text-slate-700"}`}
              >
                30일
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">기준일: {asString(data?.date) || "-"}</p>
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <WeeklyPlanPanel csrf={csrf} />

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Topic Table</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : !data?.topics?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2">토픽</th>
                    <th className="px-2 py-2">기사 수</th>
                    <th className="px-2 py-2">버스트 등급</th>
                    <th className="px-2 py-2">출처 다양성</th>
                    <th className="px-2 py-2">추이(버스트 마커)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topics.map((row, index) => (
                    <tr key={`${asString(row.topicId)}-${index}`} className="border-b border-slate-100 text-slate-800">
                      <td className="px-2 py-2">{asString(row.topicLabel) || asString(row.topicId) || "-"}</td>
                      <td className="px-2 py-2">{Number(row.count ?? 0).toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">{asString(row.burstGrade) || "Unknown"}</td>
                      <td className="px-2 py-2">{formatPercent(row.sourceDiversity)}</td>
                      <td className="px-2 py-2">
                        {!row.series?.length ? (
                          <span className="text-xs text-slate-500">-</span>
                        ) : (
                          <svg viewBox="0 0 240 56" className="h-14 w-60">
                            <polyline
                              points={buildPolylinePoints(row.series)}
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="2"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                            {(row.series ?? []).map((point, pointIndex, arr) => {
                              if (point.hasBurstMarker !== true) return null;
                              const maxValue = maxSeriesValue(arr);
                              const x = arr.length === 1 ? 0 : Math.round((pointIndex / (arr.length - 1)) * 240);
                              const y = Math.round(56 - ((Number(point.count ?? 0) / maxValue) * 56));
                              return (
                                <circle
                                  key={`${asString(point.date)}-${pointIndex}`}
                                  cx={x}
                                  cy={Math.max(0, Math.min(56, y))}
                                  r="3"
                                  fill="#f59e0b"
                                  stroke="#fff"
                                  strokeWidth="1"
                                />
                              );
                            })}
                          </svg>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
