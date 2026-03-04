"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

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

export function NewsTrendsTableClient() {
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
                  </tr>
                </thead>
                <tbody>
                  {data.topics.map((row, index) => (
                    <tr key={`${asString(row.topicId)}-${index}`} className="border-b border-slate-100 text-slate-800">
                      <td className="px-2 py-2">{asString(row.topicLabel) || asString(row.topicId) || "-"}</td>
                      <td className="px-2 py-2">{Number(row.count ?? 0).toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">{asString(row.burstGrade) || "Unknown"}</td>
                      <td className="px-2 py-2">{formatPercent(row.sourceDiversity)}</td>
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
