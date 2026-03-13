"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import {
  reportHeroActionLinkClassName,
  reportHeroFilterChipClassName,
  reportHeroToggleButtonClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type NewsAlertsClientProps = {
  csrf?: string;
};

type AlertLevel = "high" | "medium" | "low";
type AlertStateAction = "ack" | "unack" | "hide" | "unhide";

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
  state?: {
    acknowledgedAt?: string | null;
    hiddenAt?: string | null;
  };
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
    summary?: {
      highTotal?: number;
      visibleTotal?: number;
      pendingTotal?: number;
      acknowledgedTotal?: number;
      hiddenTotal?: number;
      latestVisibleTitle?: string | null;
      latestVisibleCreatedAt?: string | null;
    } | null;
    groups?: AlertGroup[];
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type AlertLevelFilter = "all" | AlertLevel;
type AlertSourceFilter = "all" | AlertEvent["source"];
type AlertStatusFilter = "visible" | "pending" | "acknowledged" | "hidden";
type AlertSummary = {
  highTotal: number;
  visibleTotal: number;
  pendingTotal: number;
  acknowledgedTotal: number;
  hiddenTotal: number;
  latestVisibleTitle: string | null;
  latestVisibleCreatedAt: string | null;
};

export const NEWS_ALERT_RULES_SETTINGS_HREF = "/planning/v3/news/settings#news-settings-alert-rules";

function emptySummary(): AlertSummary {
  return {
    highTotal: 0,
    visibleTotal: 0,
    pendingTotal: 0,
    acknowledgedTotal: 0,
    hiddenTotal: 0,
    latestVisibleTitle: null,
    latestVisibleCreatedAt: null,
  };
}

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

