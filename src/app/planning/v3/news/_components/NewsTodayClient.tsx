"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Daily Brief"
          title="오늘 재무 브리핑"
          description="핵심 관찰과 내 상황 영향을 먼저 보고, 필요한 항목만 아래에서 자세히 확인하면 됩니다."
          action={(
            <>
                <Link href="/planning/v3/news/trends" className={reportHeroActionLinkClassName}>
                  트렌드
                </Link>
                <Link href="/planning/v3/journal" className={reportHeroActionLinkClassName}>
                  저널
                </Link>
                <Link href={profile ? "/planning/v3/news/settings" : "/planning/v3/exposure"} className={reportHeroActionLinkClassName}>
                  {profile ? "설정" : "내 상황 입력"}
                </Link>
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  className={`${reportHeroPrimaryActionClassName} disabled:opacity-60`}
                >
                  {refreshing ? "갱신 중..." : "지금 갱신"}
                </button>
            </>
          )}
        >
          <p className="text-sm font-semibold text-white/85">{priorityMessage}</p>
          <ReportHeroStatGrid>
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
              label="watch 상태"
              value={`${watchlistRows.length}개 중 ${unresolvedWatchCount}개 점검 필요`}
              description="unknown 또는 설정 누락 항목"
            />
            <ReportHeroStatCard
              label="내 상황 연결"
              value={profile ? "연결됨" : "미입력"}
              description={profile ? "개인 영향 요약이 표시됩니다." : "프로필을 입력하면 영향 설명이 구체화됩니다."}
            />
          </ReportHeroStatGrid>

          <div className="flex flex-wrap gap-2 text-xs">
            <a href="#news-today-observation" className={reportHeroAnchorLinkClassName}>오늘 핵심</a>
            <a href="#news-today-watchlist" className={reportHeroAnchorLinkClassName}>watchlist</a>
            <a href="#news-today-scenarios" className={reportHeroAnchorLinkClassName}>시나리오</a>
            <a href="#news-today-ops" className={reportHeroAnchorLinkClassName}>고급 작업</a>
          </div>

          {notice ? <p className="text-xs font-semibold text-emerald-300">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-300">{errorMessage}</p> : null}
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <Card id="news-today-observation" className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">오늘 핵심</h2>
              <p className="text-xs text-slate-500">가장 먼저 읽을 한 줄 요약과, 근거가 되는 링크를 같이 봅니다.</p>
            </div>
            {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : <p className="text-sm leading-6 text-slate-800">{asString(data?.digest?.observation) || "데이터 없음"}</p>}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">반대 시그널</p>
                <span className="text-xs text-slate-500">{counterSignalCount}건</span>
              </div>
              {!data?.digest?.counterSignals?.length ? (
                <p className="mt-1 text-sm text-slate-600">반대 시그널 없음</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
                  {data.digest.counterSignals.map((row, index) => (
                    <li key={`${row}-${index}`}>{asString(row)}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">근거 링크</h2>
              <span className="text-xs text-slate-500">{evidenceCount}건</span>
            </div>
            {!data?.digest?.evidence?.length ? (
              <p className="text-sm text-slate-600">근거 링크 없음</p>
            ) : (
              <ul className="space-y-2">
                {data.digest.evidence.slice(0, 5).map((row, index) => (
                  <li key={`${asString(row.url)}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                    <a href={asString(row.url)} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline underline-offset-2">
                      {asString(row.title) || asString(row.url) || "링크"}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">{asString(row.sourceId)} · {formatDateTime(row.publishedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card id="news-today-watchlist" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">watchlist</h2>
              <p className="text-xs text-slate-500">오늘 점검이 필요한 지표만 먼저 보고, 문제 항목은 바로 설정 화면으로 이동합니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setWatchAdvanced((prev) => !prev)}
              className="text-[11px] font-semibold text-emerald-700 underline underline-offset-2"
            >
              {watchAdvanced ? "고급 닫기" : "고급 보기"}
            </button>
          </div>

          {watchlistRows.length > 0 ? (
            <>
              {watchlistRows.some((row) => row.status === "unknown" || row.unknownReasonCode === "missing" || row.unknownReasonCode === "disabled") ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-800">상태 원인 안내</p>
                  <ul className="mt-1 space-y-1 text-xs text-amber-900">
                    {watchlistRows
                      .filter((row) => row.status === "unknown" || row.unknownReasonCode === "missing" || row.unknownReasonCode === "disabled")
                      .slice(0, 8)
                      .map((row) => (
                        <li key={`unknown-${row.seriesId}-${row.label}`}>
                          {row.label}: {row.unknownReasonLabel || "원인을 확인하지 못했습니다."}{" "}
                          {row.resolveHref ? (
                            <Link href={row.resolveHref} className="font-semibold underline underline-offset-2">
                              빠른 해결
                            </Link>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {watchlistRows.map((row) => (
                <li key={`${row.seriesId}-${row.label}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                    <p className={`text-xs font-bold ${gradeToneClass(row.grade)}`}>
                      {row.grade} {trendArrow(row.sparklineTrend)}
                    </p>
                  </div>
                  <div className="mt-1">
                    <Sparkline points={row.sparklinePoints} />
                  </div>
                  {watchAdvanced ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      최근값 {formatLastValue(row.sparklineLastValue)} · 기준일 {row.asOf ?? "-"}
                    </p>
                  ) : null}
                  {row.status === "unknown" ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {row.unknownReasonLabel || "데이터 부족"}
                      {row.resolveHref ? (
                        <>
                          {" · "}
                          <Link href={row.resolveHref} className="font-semibold underline underline-offset-2">
                            빠른 해결
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
                ))}
              </ul>
            </>
          ) : !data?.digest?.watchlist?.length ? (
            <p className="text-sm text-slate-600">체크 변수 없음</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.digest.watchlist.map((row, index) => (
                <li key={`${row}-${index}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {asString(row)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="news-today-scenarios" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">시나리오 비교</h2>
              <p className="text-xs text-slate-500">각 시나리오의 핵심 해석과 내 상황 영향 요약을 한 번에 비교합니다.</p>
            </div>
            <span className="text-xs text-slate-500">{scenarioCount}개</span>
          </div>
          {!data?.scenarios?.cards?.length ? (
            <p className="text-sm text-slate-600">시나리오 없음</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {data.scenarios.cards.map((card, index) => (
                (() => {
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
                    <div key={key} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-black text-slate-900">{asString(card.name) || "Scenario"}</p>
                      <p className="mt-1 text-xs text-slate-700">{asString(card.observation) || "-"}</p>
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">연결 토픽: {(card.linkedTopics ?? []).join(", ") || "-"}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">트리거: {scenario.triggerSummary || "-"}</p>
                      <p className="mt-1 text-[11px] text-slate-500">옵션: {(card.options ?? []).slice(0, 2).join(" / ") || "-"}</p>
                      {Array.isArray(card.quality?.uncertaintyLabels) && card.quality.uncertaintyLabels.length > 0 ? (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                          <p className="text-[11px] font-semibold text-amber-800">
                            불확실성 라벨 · 중복도 {qualityLevelLabel(card.quality?.dedupeLevel)} · 상충 {qualityLevelLabel(card.quality?.contradictionLevel)}
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900">
                            {card.quality.uncertaintyLabels.slice(0, 2).map((line, lineIndex) => (
                              <li key={`${key}-uncertainty-${lineIndex}`}>{asString(line)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold text-slate-700">내 상황 영향(요약)</p>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-emerald-700 underline underline-offset-2"
                            onClick={() => setAdvancedImpact((prev) => ({ ...prev, [key]: !showAdvanced }))}
                          >
                            {showAdvanced ? "고급 닫기" : "고급 보기"}
                          </button>
                        </div>

                        {isProfileMissing ? (
                          <p className="mt-1 text-[11px] text-slate-600">
                            Unknown (프로필 설정 필요){" "}
                            <Link href="/planning/v3/exposure" className="font-semibold text-emerald-700 underline underline-offset-2">설정하기</Link>
                          </p>
                        ) : (
                          <>
                            <p className="mt-1 text-[11px] text-slate-700">
                              부채 {gradeLabel(impact.debtServiceRisk)} · 물가 {gradeLabel(impact.inflationPressureRisk)} · 환율 {gradeLabel(impact.fxPressureRisk)} · 완충력 {gradeLabel(impact.bufferAdequacy)}
                            </p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
                              {impact.rationale.slice(0, 3).map((line, lineIndex) => (
                                <li key={`${key}-rationale-${lineIndex}`}>{line}</li>
                              ))}
                            </ul>
                          </>
                        )}

                        {showAdvanced ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            watch seriesIds: {impact.watch.length > 0 ? impact.watch.join(", ") : "-"}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          )}
        </Card>

        <Card id="news-today-ops" className="space-y-3 border-amber-200 bg-amber-50/60">
          <div>
            <h2 className="text-sm font-bold text-slate-900">고급 작업</h2>
            <p className="text-xs text-slate-700">일반 사용자는 거의 쓸 일이 없고, 데이터가 꼬였을 때만 캐시/트렌드 복구를 실행하면 됩니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={recovering}
              onClick={() => void requestRecoveryPreview("rebuild_caches")}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
            >
              캐시 재구성 요약 보기
            </button>
            <button
              type="button"
              disabled={recovering}
              onClick={() => void requestRecoveryPreview("recompute_trends")}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
            >
              트렌드 재계산 요약 보기
            </button>
          </div>

          {recoveryPreview ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-white p-3">
              <p className="text-xs font-bold text-amber-800">{asString(recoveryPreview.title) || "복구 요약"}</p>
              <p className="text-xs text-amber-900">{asString(recoveryPreview.description) || "-"}</p>
              <p className="text-xs text-amber-900">
                기준 아이템 {recoveryPreview.itemCount ?? 0}건 · 대상 일수 {recoveryPreview.dailyDays ?? 0}일
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                {(recoveryPreview.notes ?? []).slice(0, 3).map((line, index) => (
                  <li key={`recovery-note-${index}`}>{asString(line)}</li>
                ))}
              </ul>
              <p className="text-xs text-amber-900">
                예상 변경 파일: {(recoveryPreview.writeTargets ?? []).slice(0, 3).join(" / ") || "-"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => void runRecovery()}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {recovering ? "복구 실행 중..." : "요약 확인 후 실행"}
                </button>
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => setRecoveryPreview(null)}
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-60"
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
