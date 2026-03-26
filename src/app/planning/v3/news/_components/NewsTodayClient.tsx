"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroActionLinkClassName,
  reportHeroAnchorLinkClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type ExposureProfile } from "@/lib/planning/v3/exposure/contracts";
import { type ImpactResult, type ScenarioForImpact } from "@/lib/planning/v3/financeNews/contracts";
import { computeImpact } from "@/lib/planning/v3/financeNews/impactModel";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { NewsNavigation } from "./NewsNavigation";
import { cn } from "@/lib/utils";

type NewsTodayClientProps = {
  csrf?: string;
};

type TodayResponse = {
  ok?: boolean;
  data?: {
    lastRefreshedAt?: string | null;
    digest?: {
      date?: string;
      observation?: string;
      evidence?: Array<{
        title?: string;
        url?: string;
        sourceId?: string;
        publishedAt?: string | null;
        topics?: string[];
      }>;
      watchlist?: string[];
      counterSignals?: string[];
    };
    scenarios?: {
      cards?: Array<{
        name?: string;
        observation?: string;
        triggers?: Array<{ kind?: string; topicId?: string; condition?: string }>;
        invalidation?: string[];
        indicators?: string[];
        options?: string[];
        linkedTopics?: string[];
        quality?: {
          dedupeLevel?: "high" | "med" | "low";
          contradictionLevel?: "high" | "med" | "low";
          uncertaintyLabels?: string[];
        };
      }>;
    };
  } | null;
  error?: { message?: string };
};

type WatchSparkline = {
  points?: number[];
  trend?: "up" | "down" | "flat" | "unknown";
  lastValue?: number | null;
} | null;

type DigestWatchlistRow = {
  label?: string;
  seriesId?: string;
  view?: "last" | "pctChange" | "zscore";
  window?: number;
  status?: "ok" | "unknown";
  grade?: "상" | "중" | "하" | "unknown";
  valueSummary?: string;
  asOf?: string | null;
  unknownReasonCode?: "missing" | "disabled" | "no_data" | "insufficient_data" | "invalid_series_id" | "unknown";
  unknownReasonLabel?: string;
  resolveHref?: string | null;
  sparkline?: WatchSparkline;
};

type DigestResponse = {
  ok?: boolean;
  data?: {
    watchlist?: DigestWatchlistRow[];
  } | null;
};

type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: { message?: string };
};

type RefreshResponse = {
  ok?: boolean;
  data?: {
    sourcesProcessed?: number;
    itemsFetched?: number;
    itemsNew?: number;
    itemsDeduped?: number;
    errorCount?: number;
    lastRefreshedAt?: string | null;
  };
  error?: { message?: string };
};

type WatchlistRow = {
  label: string;
  seriesId: string;
  view: "last" | "pctChange" | "zscore";
  window: number;
  status: "ok" | "unknown";
  grade: "상" | "중" | "하" | "unknown";
  asOf: string | null;
  sparklinePoints: number[];
  sparklineTrend: "up" | "down" | "flat" | "unknown";
  sparklineLastValue: number | null;
  unknownReasonCode?: "missing" | "disabled" | "no_data" | "insufficient_data" | "invalid_series_id" | "unknown";
  unknownReasonLabel?: string;
  resolveHref?: string | null;
};

type RecoveryAction = "rebuild_caches" | "recompute_trends";

type RecoveryResponse = {
  ok?: boolean;
  data?: {
    requiresConfirmation?: boolean;
    summary?: {
      action?: RecoveryAction;
      title?: string;
      description?: string;
      itemCount?: number;
      dailyDays?: number;
      writeTargets?: string[];
      notes?: string[];
    };
    execution?: {
      action?: RecoveryAction;
      executedAt?: string;
      itemCount?: number;
      dailyDays?: number;
      wroteCount?: number;
      writeTargets?: string[];
    } | null;
  };
  error?: { message?: string };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const text = asString(value);
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeScenarioName(value: unknown): ScenarioForImpact["name"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "bull") return "Bull";
  if (normalized === "bear") return "Bear";
  return "Base";
}