function buildAlertLead(event: AlertEvent): string {
  const level = levelLabel(event.level);
  const kind = ruleKindLabel(event.ruleKind);
  const source = sourceLabel(event.source);
  return `중요도 ${level} · ${kind} · ${source}`;
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

function isAcknowledged(event: AlertEvent): boolean {
  return asString(event.state?.acknowledgedAt).length > 0;
}

function isHidden(event: AlertEvent): boolean {
  return asString(event.state?.hiddenAt).length > 0;
}

export function NewsAlertsClient({ csrf }: NewsAlertsClientProps) {
  const [days, setDays] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [groups, setGroups] = useState<AlertGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<AlertSummary>(() => emptySummary());
  const [levelFilter, setLevelFilter] = useState<AlertLevelFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<AlertSourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("visible");
  const [savingEventId, setSavingEventId] = useState("");

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
      setSummary({
        highTotal: Math.max(0, Number(payload.data.summary?.highTotal ?? 0)),
        visibleTotal: Math.max(0, Number(payload.data.summary?.visibleTotal ?? 0)),
        pendingTotal: Math.max(0, Number(payload.data.summary?.pendingTotal ?? 0)),
        acknowledgedTotal: Math.max(0, Number(payload.data.summary?.acknowledgedTotal ?? 0)),
        hiddenTotal: Math.max(0, Number(payload.data.summary?.hiddenTotal ?? 0)),
        latestVisibleTitle: asString(payload.data.summary?.latestVisibleTitle) || null,
        latestVisibleCreatedAt: asString(payload.data.summary?.latestVisibleCreatedAt) || null,
      });
    } catch (error) {
      setGroups([]);
      setTotal(0);
      setSummary(emptySummary());
      setErrorMessage(error instanceof Error ? error.message : "알림함 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const dayCount = useMemo(() => groups.length, [groups]);
  const filteredGroups = useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        events: group.events.filter((event) => {
          if (levelFilter !== "all" && event.level !== levelFilter) return false;
          if (sourceFilter !== "all" && event.source !== sourceFilter) return false;
          if (statusFilter === "visible" && isHidden(event)) return false;
          if (statusFilter === "pending" && (isHidden(event) || isAcknowledged(event))) return false;
          if (statusFilter === "acknowledged" && (isHidden(event) || !isAcknowledged(event))) return false;
          if (statusFilter === "hidden" && !isHidden(event)) return false;
          return true;
        }),
      }))
      .filter((group) => group.events.length > 0);
  }, [groups, levelFilter, sourceFilter, statusFilter]);
  const filteredTotal = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.events.length, 0),
    [filteredGroups],
  );

  const saveEventState = useCallback(async (eventId: string, action: AlertStateAction) => {
    setSavingEventId(eventId);
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(withDevCsrf({ csrf, id: eventId, action, days })),
      });
      const payload = (await response.json().catch(() => null)) as AlertsResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setGroups(payload.data.groups ?? []);
      setTotal(Math.max(0, Number(payload.data.total ?? 0)));
      setSummary({
        highTotal: Math.max(0, Number(payload.data.summary?.highTotal ?? 0)),
        visibleTotal: Math.max(0, Number(payload.data.summary?.visibleTotal ?? 0)),
        pendingTotal: Math.max(0, Number(payload.data.summary?.pendingTotal ?? 0)),
        acknowledgedTotal: Math.max(0, Number(payload.data.summary?.acknowledgedTotal ?? 0)),
        hiddenTotal: Math.max(0, Number(payload.data.summary?.hiddenTotal ?? 0)),
        latestVisibleTitle: asString(payload.data.summary?.latestVisibleTitle) || null,
        latestVisibleCreatedAt: asString(payload.data.summary?.latestVisibleCreatedAt) || null,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "알림 상태를 저장하지 못했습니다.");
    } finally {
      setSavingEventId("");
    }
  }, [csrf, days]);

  return (
    <PageShell>
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Alert Brief"
          title="중요 알림"
          description="토픽 급증이나 지표 변화처럼 바로 확인할 만한 신호를 날짜별로 모아보고, 확인 완료나 숨김 상태까지 같은 흐름으로 정리합니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>
                오늘 브리핑
              </Link>
              <Link href="/planning/v3/news/trends" className={reportHeroActionLinkClassName}>
                흐름 보기
              </Link>
              <Link href="/planning/v3/news/explore" className={reportHeroActionLinkClassName}>
                뉴스 탐색
              </Link>
              <Link href={NEWS_ALERT_RULES_SETTINGS_HREF} className={reportHeroActionLinkClassName}>
                설정
              </Link>
              <button
                type="button"
                onClick={() => setDays(7)}
                className={reportHeroToggleButtonClassName(days === 7)}
              >
                7일
              </button>
              <button
                type="button"
                onClick={() => setDays(30)}
                className={reportHeroToggleButtonClassName(days === 30)}
              >
                30일
              </button>
            </>
          )}
        >
          <p className="text-xs text-white/60">최근 {days}일 · 이벤트 {total}건 · 날짜 {dayCount}일</p>
          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard
              label="긴급 확인"
              value={loading ? "-" : `${summary.highTotal}건`}
              description="중요도 상 알림 수"
            />
            <ReportHeroStatCard
              label="아직 확인 전"
              value={loading ? "-" : `${summary.pendingTotal}건`}
              description="숨김을 제외하고 아직 읽지 않은 알림 수"
            />
            <ReportHeroStatCard
              label="숨김 / 확인 완료"
              value={loading ? "-" : `${summary.hiddenTotal}건 / ${summary.acknowledgedTotal}건`}
              description={summary.latestVisibleTitle ? `가장 최근 표시중 알림: ${summary.latestVisibleTitle}` : "상태를 바꾼 알림 수를 여기에 보여줍니다."}
            />
          </ReportHeroStatGrid>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-white/70">빠른 필터</span>
            <button
              type="button"
              onClick={() => setStatusFilter("visible")}
              className={reportHeroFilterChipClassName(statusFilter === "visible")}
            >
              표시중
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={reportHeroFilterChipClassName(statusFilter === "pending", "emerald")}
            >
              미확인
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("acknowledged")}
              className={reportHeroFilterChipClassName(statusFilter === "acknowledged", "sky")}
            >
              확인 완료
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("hidden")}
              className={reportHeroFilterChipClassName(statusFilter === "hidden", "slate")}
            >
              숨김
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter("all")}
              className={reportHeroFilterChipClassName(levelFilter === "all")}
            >
              전체 중요도
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter("high")}
              className={reportHeroFilterChipClassName(levelFilter === "high", "rose")}
            >
              중요도 상
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter("medium")}
              className={reportHeroFilterChipClassName(levelFilter === "medium", "amber")}
            >
              중요도 중
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={reportHeroFilterChipClassName(sourceFilter === "all")}
            >
              전체 출처
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("news:refresh")}
              className={reportHeroFilterChipClassName(sourceFilter === "news:refresh", "emerald")}
            >
              뉴스 갱신
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("indicators:refresh")}
              className={reportHeroFilterChipClassName(sourceFilter === "indicators:refresh", "sky")}
            >
              지표 갱신
            </button>
          </div>
          {errorMessage ? <p className="text-xs font-semibold text-rose-300">{errorMessage}</p> : null}
        </ReportHeroCard>

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">알림 이벤트</h2>
            <p className="text-xs text-slate-500">먼저 한 줄 요약을 보고, 관련 화면으로 바로 이어서 확인할 수 있습니다.</p>
          </div>
          <p className="text-xs text-slate-500">현재 필터 결과: {filteredTotal}건</p>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : groups.length < 1 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">최근 조건 충족 이벤트가 없습니다.</p>
              <p className="mt-1 text-xs text-slate-600">흐름 화면에서 급증 토픽을 보고, 필요하면 설정에서 기준을 조정할 수 있습니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/planning/v3/news/trends" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                  최근 흐름 보기
                </Link>
                <Link href={NEWS_ALERT_RULES_SETTINGS_HREF} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                  기준 조정하기
                </Link>
              </div>
            </div>
          ) : filteredGroups.length < 1 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">지금 필터에 맞는 알림이 없습니다.</p>
              <p className="mt-1 text-xs text-slate-600">중요도나 출처 필터를 풀면 다른 알림을 바로 확인할 수 있습니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLevelFilter("all");
                    setSourceFilter("all");
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  필터 전체 해제
                </button>
                <Link href="/planning/v3/news/trends" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                  최근 흐름 보기
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <div key={group.dayKst} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-black text-slate-900">{group.dayKst}</p>
                  <ul className="mt-2 space-y-2">
                    {group.events.map((event) => (
                      <li key={event.id} className={`rounded-md border p-2 ${isHidden(event) ? "border-slate-300 bg-slate-50" : isAcknowledged(event) ? "border-sky-200 bg-sky-50/50" : "border-slate-200"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${levelBadgeClass(event.level)}`}>
                            {levelLabel(event.level)}
                          </span>
                          <span className="text-xs text-slate-500">{ruleKindLabel(event.ruleKind)} · {sourceLabel(event.source)}</span>
                          <span className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</span>
                          {isAcknowledged(event) ? (
                            <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">확인 완료</span>
                          ) : null}
                          {isHidden(event) ? (
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">숨김</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">{buildAlertLead(event)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{event.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{formatAlertSummary(event.summary)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">대상: {targetTypeLabel(event.targetType)} · {event.targetId}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isHidden(event) ? (
                            <button
                              type="button"
                              onClick={() => void saveEventState(event.id, "unhide")}
                              disabled={savingEventId === event.id}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingEventId === event.id ? "저장 중..." : "숨김 해제"}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => void saveEventState(event.id, isAcknowledged(event) ? "unack" : "ack")}
                                disabled={savingEventId === event.id}
                                className="rounded-md border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEventId === event.id ? "저장 중..." : isAcknowledged(event) ? "미확인으로 되돌리기" : "확인 완료"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveEventState(event.id, "hide")}
                                disabled={savingEventId === event.id}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEventId === event.id ? "저장 중..." : "숨기기"}
                              </button>
                            </>
                          )}
                        </div>
                        {event.link ? (
                          isInternalLink(event.link) ? (
                            <Link href={event.link} className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline underline-offset-2">
                              관련 보기
                            </Link>
                          ) : (
                            <a href={event.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline underline-offset-2">
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
