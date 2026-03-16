"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroActionLinkClassName,
  reportHeroFilterChipClassName,
  reportHeroToggleButtonClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { NewsNavigation } from "./NewsNavigation";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { cn } from "@/lib/utils";

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
  if (level === "high") return "bg-rose-50 text-rose-700 border-rose-100";
  if (level === "medium") return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-slate-50 text-slate-600 border-slate-100";
}

function levelLabel(level: AlertLevel): string {
  if (level === "high") return "중요도 상";
  if (level === "medium") return "중요도 중";
  return "중요도 하";
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
  const kind = ruleKindLabel(event.ruleKind);
  const source = sourceLabel(event.source);
  return `${kind} · ${source}`;
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
      <div className="space-y-8">
        <ReportHeroCard
          kicker="알림 브리핑"
          title="중요 알림함"
          description="토픽 급증이나 지표 변화처럼 바로 확인할 만한 신호를 모았습니다. 확인 완료나 숨김 상태를 관리하여 노이즈를 줄이세요."
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <Link href={NEWS_ALERT_RULES_SETTINGS_HREF} className={reportHeroActionLinkClassName}>
                알림 설정
              </Link>
              <div className="ml-2 flex items-center bg-white/10 rounded-lg p-1">
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
              </div>
            </div>
          )}
        >
          <NewsNavigation />

          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard
              label="긴급 확인"
              value={loading ? "-" : `${summary.highTotal}건`}
              description="중요도 상 알림 수"
            />
            <ReportHeroStatCard
              label="미확인 신호"
              value={loading ? "-" : `${summary.pendingTotal}건`}
              description="숨김을 제외하고 아직 읽지 않은 알림"
            />
            <ReportHeroStatCard
              label="상태 관리됨"
              value={loading ? "-" : `${summary.hiddenTotal} / ${summary.acknowledgedTotal}`}
              description="숨김 / 확인 완료 알림 수"
            />
          </ReportHeroStatGrid>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
            <span className="text-white/40 mr-2">빠른 필터</span>
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
            <div className="mx-2 h-3 w-px bg-white/20" />
            <button
              type="button"
              onClick={() => setLevelFilter("high")}
              className={reportHeroFilterChipClassName(levelFilter === "high", "rose")}
            >
              중요
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={reportHeroFilterChipClassName(sourceFilter === "all")}
            >
              전체 출처
            </button>
          </div>
          {errorMessage ? <p className="mt-4 text-xs font-bold text-rose-300">❌ {errorMessage}</p> : null}
        </ReportHeroCard>

        <Card className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader
            title="알림 이벤트"
            description="중요한 신호를 먼저 확인하고 상태를 관리하세요."
            action={<span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">필터 결과 {filteredTotal}건</span>}
          />

          {loading ? (
            <p className="text-sm text-slate-500 animate-pulse">불러오는 중...</p>
          ) : groups.length < 1 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
              <p className="text-sm font-bold text-slate-900">최근 조건 충족 이벤트가 없습니다.</p>
              <p className="mt-2 text-xs font-medium text-slate-500">흐름 화면에서 급증 토픽을 보고, 필요하면 설정에서 기준을 조정할 수 있습니다.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/planning/v3/news/trends" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                  최근 흐름 보기
                </Link>
                <Link href={NEWS_ALERT_RULES_SETTINGS_HREF} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                  알림 기준 조정
                </Link>
              </div>
            </div>
          ) : filteredGroups.length < 1 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
              <p className="text-sm font-bold text-slate-900">필터 조건에 맞는 알림이 없습니다.</p>
              <p className="mt-2 text-xs font-medium text-slate-500">상태나 중요도 필터를 변경해 보세요.</p>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setLevelFilter("all");
                    setSourceFilter("all");
                    setStatusFilter("visible");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                >
                  필터 전체 초기화
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredGroups.map((group) => (
                <div key={group.dayKst} className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pl-2">{group.dayKst}</p>
                  <ul className="space-y-3">
                    {group.events.map((event) => (
                      <li key={event.id} className={cn(
                        "group rounded-2xl border p-5 transition-all shadow-sm",
                        isHidden(event) ? "border-slate-200 bg-slate-50/50 opacity-60" :
                        isAcknowledged(event) ? "border-sky-100 bg-sky-50/20" : "border-slate-200 bg-white hover:border-emerald-200 hover:shadow-md"
                      )}>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black tabular-nums", levelBadgeClass(event.level))}>
                            {levelLabel(event.level)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{formatDateTime(event.createdAt)}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{buildAlertLead(event)}</span>
                          </div>
                          {isAcknowledged(event) ? (
                            <span className="ml-auto rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">ACKNOWLEDGED</span>
                          ) : isHidden(event) ? (
                            <span className="ml-auto rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">HIDDEN</span>
                          ) : null}
                        </div>

                        <p className="text-base font-black text-slate-900 tracking-tight leading-snug">{event.title}</p>
                        <p className="mt-2 text-sm font-medium text-slate-600 leading-relaxed">{formatAlertSummary(event.summary)}</p>
                        <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">TARGET: {targetTypeLabel(event.targetType)} · {event.targetId}</p>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-4">
                          <div className="flex items-center gap-2">
                            {isHidden(event) ? (
                              <button
                                type="button"
                                onClick={() => void saveEventState(event.id, "unhide")}
                                disabled={savingEventId === event.id}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                              >
                                {savingEventId === event.id ? "저장 중..." : "숨김 해제"}
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void saveEventState(event.id, isAcknowledged(event) ? "unack" : "ack")}
                                  disabled={savingEventId === event.id}
                                  className={cn(
                                    "rounded-lg border px-3 py-1.5 text-[10px] font-black transition-colors disabled:opacity-60",
                                    isAcknowledged(event) ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                  )}
                                >
                                  {savingEventId === event.id ? "저장 중..." : isAcknowledged(event) ? "미확인 상태로 변경" : "확인 완료"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveEventState(event.id, "hide")}
                                  disabled={savingEventId === event.id}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                                >
                                  {savingEventId === event.id ? "저장 중..." : "숨기기"}
                                </button>
                              </>
                            )}
                          </div>

                          {event.link && (
                            <a
                              href={event.link}
                              target={isInternalLink(event.link) ? undefined : "_blank"}
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest"
                            >
                              상세 보기 ▶
                            </a>
                          )}
                        </div>
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
