"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroToggleButtonClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { NewsNavigation } from "./NewsNavigation";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { cn } from "@/lib/utils";

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

function burstLabel(value: string): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "상") return "급증 강함";
  if (normalized === "medium" || normalized === "중") return "급증 보통";
  if (normalized === "low" || normalized === "하") return "급증 약함";
  return "안정";
}

function burstBadgeClass(value: string): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "상") return "bg-rose-50 text-rose-700 border-rose-100";
  if (normalized === "medium" || normalized === "중") return "bg-amber-50 text-amber-700 border-amber-100";
  if (normalized === "low" || normalized === "하") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  return "bg-slate-50 text-slate-500 border-slate-100";
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

  const topicRows = data?.topics ?? [];
  const burstCount = topicRows.filter((row) => {
    const grade = asString(row.burstGrade).toLowerCase();
    return grade === "high" || grade === "medium" || grade === "상" || grade === "중";
  }).length;
  const topTopic = topicRows[0];

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportHeroCard
          kicker="Trend Monitor"
          title="최근 이슈 흐름"
          description="지난 7일 또는 30일 동안 어떤 토픽의 언급이 늘었는지 같은 서식으로 비교해서, 먼저 볼 흐름을 빠르게 추립니다."
          action={(
            <div className="flex items-center bg-white/10 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setWindowDays(7)}
                className={reportHeroToggleButtonClassName(windowDays === 7)}
              >
                7일
              </button>
              <button
                type="button"
                onClick={() => setWindowDays(30)}
                className={reportHeroToggleButtonClassName(windowDays === 30)}
              >
                30일
              </button>
            </div>
          )}
        >
          <NewsNavigation />

          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard
              label="분석된 토픽"
              value={loading ? "-" : `${topicRows.length}개`}
              description={`${windowDays}일간 수집된 전체 토픽`}
            />
            <ReportHeroStatCard
              label="급증 신호 포착"
              value={loading ? "-" : `${burstCount}건`}
              description="중요도 상/중 수준의 급증 토픽"
            />
            <ReportHeroStatCard
              label="최다 언급 토픽"
              value={loading ? "-" : (topTopic?.topicLabel ?? "-")}
              description={topTopic ? `총 ${topTopic.count ?? 0}건 기사 발생` : "가장 많이 보인 토픽"}
            />
          </ReportHeroStatGrid>
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <Card className="rounded-[2rem] lg:rounded-[2.5rem] p-5 lg:p-8 shadow-sm">
          <SubSectionHeader
            title="토픽 비교 분석"
            description="현재 기사 수, 급증 정도, 출처 분산, 최근 추이를 비교합니다."
          />

          {loading ? (
            <p className="text-sm text-slate-500 animate-pulse">불러오는 중...</p>
          ) : !data?.topics?.length ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
              <p className="text-sm font-bold text-slate-900">{errorMessage || "비교할 데이터가 없습니다."}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">기간을 바꾸거나 뉴스 탐색에서 더 넓게 다시 찾아보세요.</p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setWindowDays(windowDays === 7 ? 30 : 7)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                >
                  {windowDays === 7 ? "30일 구간으로 변경" : "7일 구간으로 변경"}
                </button>
                <Link href="/planning/v3/news/explore" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                  뉴스 탐색으로 이동
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mobile Card List View */}
              <div className="grid grid-cols-1 gap-4 lg:hidden">
                {data.topics.map((row, index) => (
                  <Link
                    key={`mobile-${asString(row.topicId)}-${index}`}
                    href={`/planning/v3/news/explore?topics=${row.topicId}`}
                    className="block group rounded-2xl border border-slate-100 bg-white p-4 hover:border-emerald-200 hover:bg-emerald-50/20 transition-all shadow-sm active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-900 tracking-tight leading-tight">{asString(row.topicLabel) || asString(row.topicId) || "-"}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{asString(row.topicId)}</p>
                      </div>
                      <span className={cn("shrink-0 inline-block rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", burstBadgeClass(asString(row.burstGrade)))}>
                        {burstLabel(asString(row.burstGrade))}
                      </span>
                    </div>

                    <div className="mt-4 h-12 w-full">
                      {!row.series?.length ? (
                        <div className="h-full flex items-center justify-center border border-dashed border-slate-100 rounded-lg">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">데이터 없음</span>
                        </div>
                      ) : (
                        <svg viewBox="0 0 240 56" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                          <polyline
                            points={buildPolylinePoints(row.series)}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="text-emerald-500"
                          />
                          {(row.series ?? []).map((point, pointIndex, arr) => {
                            if (point.hasBurstMarker !== true) return null;
                            const maxValue = maxSeriesValue(arr);
                            const x = arr.length === 1 ? 0 : Math.round((pointIndex / (arr.length - 1)) * 240);
                            const y = Math.round(56 - ((Number(point.count ?? 0) / maxValue) * 56));
                            return (
                              <circle
                                key={`m-p-${asString(point.date)}-${pointIndex}`}
                                cx={x}
                                cy={Math.max(0, Math.min(56, y))}
                                r="5"
                                className="fill-amber-500 stroke-white stroke-2"
                              />
                            );
                          })}
                        </svg>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-50 pt-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">기사 수</p>
                        <p className="mt-0.5 text-sm font-black text-slate-700 tabular-nums">
                          {Number(row.count ?? 0).toLocaleString("ko-KR")}
                          <span className="ml-0.5 text-[10px] text-slate-400 font-bold">건</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">출처 다양성</p>
                        <p className="mt-0.5 text-sm font-black text-slate-700 tabular-nums">
                          {formatPercent(row.sourceDiversity)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto -mx-2 px-2">
                <table className="min-w-full text-sm border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-2">토픽</th>
                      <th className="px-4 py-2 text-right">기사 수</th>
                      <th className="px-4 py-2 text-center">버스트 등급</th>
                      <th className="px-4 py-2 text-right">출처 다양성</th>
                      <th className="px-4 py-2">최근 추이 ({windowDays === 7 ? "7D" : "30D"})</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-2">
                    {data.topics.map((row, index) => (
                      <tr key={`${asString(row.topicId)}-${index}`} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-4 rounded-l-2xl border-y border-l border-slate-100 bg-white group-hover:bg-slate-50/50 transition-colors">
                          <p className="font-black text-slate-900 tracking-tight leading-tight">{asString(row.topicLabel) || asString(row.topicId) || "-"}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{asString(row.topicId)}</p>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100 bg-white text-right tabular-nums font-bold text-slate-700 group-hover:bg-slate-50/50 transition-colors">
                          {Number(row.count ?? 0).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100 bg-white text-center group-hover:bg-slate-50/50 transition-colors">
                          <span className={cn("inline-block rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider tabular-nums", burstBadgeClass(asString(row.burstGrade)))}>
                            {burstLabel(asString(row.burstGrade))}
                          </span>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100 bg-white text-right tabular-nums font-bold text-slate-700 group-hover:bg-slate-50/50 transition-colors">
                          {formatPercent(row.sourceDiversity)}
                        </td>
                        <td className="px-4 py-4 rounded-r-2xl border-y border-r border-slate-100 bg-white group-hover:bg-slate-50/50 transition-colors">
                          {!row.series?.length ? (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">데이터 없음</span>
                          ) : (
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-48 shrink-0">
                                <svg viewBox="0 0 240 56" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                                  <polyline
                                    points={buildPolylinePoints(row.series)}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    className="text-emerald-500"
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
                                        r="4"
                                        className="fill-amber-500 stroke-white stroke-2"
                                      />
                                    );
                                  })}
                                </svg>
                              </div>
                              <Link href={`/planning/v3/news/explore?topics=${row.topicId}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest whitespace-nowrap">탐색 ▶</Link>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