function inferTriggerStatus(card: {
  triggers?: Array<{ condition?: string }>;
}): ScenarioForImpact["triggerStatus"] {
  const conditions = (card.triggers ?? []).map((row) => asString(row.condition).toLowerCase()).filter(Boolean);
  if (conditions.length < 1) return "unknown";
  if (conditions.some((row) => row === "high" || row === "med")) return "met";
  if (conditions.every((row) => row === "low")) return "not_met";
  return "unknown";
}

function gradeLabel(value: ImpactResult["cashflowRisk"]): string {
  if (value === "High") return "상";
  if (value === "Med") return "중";
  if (value === "Low") return "하";
  return "Unknown";
}

function unknownImpactResult(): ImpactResult {
  return {
    cashflowRisk: "Unknown",
    debtServiceRisk: "Unknown",
    inflationPressureRisk: "Unknown",
    fxPressureRisk: "Unknown",
    incomeRisk: "Unknown",
    bufferAdequacy: "Unknown",
    rationale: ["입력 데이터가 부족해 개인 영향은 unknown으로 유지됩니다."],
    watch: [],
  };
}

function normalizeWatchGrade(value: unknown): "상" | "중" | "하" | "unknown" {
  const normalized = asString(value);
  if (normalized === "상" || normalized === "중" || normalized === "하") return normalized;
  return "unknown";
}

function normalizeWatchTrend(value: unknown): "up" | "down" | "flat" | "unknown" {
  const normalized = asString(value);
  if (normalized === "up" || normalized === "down" || normalized === "flat") return normalized;
  return "unknown";
}

function normalizeWatchView(value: unknown): "last" | "pctChange" | "zscore" {
  const normalized = asString(value);
  if (normalized === "pctChange" || normalized === "zscore") return normalized;
  return "last";
}

function normalizeWatchStatus(value: unknown): "ok" | "unknown" {
  return asString(value) === "ok" ? "ok" : "unknown";
}

function gradeToneClass(value: "상" | "중" | "하" | "unknown"): string {
  if (value === "상") return "text-rose-700";
  if (value === "중") return "text-amber-700";
  if (value === "하") return "text-emerald-700";
  return "text-slate-500";
}

function trendArrow(value: "up" | "down" | "flat" | "unknown"): string {
  if (value === "up") return "▲";
  if (value === "down") return "▼";
  if (value === "flat") return "■";
  return "·";
}

function qualityLevelLabel(value: "high" | "med" | "low" | undefined): string {
  if (value === "high") return "높음";
  if (value === "med") return "중간";
  if (value === "low") return "낮음";
  return "-";
}

function formatLastValue(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return (Math.round((value ?? 0) * 100) / 100).toLocaleString("ko-KR");
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="h-8 rounded bg-slate-100" aria-hidden="true" />;
  }

  const width = 96;
  const height = 28;
  const step = width / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => {
    const x = Math.round(step * index);
    const y = Math.round(height - (Math.max(0, Math.min(100, point)) / 100) * height);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full" role="img" aria-label="지표 미니 추이">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-slate-500"
        points={coords}
      />
    </svg>
  );
}

