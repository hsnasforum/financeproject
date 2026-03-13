"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CandidateComparisonSection from "@/app/planning/reports/_components/CandidateComparisonSection";
import ReportAdvancedRaw from "@/app/planning/reports/_components/ReportAdvancedRaw";
import ReportBenefitsSection from "@/app/planning/reports/_components/ReportBenefitsSection";
import ReportDashboard from "@/app/planning/reports/_components/ReportDashboard";
import ReportRecommendationsSection from "@/app/planning/reports/_components/ReportRecommendationsSection";
import { toInterpretationInputFromReportVM } from "@/app/planning/reports/_lib/reportInterpretationAdapter";
import { buildPlanningBenefitSignals } from "@/app/planning/reports/_lib/recommendationSignals";
import { buildReportVMFromRun, safeBuildReportVMFromRun } from "@/app/planning/reports/_lib/reportViewModel";
import { BENEFIT_TOPICS } from "@/lib/publicApis/benefitsTopics";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";
import { formatDate, formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import { computeRunDelta, type RunDeltaMetric } from "@/lib/planning/v2/scenario";

type ReportDetail = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  markdown: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  id: string;
};

type DetailTabId = "overview" | "interpretation" | "offers" | "comparison" | "advanced";

type BaselineRunOption = {
  id: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
};

