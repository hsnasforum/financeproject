"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { type TopicTrendsArtifact } from "@/lib/news/types";

type TrendsResponse = {
  ok?: boolean;
  data?: TopicTrendsArtifact | null;
  windowDays?: number;
  error?: {
    code?: string;
    message?: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asWindow(value: 7 | 30 | number): 7 | 30 {
  return value === 30 ? 30 : 7;
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function NewsTrendsClient() {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<TopicTrendsArtifact | null>(null);

  const load = useCallback(async (windowArg: 7 | 30) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/planning/v3/news/trends?window=${windowArg}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as TrendsResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setData(payload?.data ?? null);
      setWindowDays(asWindow(payload?.windowDays ?? windowArg));
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

  const maxCount = useMemo(() => {
    const counts = data?.topics?.flatMap((row) => row.series.map((point) => point.count)) ?? [];
    return Math.max(1, ...counts, 1);
  }, [data]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Trends</h1>
              <p className="text-sm text-slate-600">7~30일 토픽 트렌드 및 버스트 점검</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                Digest로
              </Link>
              <Link href="/planning/v3/news/explore" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                탐색
              </Link>
              <Link href="/planning/v3/news/alerts" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                알림함
              </Link>
              <Link href="/planning/v3/news/settings" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                설정
              </Link>
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
          <p className="text-xs text-slate-500">마지막 생성 시각: {formatDateTime(data?.generatedAt)}</p>
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Burst Topics</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : !data?.burstTopics?.length ? (
            <p className="text-sm text-slate-600">급증 토픽 없음</p>
          ) : (
            <ul className="space-y-2">
              {data.burstTopics.map((row) => (
                <li key={row.topicId} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{row.topicLabel} ({row.burstLevel})</p>
                  <p className="text-xs text-slate-600">
                    당일 기사 수 {row.todayCount.toLocaleString("ko-KR")}건 · 전일 대비 {row.delta.toLocaleString("ko-KR")}건 ·
                    증가 배율 {row.ratio.toFixed(2)}배 · 급증 지수 {row.burstZ.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Topic Series</h2>
          {!data?.topics?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {data.topics.slice(0, 12).map((topic) => (
                <div key={topic.topicId} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{topic.topicLabel}</p>
                    <p className="text-xs text-slate-600">
                      당일 기사 수 {topic.todayCount.toLocaleString("ko-KR")}건 · 출처 다양도 {formatPercent(topic.sourceDiversity)} ·
                      상위 출처 점유율 {formatPercent(topic.topSourceShare)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {topic.series.map((point) => (
                      <div key={`${topic.topicId}-${point.date}`} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 text-slate-500">{point.date.slice(5)}</span>
                        <div className="h-2 flex-1 rounded bg-slate-100">
                          <div
                            className="h-2 rounded bg-emerald-500"
                            style={{ width: `${Math.max(2, (point.count / maxCount) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-slate-700">{point.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
