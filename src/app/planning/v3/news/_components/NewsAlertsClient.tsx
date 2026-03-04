"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

type AlertLevel = "high" | "medium" | "low";

type AlertEvent = {
  id: string;
  createdAt: string;
  dayKst: string;
  source: "news:refresh" | "indicators:refresh";
  ruleId: string;
  ruleKind: "topic_burst" | "indicator";
  level: AlertLevel;
  title: string;
  summary: string;
  targetType: "topic" | "item" | "scenario" | "series";
  targetId: string;
  link?: string;
};

type AlertGroup = {
  dayKst: string;
  events: AlertEvent[];
};

type AlertsResponse = {
  ok?: boolean;
  data?: {
    days?: number;
    total?: number;
    groups?: AlertGroup[];
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function levelBadgeClass(level: AlertLevel): string {
  if (level === "high") return "bg-rose-100 text-rose-700";
  if (level === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function levelLabel(level: AlertLevel): string {
  if (level === "high") return "상";
  if (level === "medium") return "중";
  return "하";
}

function ruleKindLabel(value: AlertEvent["ruleKind"]): string {
  if (value === "topic_burst") return "토픽 급증";
  return "지표 변화";
}

function sourceLabel(value: AlertEvent["source"]): string {
  if (value === "news:refresh") return "뉴스 갱신";
  return "지표 갱신";
}

function targetTypeLabel(value: AlertEvent["targetType"]): string {
  if (value === "topic") return "토픽";
  if (value === "item") return "기사";
  if (value === "scenario") return "시나리오";
  return "지표";
}

function formatAlertSummary(value: string): string {
  const text = asString(value);
  if (!text) return "-";

  const topicMatch = text.match(/today\s*=\s*([^,\s]+)\s*,\s*delta\s*=\s*([^,\s]+)\s*,\s*ratio\s*=\s*([^,\s]+)\s*,\s*z\s*=\s*([^,\s]+)/i);
  if (topicMatch) {
    const today = topicMatch[1];
    const delta = topicMatch[2];
    const ratio = topicMatch[3];
    const z = topicMatch[4];
    return `당일 기사 수 ${today}건 · 전일 대비 ${delta}건 · 증가 배율 ${ratio}배 · 급증 지수 ${z}`;
  }

  const indicatorMatch = text.match(/^(.+?)\s*,\s*condition\s*=\s*([^,\s]+)\s*,\s*asOf\s*=\s*(.+)$/i);
  if (indicatorMatch) {
    const metric = indicatorMatch[1]?.trim() ?? "";
    const conditionRaw = indicatorMatch[2]?.trim().toLowerCase() ?? "";
    const condition = conditionRaw === "up"
      ? "상승"
      : conditionRaw === "down"
        ? "하락"
        : conditionRaw === "high"
          ? "고점권"
          : conditionRaw === "low"
            ? "저점권"
            : conditionRaw === "flat"
              ? "횡보"
              : conditionRaw === "unknown"
                ? "데이터 부족"
                : conditionRaw;
    const asOf = indicatorMatch[3]?.trim() ?? "-";
    return `${metric} · 조건 ${condition} 충족 · 기준일 ${asOf}`;
  }

  return text;
}

function isInternalLink(link: string): boolean {
  return link.startsWith("/");
}

export function NewsAlertsClient() {
  const [days, setDays] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [groups, setGroups] = useState<AlertGroup[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (windowDays: 7 | 30) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/planning/v3/news/alerts?days=${windowDays}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as AlertsResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setGroups(payload.data.groups ?? []);
      setTotal(Math.max(0, Number(payload.data.total ?? 0)));
    } catch (error) {
      setGroups([]);
      setTotal(0);
      setErrorMessage(error instanceof Error ? error.message : "알림함 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const dayCount = useMemo(() => groups.length, [groups]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 뉴스 알림함</h1>
              <p className="text-sm text-slate-600">토픽 급증 + 지표 변화 감지 로컬 알림함</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                다이제스트
              </Link>
              <Link href="/planning/v3/news/trends" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                트렌드
              </Link>
              <Link href="/planning/v3/news/explore" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                탐색
              </Link>
              <button
                type="button"
                onClick={() => setDays(7)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${days === 7 ? "bg-emerald-100 text-emerald-800" : "border border-slate-300 text-slate-700"}`}
              >
                7일
              </button>
              <button
                type="button"
                onClick={() => setDays(30)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${days === 30 ? "bg-emerald-100 text-emerald-800" : "border border-slate-300 text-slate-700"}`}
              >
                30일
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">최근 {days}일 · 이벤트 {total}건 · 날짜 {dayCount}일</p>
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">알림 이벤트</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : groups.length < 1 ? (
            <p className="text-sm text-slate-600">최근 조건 충족 이벤트가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.dayKst} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-black text-slate-900">{group.dayKst}</p>
                  <ul className="mt-2 space-y-2">
                    {group.events.map((event) => (
                      <li key={event.id} className="rounded-md border border-slate-200 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${levelBadgeClass(event.level)}`}>
                            {levelLabel(event.level)}
                          </span>
                          <span className="text-xs text-slate-500">{ruleKindLabel(event.ruleKind)} · {sourceLabel(event.source)}</span>
                          <span className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{event.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{formatAlertSummary(event.summary)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">대상: {targetTypeLabel(event.targetType)} / {event.targetId}</p>
                        {event.link ? (
                          isInternalLink(event.link) ? (
                            <Link href={event.link} className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline underline-offset-2">
                              관련 보기
                            </Link>
                          ) : (
                            <a href={event.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline underline-offset-2">
                              관련 보기
                            </a>
                          )
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
