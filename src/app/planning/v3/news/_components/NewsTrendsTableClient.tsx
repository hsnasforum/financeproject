"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import {
  reportHeroActionLinkClassName,
  reportHeroToggleButtonClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
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

function burstLabel(value: string): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "상") return "급증 강함";
  if (normalized === "medium" || normalized === "중") return "급증 보통";
  if (normalized === "low" || normalized === "하") return "급증 약함";
  return "안정";
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
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Trend Monitor"
          title="최근 이슈 흐름"
          description="지난 7일 또는 30일 동안 어떤 토픽의 언급이 늘었는지 같은 서식으로 비교해서, 먼저 볼 흐름을 빠르게 추립니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>오늘 브리핑</Link>
              <Link href="/planning/v3/news/explore" className={reportHeroActionLinkClassName}>뉴스 탐색</Link>
              <Link href="/planning/v3/news/alerts" className={reportHeroActionLinkClassName}>중요 알림</Link>
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
            </>
          )}
        >
          <p className="text-xs text-white/60">기준일: {asString(data?.date) || "-"}</p>
          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard label="급증 흐름" value={loading ? "-" : `${burstCount}개`} description="지금 특히 빠르게 언급이 늘어난 토픽" />
            <ReportHeroStatCard label="비교 토픽" value={loading ? "-" : `${topicRows.length}개`} description={`${windowDays}일 구간에서 비교한 토픽 수`} />
            <ReportHeroStatCard label="먼저 볼 흐름" value={asString(topTopic?.topicLabel) || "-"} description="당일 기사 수가 가장 많은 토픽" />
          </ReportHeroStatGrid>
          {errorMessage ? <p className="text-xs font-semibold text-rose-300">{errorMessage}</p> : null}
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">토픽 비교표</h2>
            <p className="text-xs text-slate-500">왼쪽부터 이름, 현재 기사 수, 급증 정도, 출처 분산, 최근 추이를 순서대로 보여줍니다.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : !data?.topics?.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">비교할 데이터가 없습니다.</p>
              <p className="mt-1 text-xs text-slate-600">기간을 바꾸거나 뉴스 탐색에서 더 넓은 조건으로 다시 찾아보세요.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWindowDays(windowDays === 7 ? 30 : 7)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  {windowDays === 7 ? "30일로 다시 보기" : "7일로 다시 보기"}
                </button>
                <Link href="/planning/v3/news/explore" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                  뉴스 탐색으로 이동
                </Link>
              </div>
            </div>
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
                      <td className="px-2 py-2">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900">{asString(row.topicLabel) || asString(row.topicId) || "-"}</p>
                          <p className="text-[11px] text-slate-500">{burstLabel(asString(row.burstGrade))}</p>
                        </div>
                      </td>
                      <td className="px-2 py-2">{Number(row.count ?? 0).toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">{burstLabel(asString(row.burstGrade))}</td>
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