type RawBlobPreview = {
  text: string;
  nextCursor: number;
  hasMore: boolean;
  totalChars: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatCompactKrw(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDeltaMetricValue(metric: RunDeltaMetric, value: number): string {
  if (metric.key === "dsrPct") return formatPct("ko-KR", value);
  if (metric.key === "emergencyFundMonths") return `${Math.round(value * 10) / 10}개월`;
  if (
    metric.key === "monthlySurplusKrw"
    || metric.key === "endNetWorthKrw"
    || metric.key === "worstCashKrw"
  ) {
    return formatKrw("ko-KR", value);
  }
  return value.toLocaleString("ko-KR");
}

function deltaTone(metric: RunDeltaMetric): {
  positive: string;
  negative: string;
  neutral: string;
  rowPositive: string;
  rowNegative: string;
  rowNeutral: string;
} {
  const positiveIsGood = metric.key === "monthlySurplusKrw"
    || metric.key === "emergencyFundMonths"
    || metric.key === "endNetWorthKrw"
    || metric.key === "worstCashKrw";
  if (positiveIsGood) {
    return {
      positive: "text-emerald-200",
      negative: "text-rose-200",
      neutral: "text-white/85",
      rowPositive: "bg-emerald-500/10",
      rowNegative: "bg-rose-500/10",
      rowNeutral: "",
    };
  }
  return {
    positive: "text-rose-200",
    negative: "text-emerald-200",
    neutral: "text-white/85",
    rowPositive: "bg-rose-500/10",
    rowNegative: "bg-emerald-500/10",
    rowNeutral: "",
  };
}

function deltaClassName(metric: RunDeltaMetric): string {
  const tone = deltaTone(metric);
  if (metric.delta > 0) return tone.positive;
  if (metric.delta < 0) return tone.negative;
  return tone.neutral;
}

function deltaRowClassName(metric: RunDeltaMetric): string {
  const tone = deltaTone(metric);
  if (metric.delta > 0) return tone.rowPositive;
  if (metric.delta < 0) return tone.rowNegative;
  return tone.rowNeutral;
}

function statusBadge(input: {
  worstCashKrw?: number;
  criticalWarnings?: number;
  dsrPct?: number;
  totalWarnings?: number;
  goalsAchieved?: string;
}) {
  const goalsAchieved = asString(input.goalsAchieved);
  const [achievedRaw, totalRaw] = goalsAchieved.split("/");
  const achieved = Number(achievedRaw);
  const total = Number(totalRaw);
  const missedGoal = Number.isFinite(achieved) && Number.isFinite(total) && total > achieved;

  const worstCash = input.worstCashKrw ?? 0;
  const criticalWarnings = input.criticalWarnings ?? 0;
  const dsrPct = input.dsrPct ?? 0;
  const totalWarnings = input.totalWarnings ?? 0;

  if (worstCash <= 0 || criticalWarnings > 0 || dsrPct >= 60) {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
      reason: "현금 부족/치명 경고/높은 DSR 신호가 있어 즉시 조정이 필요합니다.",
    };
  }
  if (dsrPct >= 40 || totalWarnings >= 8 || missedGoal) {
    return {
      label: "주의",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      reason: "일부 지표가 경고 구간입니다. 목표/지출/부채 전략을 점검하세요.",
    };
  }
  return {
    label: "양호",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    reason: "현재 지표 기준으로는 큰 위험 신호가 관측되지 않았습니다.",
  };
}

export default function PlanningReportDetailClient({ id }: Props) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [run, setRun] = useState<PlanningRunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTabId>("overview");
  const [resolvedRunId, setResolvedRunId] = useState("");
  const [advancedRawRunPreview, setAdvancedRawRunPreview] = useState<RawBlobPreview | null>(null);
  const [advancedRawLoading, setAdvancedRawLoading] = useState(false);
  const [advancedRawError, setAdvancedRawError] = useState("");
  const [baselineOptions, setBaselineOptions] = useState<BaselineRunOption[]>([]);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [baselineRun, setBaselineRun] = useState<PlanningRunRecord | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError("");
      setReport(null);
      setRun(null);
      setResolvedRunId("");
      setActiveTab("overview");
      setAdvancedRawRunPreview(null);
      setAdvancedRawLoading(false);
      setAdvancedRawError("");
      setBaselineOptions([]);
      setBaselineRunId("");
      setBaselineRun(null);
      setBaselineLoading(false);
      setBaselineError("");
      setCompareMode(false);

      try {
        const runRes = await fetch(`/api/planning/v2/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
        const runPayload = (await runRes.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (runRes.ok && runPayload?.ok && runPayload.data) {
          setRun(runPayload.data);
          setResolvedRunId(runPayload.data.id);
          return;
        }

        const reportRes = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
        const reportPayload = (await reportRes.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
        if (!active) return;
        if (!reportRes.ok || !reportPayload?.ok || !reportPayload.data) {
          setError("실행 기록을 찾을 수 없습니다. /planning/reports에서 실행 기록을 선택하세요.");
          return;
        }

        setReport(reportPayload.data);
        const fallbackRunId = asString(reportPayload.data.runId);
        if (!fallbackRunId) {
          return;
        }
        const fallbackRunRes = await fetch(`/api/planning/v2/runs/${encodeURIComponent(fallbackRunId)}`, { cache: "no-store" });
        const fallbackRunPayload = (await fallbackRunRes.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (!fallbackRunRes.ok || !fallbackRunPayload?.ok || !fallbackRunPayload.data) {
          setError(fallbackRunPayload?.error?.message ?? "연결된 실행 기록을 불러오지 못했습니다.");
          return;
        }
        setRun(fallbackRunPayload.data);
        setResolvedRunId(fallbackRunPayload.data.id);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "리포트 로드 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    setCompareMode(Boolean(run?.scenario || run?.input?.scenario));
  }, [run?.id, run?.input?.scenario, run?.scenario]);

  useEffect(() => {
    let active = true;

    async function loadAdvancedRawPreview(mode: "reset" | "append"): Promise<void> {
      const fallbackRunId = run?.id || asString(report?.runId);
      const runId = resolvedRunId || fallbackRunId;
      if (activeTab !== "advanced") return;
      if (!runId) return;
      if (advancedRawLoading) return;
      if (!runId || runId === "-") return;
      if (mode === "append" && !advancedRawRunPreview?.hasMore) return;

      setAdvancedRawLoading(true);
      setAdvancedRawError("");
      try {
        const csrf = readDevCsrfToken();
        const cursor = mode === "append" ? (advancedRawRunPreview?.nextCursor ?? 0) : 0;
        const params = new URLSearchParams();
        params.set("view", "preview");
        params.set("chunkChars", "20000");
        params.set("cursor", String(cursor));
        params.set("gzip", "1");
        if (csrf) params.set("csrf", csrf);
        const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}/blob/raw?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<{
          text?: string;
          nextCursor?: number;
          hasMore?: boolean;
          totalChars?: number;
        }> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok) {
          const message = payload?.error?.message ?? "고급 원문 로드에 실패했습니다.";
          setAdvancedRawError(message);
          return;
        }
        const nextChunkText = typeof payload.data?.text === "string" ? payload.data.text : "";
        const nextCursor = Number(payload.data?.nextCursor ?? 0);
        const hasMore = payload.data?.hasMore === true;
        const totalChars = Math.max(nextChunkText.length, Number(payload.data?.totalChars ?? nextChunkText.length));
        setAdvancedRawRunPreview((prev) => {
          if (mode === "append" && prev) {
            return {
              text: `${prev.text}${nextChunkText}`,
              nextCursor: Number.isFinite(nextCursor) ? Math.max(prev.nextCursor, nextCursor) : prev.nextCursor,
              hasMore,
              totalChars: Number.isFinite(totalChars) ? Math.max(prev.totalChars, totalChars) : prev.totalChars,
            };
          }
          return {
            text: nextChunkText,
            nextCursor: Number.isFinite(nextCursor) ? Math.max(0, nextCursor) : nextChunkText.length,
            hasMore,
            totalChars: Number.isFinite(totalChars) ? Math.max(nextChunkText.length, totalChars) : nextChunkText.length,
          };
        });
      } catch (loadError) {
        if (!active) return;
        setAdvancedRawError(loadError instanceof Error ? loadError.message : "고급 원문 로드에 실패했습니다.");
      } finally {
        if (active) setAdvancedRawLoading(false);
      }
    }

    if (activeTab === "advanced" && advancedRawRunPreview === null) {
      void loadAdvancedRawPreview("reset");
    }
    return () => {
      active = false;
    };
  }, [activeTab, advancedRawLoading, advancedRawRunPreview, report?.runId, resolvedRunId, run?.id]);

  async function handleLoadMoreAdvancedRaw(): Promise<void> {
    const fallbackRunId = run?.id || asString(report?.runId);
    const runId = resolvedRunId || fallbackRunId;
    if (!runId || advancedRawLoading) return;
    const csrf = readDevCsrfToken();
    const cursor = advancedRawRunPreview?.nextCursor ?? 0;
    const params = new URLSearchParams();
    params.set("view", "preview");
    params.set("chunkChars", "20000");
    params.set("cursor", String(cursor));
    params.set("gzip", "1");
    if (csrf) params.set("csrf", csrf);

    setAdvancedRawLoading(true);
    setAdvancedRawError("");
    try {
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}/blob/raw?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ApiResponse<{
        text?: string;
        nextCursor?: number;
        hasMore?: boolean;
        totalChars?: number;
      }> | null;
      if (!response.ok || !payload?.ok) {
        setAdvancedRawError(payload?.error?.message ?? "고급 원문 로드에 실패했습니다.");
        return;
      }
      const nextChunkText = typeof payload.data?.text === "string" ? payload.data.text : "";
      const nextCursor = Number(payload.data?.nextCursor ?? 0);
      const hasMore = payload.data?.hasMore === true;
      const totalChars = Math.max(nextChunkText.length, Number(payload.data?.totalChars ?? nextChunkText.length));
      setAdvancedRawRunPreview((prev) => ({
        text: `${prev?.text ?? ""}${nextChunkText}`,
        nextCursor: Number.isFinite(nextCursor) ? Math.max(prev?.nextCursor ?? 0, nextCursor) : (prev?.nextCursor ?? 0),
        hasMore,
        totalChars: Number.isFinite(totalChars) ? Math.max(prev?.totalChars ?? 0, totalChars) : (prev?.totalChars ?? 0),
      }));
    } catch (error) {
      setAdvancedRawError(error instanceof Error ? error.message : "고급 원문 로드에 실패했습니다.");
    } finally {
      setAdvancedRawLoading(false);
    }
  }

  function handleRetryAdvancedRaw(): void {
    setAdvancedRawError("");
    setAdvancedRawRunPreview(null);
  }

  useEffect(() => {
    let active = true;
    async function loadBaselineOptions(): Promise<void> {
      if (!compareMode) return;
      if (!run?.profileId) {
        setBaselineOptions([]);
        setBaselineRunId("");
        return;
      }
      try {
        const response = await fetch(`/api/planning/v2/runs?profileId=${encodeURIComponent(run.profileId)}&limit=20`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord[]> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          setBaselineOptions([]);
          setBaselineRunId("");
          return;
        }
        const options = payload.data
          .filter((entry) => entry.id !== run.id)
          .filter((entry) => entry.overallStatus === "SUCCESS" || entry.overallStatus === "PARTIAL_SUCCESS")
          .map((entry) => ({
            id: entry.id,
            ...(entry.title ? { title: entry.title } : {}),
            createdAt: entry.createdAt,
            ...(entry.overallStatus ? { overallStatus: entry.overallStatus } : {}),
          }));
        setBaselineOptions(options);
        const scenarioBaseline = asString(run.scenario?.baselineRunId || run.input?.scenario?.baseRunId);
        setBaselineRunId((prev) => {
          if (prev && options.some((option) => option.id === prev)) return prev;
          if (scenarioBaseline && options.some((option) => option.id === scenarioBaseline)) return scenarioBaseline;
          return options[0]?.id ?? "";
        });
      } catch {
        if (!active) return;
        setBaselineOptions([]);
        setBaselineRunId("");
      }
    }
    void loadBaselineOptions();
    return () => {
      active = false;
    };
  }, [compareMode, run?.id, run?.profileId, run?.scenario?.baselineRunId, run?.input?.scenario?.baseRunId]);

  useEffect(() => {
    let active = true;
    async function loadBaselineRun(): Promise<void> {
      if (!compareMode) {
        setBaselineRun(null);
        setBaselineError("");
        return;
      }
      if (!baselineRunId) {
        setBaselineRun(null);
        setBaselineError("");
        return;
      }
      setBaselineLoading(true);
      setBaselineError("");
      try {
        const response = await fetch(`/api/planning/runs/${encodeURIComponent(baselineRunId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !payload.data) {
          setBaselineRun(null);
          setBaselineError(payload?.error?.message ?? "기준 실행을 불러오지 못했습니다.");
          return;
        }
        setBaselineRun(payload.data);
      } catch (error) {
        if (!active) return;
        setBaselineRun(null);
        setBaselineError(error instanceof Error ? error.message : "기준 실행을 불러오지 못했습니다.");
      } finally {
        if (active) setBaselineLoading(false);
      }
    }
    void loadBaselineRun();
    return () => {
      active = false;
    };
  }, [baselineRunId, compareMode]);

  const vm = useMemo(
    () => safeBuildReportVMFromRun(run, report ?? { id }),
    [id, report, run],
  );
  const vmData = useMemo(
    () => vm.vm ?? buildReportVMFromRun(null, report ?? { id }),
    [id, report, vm.vm],
  );
  const vmError = vm.error;
  const baselineVm = useMemo(
    () => baselineRun
      ? safeBuildReportVMFromRun(baselineRun, { id: baselineRun.id, runId: baselineRun.id, createdAt: baselineRun.createdAt })
      : { vm: null, error: null },
    [baselineRun],
  );
  const baselineVmData = baselineVm.vm;
  const runDelta = useMemo(
    () => (baselineVmData && vmData ? computeRunDelta(baselineVmData, vmData) : null),
    [baselineVmData, vmData],
  );
  const interpretationInput = useMemo(
    () => toInterpretationInputFromReportVM(vmData),
    [vmData],
  );
  const badge = useMemo(
    () => statusBadge({
      worstCashKrw: vmData.summaryCards.worstCashKrw,
      criticalWarnings: vmData.summaryCards.criticalWarnings,
      dsrPct: vmData.summaryCards.dsrPct,
      totalWarnings: vmData.summaryCards.totalWarnings,
      goalsAchieved: vmData.summaryCards.goalsAchieved,
    }),
    [vmData.summaryCards],
  );
  const simulateStage = vmData.stage.byId.simulate;
  const canRenderInterpretability = !simulateStage || simulateStage.status === "SUCCESS";
  const advancedOpen = activeTab === "advanced";
  const selectedProfileId = run?.profileId ?? "";
  const planningHref = appendProfileIdQuery("/planning", selectedProfileId);
  const runsHref = appendProfileIdQuery("/planning/runs", selectedProfileId);
  const reportsHubHref = appendProfileIdQuery("/planning/reports", selectedProfileId);
  const reportRunId = resolvedRunId || vmData.header.runId;
  const tabOptions = useMemo(() => {
    const recommendationLabel = reportRunId ? "제안" : "혜택";
    return [
      { id: "overview", label: "요약" },
      { id: "interpretation", label: "해석" },
      { id: "offers", label: recommendationLabel },
      { id: "comparison", label: compareMode ? "비교" : "상품 비교" },
      { id: "advanced", label: "고급" },
    ] satisfies Array<{ id: DetailTabId; label: string }>;
  }, [compareMode, reportRunId]);
  const activeTabMeta = useMemo(() => {
    if (activeTab === "interpretation") {
      return {
        title: "결과 해석",
        description: "위험 신호와 다음 행동을 먼저 읽는 탭입니다.",
      };
    }
    if (activeTab === "offers") {
      return {
        title: "추천과 혜택",
        description: "현재 결과에서 바로 이어서 볼 상품과 혜택만 모았습니다.",
      };
    }
    if (activeTab === "comparison") {
      return {
        title: "비교와 후보",
        description: "기준 실행 변화와 상품 비교표를 따로 볼 수 있습니다.",
      };
    }
    if (activeTab === "advanced") {
      return {
        title: "고급 보기",
        description: "재현성 정보와 원문 데이터를 확인하는 탭입니다.",
      };
    }
    return {
      title: "결과 요약",
      description: "핵심 지표와 경고, 목표 상태를 먼저 확인하는 탭입니다.",
    };
  }, [activeTab]);
  const headerStats = useMemo(() => {
    if (activeTab === "interpretation") {
      return [
        { label: "치명 경고", value: `${vmData.summaryCards.criticalWarnings ?? 0}건` },
        { label: "다음 액션", value: `${vmData.actionRows.length}개` },
        { label: "DSR", value: typeof vmData.summaryCards.dsrPct === "number" ? formatPct("ko-KR", vmData.summaryCards.dsrPct) : "-" },
      ];
    }
    if (activeTab === "offers") {
      return [
        { label: "상품 후보", value: reportRunId ? "연결됨" : "없음" },
        { label: "혜택 주제", value: `${Math.min(5, vmData.actionRows.length + 1)}개` },
        { label: "프로필", value: run?.profileId ? "연결됨" : "없음" },
      ];
    }
    if (activeTab === "comparison") {
      return [
        { label: "비교 모드", value: compareMode ? "켜짐" : "꺼짐" },
        { label: "기준 실행", value: baselineRunId ? baselineRunId.slice(0, 8) : "-" },
        { label: "후보 비교", value: resolvedRunId || vmData.header.runId ? "가능" : "없음" },
      ];
    }
    if (activeTab === "advanced") {
      return [
        { label: "engine schema", value: String(vmData.contract?.engineSchemaVersion ?? "-") },
        { label: "fallback", value: vmData.contract?.fallbacks.length ? `${vmData.contract.fallbacks.length}개` : "없음" },
        { label: "run", value: (resolvedRunId || vmData.header.runId).slice(0, 8) || "-" },
      ];
    }
    return [
      { label: "말기 순자산", value: formatCompactKrw(vmData.summaryCards.endNetWorthKrw) },
      { label: "최저 현금", value: formatCompactKrw(vmData.summaryCards.worstCashKrw) },
      { label: "목표 달성", value: vmData.summaryCards.goalsAchieved ?? "-" },
    ];
  }, [
    activeTab,
    baselineRunId,
    compareMode,
    reportRunId,
    resolvedRunId,
    run?.profileId,
    vmData.actionRows.length,
    vmData.contract?.engineSchemaVersion,
    vmData.contract?.fallbacks.length,
    vmData.header.runId,
    vmData.summaryCards.criticalWarnings,
    vmData.summaryCards.dsrPct,
    vmData.summaryCards.endNetWorthKrw,
    vmData.summaryCards.goalsAchieved,
    vmData.summaryCards.worstCashKrw,
  ]);
  const comparisonHighlights = useMemo(() => {
    if (!runDelta) return [];
    const preferredOrder: RunDeltaMetric["key"][] = ["endNetWorthKrw", "monthlySurplusKrw", "worstCashKrw"];
    return preferredOrder
      .map((key) => runDelta.metrics.find((metric) => metric.key === key))
      .filter((metric): metric is RunDeltaMetric => Boolean(metric))
      .map((metric) => ({
        ...metric,
        deltaLabel: `${metric.delta >= 0 ? "+" : ""}${formatDeltaMetricValue(metric, metric.delta)}`,
      }));
  }, [runDelta]);
  const leadAction = vmData.actionRows[0] ?? null;
  const offersSummary = useMemo(() => {
    const topWarning = vmData.warningAgg[0];
    const openGoal = vmData.goalsTable.find((goal) => goal.achieved !== true);
    const benefitSignals = buildPlanningBenefitSignals(vmData, run?.profileId ? {
      currentAge: undefined,
      birthYear: undefined,
      gender: undefined,
      sido: undefined,
      sigungu: undefined,
    } : undefined);
    return {
      headline: leadAction
        ? `${leadAction.title}에 맞춰 상품과 혜택 우선순위를 묶었습니다.`
        : "현재 결과에 맞는 상품과 혜택 후보를 함께 정리했습니다.",
      lines: [
        topWarning ? `가장 큰 신호는 '${topWarning.title}' 입니다.` : "현재 경고 흐름을 먼저 반영했습니다.",
        openGoal ? `미달 목표 '${openGoal.name}' 기준으로 다음 선택지를 좁혔습니다.` : "주요 목표 상태를 기준으로 후보를 정리했습니다.",
        `혜택은 ${benefitSignals.topics.length}개 주제를 중심으로 모았습니다.`,
      ],
      topics: benefitSignals.topics,
    };
  }, [leadAction, run?.profileId, vmData]);

  return (
    <PageShell>
      <PageHeader
        title="재무설계 리포트"
        description="run 기반 대시보드"
        action={(
          <div className="flex items-center gap-3 text-sm">
            <Link className="font-semibold text-emerald-700" href={planningHref}>플래닝</Link>
            <Link className="font-semibold text-emerald-700" href={reportsHubHref}>리포트</Link>
            <Link className="font-semibold text-emerald-700" href={runsHref}>실행 기록</Link>
          </div>
        )}
      />

      {loading ? (
        <LoadingState title="리포트를 불러오는 중입니다" testId="planning-reports-loading-state" />
      ) : error ? (
        <ErrorState message={error} testId="planning-reports-error-state" />
      ) : !run && report ? (
        <div className="space-y-5" data-testid="planning-reports-manual-detail-root">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>id: {report.id}</span>
              <span>·</span>
              <span>createdAt: {formatDate("ko-KR", report.createdAt)}</span>
              <span>·</span>
              <span>manual report</span>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              연결된 실행 기록이 없는 수동 리포트입니다. run 기반 대시보드와 비교 기능은 비활성화되지만, 마크다운 원문과 다운로드는 계속 볼 수 있습니다.
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-50"
                href={`/api/planning/v2/reports/${encodeURIComponent(report.id)}/download`}
              >
                마크다운 다운로드
              </a>
              <Link
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-50"
                href={reportsHubHref}
              >
                리포트 허브
              </Link>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">원본 Markdown</p>
              <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                {report.markdown}
              </pre>
            </div>
          </Card>
        </div>
      ) : !run ? (
        <EmptyState
          title="표시할 리포트 데이터가 없습니다"
          description="실행 기록을 다시 선택하거나 새로고침 후 다시 시도하세요."
          icon="data"
        />
      ) : (
        <div className="space-y-5" data-testid="planning-reports-detail-root">
          {vmError ? (
            <ErrorState message={`선택한 실행의 리포트를 구성하지 못했습니다. ${vmError}`} />
          ) : null}
          <Card className="overflow-hidden border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Report Overview</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">결과 리포트 프레임</h2>
                <p className="mt-2 text-sm leading-6 text-white/75">{badge.reason}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>
                상태: {badge.label}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] text-white/55">report id</p>
                <p className="mt-1 break-all text-sm font-bold text-white">{vmData.header.reportId}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] text-white/55">created at</p>
                <p className="mt-1 text-sm font-bold text-white">{formatDate("ko-KR", vmData.header.createdAt)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] text-white/55">run id</p>
                <p className="mt-1 break-all text-sm font-bold text-white">{vmData.header.runId}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] text-white/55">engine schema</p>
                <p className="mt-1 text-sm font-bold text-white">{vmData.contract?.engineSchemaVersion ?? "-"}</p>
                {vmData.contract?.fallbacks.length ? (
                  <p className="mt-2 text-[11px] text-white/60">{vmData.contract.fallbacks.join(", ")}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                aria-label="리포트 허브"
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
                href={reportsHubHref}
              >
                리포트 허브
              </Link>
              <Button
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
                onClick={() => window.print()}
                size="sm"
                type="button"
                variant="ghost"
              >
                브라우저 인쇄
              </Button>
              <Button
                data-testid="planning-reports-advanced-toggle"
                onClick={() => setActiveTab((prev) => (prev === "advanced" ? "overview" : "advanced"))}
                size="sm"
                variant="ghost"
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
              >
                {advancedOpen ? "요약으로 돌아가기" : "고급 보기"}
              </Button>
            </div>
          </Card>

          <div className="space-y-4">
            <div className="sticky top-3 z-10 rounded-3xl border border-white/10 bg-gradient-to-r from-slate-950/95 via-slate-900/95 to-slate-800/95 p-3 shadow-xl backdrop-blur">
              <SegmentedTabs
                activeTab={activeTab}
                className="w-full md:w-full"
                onChange={(tabId) => setActiveTab(tabId as DetailTabId)}
                options={tabOptions}
                tone="dark"
              />
              <div className="mt-3 grid gap-3 px-1 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <p className="text-sm font-bold text-white">{activeTabMeta.title}</p>
                  <p className="text-xs text-white/65">{activeTabMeta.description}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {headerStats.map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 backdrop-blur" key={`${activeTab}-${item.label}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{item.label}</p>
                        <p className="mt-1 text-sm font-bold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap content-start gap-2 lg:max-w-[220px] lg:justify-end">
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">경고 {vmData.warningAgg.length}</span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">액션 {vmData.actionRows.length}</span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">목표 {vmData.goalsTable.length}</span>
                </div>
              </div>
            </div>

            {activeTab === "overview" ? (
              <div className="space-y-5">
                <ReportDashboard vm={vmData} />
              </div>
            ) : null}

            {activeTab === "interpretation" ? (
              canRenderInterpretability ? (
                <InterpretabilityGuideCard
                  aggregatedWarnings={interpretationInput.aggregatedWarnings}
                  goals={interpretationInput.goals}
                  monthlyOperatingGuide={vmData.monthlyOperatingGuide}
                  summaryMetrics={interpretationInput.summary}
                  outcomes={interpretationInput.outcomes}
                  summaryEvidence={interpretationInput.summaryEvidence}
                />
              ) : (
                <Card className="border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-sm text-white/80">
                  해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
                </Card>
              )
            ) : null}

            {activeTab === "offers" ? (
              <div className="space-y-5">
                <Card className="overflow-hidden border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Why These</p>
                      <h2 className="mt-2 text-xl font-black tracking-tight text-white">{offersSummary.headline}</h2>
                      <div className="mt-3 space-y-1.5 text-sm text-white/78">
                        {offersSummary.lines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    </div>
                    <div className="flex max-w-sm flex-wrap gap-2">
                      {offersSummary.topics.length > 0 ? offersSummary.topics.map((topic) => (
                        <span
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white"
                          key={`offer-topic-${topic}`}
                        >
                          {BENEFIT_TOPICS[topic].label}
                        </span>
                      )) : (
                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
                          범용 후보 중심
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
                {reportRunId ? (
                  <ReportRecommendationsSection runId={reportRunId} vm={vmData} />
                ) : null}
                <ReportBenefitsSection profileId={run?.profileId} vm={vmData} />
              </div>
            ) : null}

            {activeTab === "comparison" ? (
              <div className="space-y-5">
                <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">What-if Compare</p>
                      <h2 className="mt-1 text-base font-bold text-white">기준 실행 대비 비교</h2>
                    </div>
                    <Button
                      data-testid="compare-toggle"
                      onClick={() => setCompareMode((prev) => !prev)}
                      size="sm"
                      variant="ghost"
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      {compareMode ? "비교 끄기" : "비교 켜기"}
                    </Button>
                  </div>
                  {compareMode ? (
                    <>
                      <select
                        className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white"
                        data-testid="baseline-selector"
                        value={baselineRunId}
                        onChange={(event) => setBaselineRunId(event.target.value)}
                      >
                        <option value="">기준 실행 선택</option>
                        {baselineOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title ? `${option.title} · ` : ""}{option.id.slice(0, 8)} · {formatDate("ko-KR", option.createdAt)}
                          </option>
                        ))}
                      </select>
                      {baselineLoading ? <LoadingState title="기준 실행 비교를 준비하는 중입니다" /> : null}
                      {baselineError ? <ErrorState message={baselineError} /> : null}
                      {!baselineLoading && !baselineError && runDelta ? (
                        <div className="space-y-3" data-testid="delta-cards">
                          {comparisonHighlights.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-3">
                              {comparisonHighlights.map((metric) => (
                                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur" key={`highlight-${metric.key}`}>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{metric.label}</p>
                                  <p className={`mt-2 text-lg font-black ${metric.delta >= 0 ? "text-emerald-200" : "text-rose-200"}`}>
                                    {metric.deltaLabel}
                                  </p>
                                  <p className="mt-1 text-xs text-white/65">
                                    기준 {formatDeltaMetricValue(metric, metric.baseline)}
                                    {" -> "}
                                    시나리오 {formatDeltaMetricValue(metric, metric.scenario)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
                            <table className="min-w-full divide-y divide-white/10 text-sm text-white">
                              <thead className="bg-white/10">
                                <tr>
                                  <th className="px-3 py-2 text-left">지표</th>
                                  <th className="px-3 py-2 text-right">기준</th>
                                  <th className="px-3 py-2 text-right">시나리오</th>
                                  <th className="px-3 py-2 text-right">변화</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/10">
                                {runDelta.metrics.map((metric) => (
                                  <tr className={deltaRowClassName(metric)} key={metric.key}>
                                    <td className="px-3 py-2 font-semibold text-white">{metric.label}</td>
                                    <td className="px-3 py-2 text-right text-white/70">{formatDeltaMetricValue(metric, metric.baseline)}</td>
                                    <td className="px-3 py-2 text-right text-white">{formatDeltaMetricValue(metric, metric.scenario)}</td>
                                    <td className={`px-3 py-2 text-right font-bold ${deltaClassName(metric)}`}>
                                      {metric.delta >= 0 ? "+" : ""}{formatDeltaMetricValue(metric, metric.delta)}
                                      {" "}
                                      <span className="text-[11px] text-white/55">({metric.delta >= 0 ? "증가" : "감소"})</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-xs text-white/70">
                            경고 코드 변화: +{runDelta.warnings.added.length} / -{runDelta.warnings.removed.length}
                            {" · "}
                            목표 달성 수 변화: {runDelta.goals.achievedDelta >= 0 ? "+" : ""}{runDelta.goals.achievedDelta}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-white/70">기준 실행을 선택하면 변화량을 표시합니다.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/70">비교 모드를 켜면 기준 실행 대비 변화량을 볼 수 있습니다.</p>
                  )}
                </Card>

                {resolvedRunId || vmData.header.runId ? (
                  <CandidateComparisonSection runId={resolvedRunId || vmData.header.runId} />
                ) : null}
              </div>
            ) : null}

            {advancedOpen ? (
              <div className="space-y-2" id="planning-reports-advanced-panel">
                {advancedRawLoading ? (
                  <LoadingState
                    title="고급 탭 데이터를 준비하고 있습니다"
                    description="이 영역은 재현성/원문/디버깅 확인용입니다."
                  />
                ) : null}
                {advancedRawError ? (
                  <div className="space-y-2">
                    <ErrorState message={advancedRawError} />
                    <Button
                      className="w-fit"
                      onClick={handleRetryAdvancedRaw}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      다시 시도
                    </Button>
                  </div>
                ) : null}
                <Card className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-xs text-white/70">
                  이 탭은 사용자용 결과 해석보다 재현성, 원문, 디버깅 확인에 초점을 둡니다.
                </Card>
                <ReportAdvancedRaw
                  reproducibility={vmData.reproducibility}
                  raw={{
                    ...(vmData.raw?.reportMarkdown ? { reportMarkdown: vmData.raw.reportMarkdown } : {}),
                    ...(advancedRawRunPreview !== null
                      ? {
                        runJsonPreview: {
                          ...advancedRawRunPreview,
                          loading: advancedRawLoading,
                          ...(advancedRawError ? { error: advancedRawError } : {}),
                        },
                      }
                      : {}),
                  }}
                  onLoadMoreRunJson={() => void handleLoadMoreAdvancedRaw()}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}