export function NewsTodayClient({ csrf }: NewsTodayClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<TodayResponse["data"]>(null);
  const [watchlistRows, setWatchlistRows] = useState<WatchlistRow[]>([]);
  const [watchAdvanced, setWatchAdvanced] = useState(false);
  const [profile, setProfile] = useState<ExposureProfile | null>(null);
  const [advancedImpact, setAdvancedImpact] = useState<Record<string, boolean>>({});
  const [recovering, setRecovering] = useState(false);
  const [recoveryPreview, setRecoveryPreview] = useState<NonNullable<RecoveryResponse["data"]>["summary"] | null>(null);
  const evidenceCount = data?.digest?.evidence?.length ?? 0;
  const scenarioCount = data?.scenarios?.cards?.length ?? 0;
  const counterSignalCount = data?.digest?.counterSignals?.length ?? 0;
  const unresolvedWatchCount = watchlistRows.filter((row) => row.status === "unknown" || row.unknownReasonCode === "missing" || row.unknownReasonCode === "disabled").length;
  const priorityMessage = !data
    ? "먼저 수동 갱신으로 오늘 요약을 준비하세요."
    : !profile
      ? "내 상황 프로필을 연결하면 시나리오 영향이 더 정확해집니다."
      : unresolvedWatchCount > 0
        ? "상태가 unknown인 watch 항목부터 정리하는 편이 좋습니다."
        : "오늘 핵심 시나리오를 확인한 뒤 저널에 대응 계획을 남기세요.";

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [todayResponse, exposureResponse, digestResponse] = await Promise.all([
        fetch("/api/planning/v3/news/today", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/planning/v3/exposure/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/planning/v3/news/digest", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      const todayPayload = (await todayResponse.json().catch(() => null)) as TodayResponse | null;
      if (!todayResponse.ok || todayPayload?.ok !== true) {
        throw new Error(todayPayload?.error?.message ?? `HTTP ${todayResponse.status}`);
      }
      setData(todayPayload.data ?? null);

      const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      if (exposureResponse.ok && exposurePayload?.ok === true) {
        setProfile(exposurePayload.profile ?? null);
      } else {
        setProfile(null);
      }

      const digestPayload = (await digestResponse.json().catch(() => null)) as DigestResponse | null;
      if (digestResponse.ok && digestPayload?.ok === true) {
        const rows: WatchlistRow[] = (digestPayload.data?.watchlist ?? [])
          .map((row) => {
            const label = asString(row.label);
            if (!label) return null;
            const points = Array.isArray(row.sparkline?.points)
              ? row.sparkline.points.filter((point) => Number.isFinite(point)).map((point) => Math.max(0, Math.min(100, Math.round(point))))
              : [];
            return {
              label,
              seriesId: asString(row.seriesId),
              view: normalizeWatchView(row.view),
              window: Math.max(1, Math.round(Number(row.window) || 1)),
              status: normalizeWatchStatus(row.status),
              grade: normalizeWatchGrade(row.grade),
              asOf: asString(row.asOf) || null,
              sparklinePoints: points,
              sparklineTrend: normalizeWatchTrend(row.sparkline?.trend),
              sparklineLastValue: Number.isFinite(row.sparkline?.lastValue ?? NaN) ? Number(row.sparkline?.lastValue) : null,
              unknownReasonCode: row.unknownReasonCode,
              unknownReasonLabel: asString(row.unknownReasonLabel) || undefined,
              resolveHref: asString(row.resolveHref) || null,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));
        setWatchlistRows(rows);
      } else {
        setWatchlistRows([]);
      }
    } catch (error) {
      setData(null);
      setProfile(null);
      setWatchlistRows([]);
      setErrorMessage(error instanceof Error ? error.message : "오늘 뉴스 요약을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotice("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withDevCsrf({ csrf })),
      });
      const payload = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setRecoveryPreview(null);
      setNotice(`수동 갱신 완료: 신규 ${payload.data?.itemsNew ?? 0}건, 중복 ${payload.data?.itemsDeduped ?? 0}건`);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "갱신 중 오류가 발생했습니다.");
    } finally {
      setRefreshing(false);
    }
  }, [csrf, load]);

  const requestRecoveryPreview = useCallback(async (action: RecoveryAction) => {
    setRecovering(true);
    setNotice("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withDevCsrf({ csrf, action, confirm: false })),
      });
      const payload = (await response.json().catch(() => null)) as RecoveryResponse | null;
      if (!response.ok || payload?.ok !== true || !payload?.data?.summary) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setRecoveryPreview(payload.data.summary);
      setNotice("복구 요약을 확인한 뒤 실행 확인 버튼을 눌러 주세요.");
    } catch (error) {
      setRecoveryPreview(null);
      setErrorMessage(error instanceof Error ? error.message : "복구 요약 생성 중 오류가 발생했습니다.");
    } finally {
      setRecovering(false);
    }
  }, [csrf]);

  const runRecovery = useCallback(async () => {
    const action = recoveryPreview?.action;
    if (action !== "rebuild_caches" && action !== "recompute_trends") return;

    setRecovering(true);
    setNotice("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withDevCsrf({ csrf, action, confirm: true })),
      });
      const payload = (await response.json().catch(() => null)) as RecoveryResponse | null;
      if (!response.ok || payload?.ok !== true || !payload?.data?.execution) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setRecoveryPreview(null);
      setNotice(
        `복구 완료: ${asString(payload.data.summary?.title) || "작업"} · 대상 ${payload.data.execution.dailyDays ?? 0}일 · 파일 ${payload.data.execution.wroteCount ?? 0}개`,
      );
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "복구 실행 중 오류가 발생했습니다.");
    } finally {
      setRecovering(false);
    }
  }, [csrf, load, recoveryPreview?.action]);

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportHeroCard
          kicker="Market Pulse"
          title="오늘 재무 브리핑"
          description="금융 시장의 핵심 관찰과 내 자산 상황에 미칠 수 있는 잠재적 영향을 정리합니다. 아래 요약에서 필요한 시나리오를 확인하세요."
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/planning/v3/journal" className={reportHeroActionLinkClassName}>
                저널
              </Link>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className={cn(
                  reportHeroPrimaryActionClassName,
                  "disabled:opacity-60 transition-colors bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50"
                )}
              >
                {refreshing ? "갱신 중..." : "지금 갱신"}
              </button>
            </div>
          )}
        >
          <NewsNavigation />

          <div className="mb-8 rounded-3xl bg-emerald-500/10 p-5 border border-emerald-500/20 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2 w-2 flex-none animate-pulse rounded-full bg-emerald-400" />
	              <p className="text-sm font-bold text-emerald-950 leading-relaxed tracking-tight">
	                {priorityMessage}
	              </p>
            </div>
          </div>

          <ReportHeroStatGrid className="xl:grid-cols-4">
            <ReportHeroStatCard
              label="마지막 갱신"
              value={formatDateTime(data?.lastRefreshedAt ?? null)}
              description={asString(data?.digest?.date) || "오늘 기준일 미확인"}
            />
            <ReportHeroStatCard
              label="근거와 시나리오"
              value={`근거 ${evidenceCount}건 · 시나리오 ${scenarioCount}개`}
              description="중요한 뉴스 근거와 해석 카드 수"
            />
            <ReportHeroStatCard
              label="지표 점검"
              value={`${watchlistRows.length}개 중 ${unresolvedWatchCount}건`}
              description="unknown 또는 설정 누락 항목"
            />
            <ReportHeroStatCard
              label="내 상황 연결"
              value={profile ? "연결됨" : "미입력"}
              description={profile ? "개인 영향 요약이 표시됩니다." : "프로필을 입력하면 영향 설명이 구체화됩니다."}
            />
          </ReportHeroStatGrid>

          <div className="mt-8 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
            <span className="text-white/40 mr-2">Quick Access</span>
            <a href="#news-today-observation" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>오늘 핵심</a>
            <a href="#news-today-watchlist" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>지표 추이</a>
            <a href="#news-today-scenarios" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>대응 시나리오</a>
            <a href="#news-today-ops" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>고급 작업</a>
          </div>

          {notice || errorMessage ? (
            <div className="mt-6 rounded-2xl bg-black/20 p-4 border border-white/5">
              {notice ? <p className="text-xs font-bold text-emerald-400 flex items-center gap-2"><span>✅</span> {notice}</p> : null}
              {errorMessage ? <p className="text-xs font-bold text-rose-400 flex items-center gap-2"><span>❌</span> {errorMessage}</p> : null}
            </div>
          ) : null}
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card id="news-today-observation" className="rounded-[2.5rem] p-8 shadow-sm">
            <SubSectionHeader
              title="오늘 핵심"
              description="가장 먼저 읽을 한 줄 요약과 반대 시그널을 확인합니다."
            />
            {loading ? (
              <p className="text-sm text-slate-500 animate-pulse">불러오는 중...</p>
            ) : (
              <p className="rounded-2xl bg-emerald-50/50 border border-emerald-100/50 p-5 text-sm font-bold text-emerald-900 leading-relaxed">
                {asString(data?.digest?.observation) || "데이터 없음"}
              </p>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">반대 시그널</p>
                <span className="text-[10px] font-black text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full tabular-nums">{counterSignalCount}건</span>
              </div>
              {!data?.digest?.counterSignals?.length ? (
                <p className="text-xs font-medium text-slate-500 italic">반대 시그널 없음</p>
              ) : (
                <ul className="list-disc space-y-2 pl-4 text-xs font-bold text-slate-700">
                  {data.digest.counterSignals.map((row, index) => (
                    <li key={`${row}-${index}`} className="leading-relaxed">{asString(row)}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="rounded-[2.5rem] p-8 shadow-sm">
            <SubSectionHeader
              title="근거 링크"
              description="오늘 관찰의 근거가 된 뉴스 기사들입니다."
              action={<span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">{evidenceCount}건</span>}
            />
            {!data?.digest?.evidence?.length ? (
              <p className="text-sm text-slate-500 italic">근거 링크 없음</p>
            ) : (
              <ul className="space-y-3">
                {data.digest.evidence.slice(0, 5).map((row, index) => (
                  <li key={`${asString(row.url)}-${index}`} className="group rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm hover:shadow-md transition-all">
                    <a href={asString(row.url)} target="_blank" rel="noopener noreferrer" className="block text-sm font-black text-slate-900 leading-snug hover:text-emerald-700 transition-colors">
                      {asString(row.title) || asString(row.url) || "링크"}
                    </a>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{asString(row.sourceId)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(row.publishedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card id="news-today-watchlist" className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader
            title="watchlist"
            description="오늘 점검이 필요한 핵심 지표 추이입니다."
            action={(
              <button
                type="button"
                onClick={() => setWatchAdvanced((prev) => !prev)}
                className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:underline"
              >
                {watchAdvanced ? "간략히 보기" : "상세 분석 모드"}
              </button>
            )}
          />

          {watchlistRows.length > 0 ? (
            <div className="space-y-6">
              {watchlistRows.some((row) => row.status === "unknown" || row.unknownReasonCode === "missing" || row.unknownReasonCode === "disabled") ? (
                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">상태 원인 안내</p>
                  <ul className="space-y-1.5 text-xs font-bold text-amber-900">
                    {watchlistRows
                      .filter((row) => row.status === "unknown" || row.unknownReasonCode === "missing" || row.unknownReasonCode === "disabled")
                      .slice(0, 8)
                      .map((row) => (
                        <li key={`unknown-${row.seriesId}-${row.label}`} className="flex items-center gap-2">
                          <span className="h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                          <span>{row.label}: {row.unknownReasonLabel || "원인을 확인하지 못했습니다."}</span>
                          {row.resolveHref ? (
                            <Link href={row.resolveHref} className="text-emerald-700 underline underline-offset-4 font-black">
                              빠른 해결
                            </Link>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {watchlistRows.map((row) => (
                <li key={`${row.seriesId}-${row.label}`} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-black text-slate-900 tracking-tight">{row.label}</p>
                    <p className={cn("text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums",
                      row.grade === "상" ? "bg-rose-50 text-rose-700" :
                      row.grade === "중" ? "bg-amber-50 text-amber-700" :
                      row.grade === "하" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500")}>
                      {row.grade} {trendArrow(row.sparklineTrend)}
                    </p>
                  </div>
                  <div className="mt-2 h-10 flex items-end">
                    <Sparkline points={row.sparklinePoints} />
                  </div>
                  {watchAdvanced && (
                    <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                      <span>최근값 {formatLastValue(row.sparklineLastValue)}</span>
                      <span>{row.asOf ?? "-"}</span>
                    </div>
                  )}
                  {row.status === "unknown" ? (
                    <div className="mt-3 flex items-center justify-between gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                      <p className="text-[10px] font-black text-amber-700">{row.unknownReasonLabel || "데이터 부족"}</p>
                      {row.resolveHref && (
                        <Link href={row.resolveHref} className="text-[10px] font-black text-emerald-700 hover:underline">해결 ▶</Link>
                      )}
                    </div>
                  ) : null}
                </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[2rem] bg-slate-50 px-6 py-12 text-center border border-dashed border-slate-200">
              <p className="text-sm font-medium text-slate-500">체크된 변수가 없습니다.</p>
            </div>
          )}
        </Card>

        <Card id="news-today-scenarios" className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader
            title="시나리오 비교"
            description="현재 관찰 결과에 따른 주요 시나리오와 개인화된 영향 요약입니다."
            action={<span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">{scenarioCount}개</span>}
          />

          {!data?.scenarios?.cards?.length ? (
            <div className="rounded-[2rem] bg-slate-50 px-6 py-12 text-center border border-dashed border-slate-200">
              <p className="text-sm font-medium text-slate-500">시나리오 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.scenarios.cards.map((card, index) => {
                const scenario: ScenarioForImpact = {
                  name: normalizeScenarioName(card.name),
                  triggerStatus: inferTriggerStatus(card),
                  linkedTopics: (card.linkedTopics ?? []).map((row) => asString(row).toLowerCase()).filter(Boolean),
                  confirmIndicators: (card.indicators ?? []).map((row) => asString(row).toLowerCase()).filter(Boolean),
                  leadingIndicators: [],
                  observation: asString(card.observation),
                  triggerSummary: (card.triggers ?? []).map((row) => `${asString(row.topicId)}:${asString(row.condition)}`).join(" · "),
                };

                let impact = unknownImpactResult();
                try {
                  impact = computeImpact({
                    profile,
                    scenario,
                  });
                } catch {
                  impact = unknownImpactResult();
                }
                const key = `${asString(card.name)}-${index}`;
                const showAdvanced = advancedImpact[key] === true;
                const isProfileMissing = profile === null;

                return (
                  <div key={key} className="group rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-sm hover:shadow-md transition-all flex flex-col">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <p className="text-lg font-black text-slate-900 tracking-tight">{asString(card.name) || "Scenario"}</p>
                      <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">INDEX {index + 1}</span>
                    </div>

                    <div className="space-y-4 flex-1">
                      <p className="text-sm font-bold text-slate-700 leading-relaxed">{asString(card.observation) || "-"}</p>

                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">컨텍스트</p>
                        <p className="text-[11px] font-bold text-slate-500 leading-snug line-clamp-2">토픽: {(card.linkedTopics ?? []).join(", ") || "-"}</p>
                        <p className="text-[11px] font-bold text-slate-500 leading-snug">트리거: {scenario.triggerSummary || "-"}</p>
                      </div>

                      {Array.isArray(card.quality?.uncertaintyLabels) && card.quality.uncertaintyLabels.length > 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">불확실성 리포트</p>
                          <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-amber-900">
                            {card.quality.uncertaintyLabels.slice(0, 2).map((line, lineIndex) => (
                              <li key={`${key}-uncertainty-${lineIndex}`} className="leading-snug">{asString(line)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-auto pt-4 border-t border-slate-50">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">내 상황 영향 요약</p>
                          <button
                            type="button"
                            className="text-[10px] font-black text-emerald-600 hover:underline"
                            onClick={() => setAdvancedImpact((prev) => ({ ...prev, [key]: !showAdvanced }))}
                          >
                            {showAdvanced ? "간략히" : "분석 근거 ▶"}
                          </button>
                        </div>

                        {isProfileMissing ? (
                          <div className="rounded-xl bg-slate-50 p-3 text-center border border-dashed border-slate-200">
                            <p className="text-[11px] font-bold text-slate-500">프로필 설정이 필요합니다.</p>
                            <Link href="/planning/v3/exposure" className="text-[11px] font-black text-emerald-700 underline underline-offset-4 mt-1 block">지금 설정하기</Link>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-black tabular-nums">
                              <p className="flex justify-between bg-slate-50 px-2.5 py-1 rounded-lg">부채 <span className="text-emerald-600">{gradeLabel(impact.debtServiceRisk)}</span></p>
                              <p className="flex justify-between bg-slate-50 px-2.5 py-1 rounded-lg">물가 <span className="text-emerald-600">{gradeLabel(impact.inflationPressureRisk)}</span></p>
                              <p className="flex justify-between bg-slate-50 px-2.5 py-1 rounded-lg">환율 <span className="text-emerald-600">{gradeLabel(impact.fxPressureRisk)}</span></p>
                              <p className="flex justify-between bg-slate-50 px-2.5 py-1 rounded-lg">완충 <span className="text-emerald-600">{gradeLabel(impact.bufferAdequacy)}</span></p>
                            </div>
                            {showAdvanced && (
                              <ul className="list-disc space-y-1.5 pl-4 text-[11px] font-bold text-slate-600 animate-in fade-in slide-in-from-top-1 duration-200">
                                {impact.rationale.slice(0, 3).map((line, lineIndex) => (
                                  <li key={`${key}-rationale-${lineIndex}`} className="leading-snug">{line}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card id="news-today-ops" className="rounded-[2.5rem] p-8 shadow-sm border-amber-200 bg-amber-50/30">
          <SubSectionHeader
            title="고급 시스템 작업"
            description="데이터 정합성에 이슈가 있을 때만 캐시/트렌드 복구를 실행하세요."
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={recovering}
              onClick={() => void requestRecoveryPreview("rebuild_caches")}
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-900 shadow-sm hover:bg-amber-50 disabled:opacity-60 transition-colors"
            >
              캐시 재구성 분석
            </button>
            <button
              type="button"
              disabled={recovering}
              onClick={() => void requestRecoveryPreview("recompute_trends")}
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-900 shadow-sm hover:bg-amber-50 disabled:opacity-60 transition-colors"
            >
              트렌드 재계산 분석
            </button>
          </div>

          {recoveryPreview ? (
            <div className="mt-6 space-y-4 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-amber-900">{asString(recoveryPreview.title) || "복구 요약"}</p>
                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full tabular-nums">CONFIRMATION REQUIRED</span>
              </div>
              <p className="text-xs font-bold text-amber-800 leading-relaxed">{asString(recoveryPreview.description) || "-"}</p>

              <div className="grid grid-cols-2 gap-4 text-[11px] font-bold text-amber-700 tabular-nums">
                <p>기준 아이템: {recoveryPreview.itemCount ?? 0}건</p>
                <p>대상 일수: {recoveryPreview.dailyDays ?? 0}일</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">실행 로그 요약</p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-amber-800">
                  {(recoveryPreview.notes ?? []).slice(0, 3).map((line, index) => (
                    <li key={`recovery-note-${index}`}>{asString(line)}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => void runRecovery()}
                  className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-amber-700 disabled:opacity-60 transition-colors"
                >
                  {recovering ? "복구 실행 중..." : "분석 내용 확인 후 실행"}
                </button>
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => setRecoveryPreview(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
