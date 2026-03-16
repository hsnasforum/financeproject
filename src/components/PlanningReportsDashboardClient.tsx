"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toInterpretationInputFromReportVM } from "@/app/planning/reports/_lib/reportInterpretationAdapter";
import { type CandidateRecommendationsPayload } from "@/app/planning/reports/_lib/recommendationSignals";
import {
  safeBuildReportVMFromRun,
} from "@/app/planning/reports/_lib/reportViewModel";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import DisclosuresPanel from "@/components/planning/DisclosuresPanel";
import {
  bodyCompactFieldClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { StatCard } from "@/components/ui/StatCard";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Badge } from "@/components/ui/Badge";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import {
  buildRequestedReportRunScope,
  DEFAULT_REPORT_RUN_SCOPE_LIMIT,
} from "@/lib/planning/reports/runSelection";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import { reportFromNormalizationDisclosure, type NormalizationReport } from "@/lib/planning/v2/normalizationReport";
import { parsePlanningV2Response } from "@/lib/planning/api/contracts";
import { computeReportDeltas, type ReportDeltaItem } from "@/lib/planning/reports/computeDeltas";
import { REPORT_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";
import { cn } from "@/lib/utils";

export type PlanningReportsDashboardClientProps = {
  initialRuns?: PlanningRunRecord[];
  initialProfileId?: string;
  initialRunId?: string;
  initialLoadNotice?: string;
};

type CandidateApiResponse = {
  ok?: boolean;
  data?: CandidateRecommendationsPayload;
  error?: {
    message?: string;
  };
};

type GoalRow = {
  name: string;
  achieved: boolean;
  shortfall?: number;
};

type ActionRow = {
  title: string;
  steps: string[];
  severity: "critical" | "warn" | "info";
};

function DeferredReportSectionPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="space-y-3 p-6">
      <LoadingState description={title} />
      <p className="text-xs text-slate-400 font-medium">{description}</p>
    </Card>
  );
}

const DeferredReportBenefitsSection = dynamic(
  () => import("@/app/planning/reports/_components/ReportBenefitsSection"),
  {
    ssr: false,
    loading: () => (
      <DeferredReportSectionPlaceholder
        title="혜택 후보를 이어서 불러오는 중입니다"
        description="핵심 리포트를 먼저 연 뒤 보조금24 후보를 불러옵니다."
      />
    ),
  },
);

const DeferredReportRecommendationsSection = dynamic(
  () => import("@/app/planning/reports/_components/ReportRecommendationsSection"),
  {
    ssr: false,
    loading: () => (
      <DeferredReportSectionPlaceholder
        title="상품 비교 자료를 이어서 불러오는 중입니다"
        description="핵심 리포트를 먼저 연 뒤 추천 근거를 불러옵니다."
      />
    ),
  },
);

const DeferredCandidateComparisonSection = dynamic(
  () => import("@/app/planning/reports/_components/CandidateComparisonSection"),
  {
    ssr: false,
    loading: () => (
      <DeferredReportSectionPlaceholder
        title="후보 비교표를 이어서 불러오는 중입니다"
        description="핵심 리포트를 먼저 연 뒤 비교표를 불러옵니다."
      />
    ),
  },
);

const DeferredProductCandidatesPanel = dynamic(
  () => import("@/components/planning/ProductCandidatesPanel"),
  {
    ssr: false,
    loading: () => (
      <DeferredReportSectionPlaceholder
        title="실시간 상품 탐색을 이어서 불러오는 중입니다"
        description="핵심 리포트를 먼저 연 뒤 예금/적금 탐색 패널을 불러옵니다."
      />
    ),
  },
);

const DeferredPlanningReportsClient = dynamic(
  () => import("@/components/PlanningReportsClient").then((module) => module.PlanningReportsClient),
  {
    ssr: false,
    loading: () => null,
  },
);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRunLoadErrorMessage(message?: string): string {
  const raw = asString(message);
  if (!raw) return "실행 기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
  const lowered = raw.toLowerCase();
  if (lowered.includes("not found")) {
    return "선택한 실행 기록을 찾지 못했습니다. 다른 실행을 선택하거나 다시 저장해 주세요.";
  }
  return "실행 기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString("ko-KR", { hour12: false });
}


function severityLabel(value: ActionRow["severity"]): string {
  if (value === "critical") return "치명";
  if (value === "warn") return "경고";
  return "정보";
}

function directionLabel(direction: ReportDeltaItem["direction"]): string {
  if (direction === "up") return "증가";
  if (direction === "down") return "감소";
  return "변화 없음";
}

function formatMetricValue(unitKind: ReportDeltaItem["unitKind"], value: number): string {
  if (unitKind === "krw") return formatKrw("ko-KR", value);
  if (unitKind === "pct") return formatPct("ko-KR", value);
  if (unitKind === "months") return formatMonths("ko-KR", value);
  return Math.round(value).toLocaleString("ko-KR");
}

function formatMetricDelta(unitKind: ReportDeltaItem["unitKind"], delta: number): string {
  if (delta === 0) return formatMetricValue(unitKind, 0);
  const sign = delta > 0 ? "+" : "-";
  const absolute = Math.abs(delta);
  if (unitKind === "krw") return `${sign}${formatKrw("ko-KR", absolute)}`;
  if (unitKind === "pct") return `${sign}${formatPct("ko-KR", absolute)}`;
  if (unitKind === "months") return `${sign}${formatMonths("ko-KR", absolute)}`;
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}`;
}


export default function PlanningReportsDashboardClient(props: PlanningReportsDashboardClientProps) {
  const searchParams = useSearchParams();
  const hasInitialRuns = (props.initialRuns?.length ?? 0) > 0;
  const queryRunId = asString(searchParams.get("runId"));
  const queryBaseRunId = asString(searchParams.get("baseRunId"));
  const queryRecommendRunId = asString(searchParams.get("recommendRunId"));
  const preferredRunId = queryRunId || props.initialRunId || "";
  const initialPreferredRun = useMemo(
    () => props.initialRuns?.find((run) => run.id === preferredRunId) ?? null,
    [preferredRunId, props.initialRuns],
  );
  const initialScope = useMemo(
    () => buildRequestedReportRunScope({
      runs: props.initialRuns ?? [],
      requestedRun: initialPreferredRun,
      preferredRunId,
      fallbackProfileId: props.initialProfileId,
    }),
    [initialPreferredRun, preferredRunId, props.initialProfileId, props.initialRuns],
  );
  const [runs, setRuns] = useState<PlanningRunRecord[]>(initialScope.runs);
  const [selectedRunId, setSelectedRunId] = useState(initialScope.initialRunId);
  const [compareMode, setCompareMode] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [loading, setLoading] = useState((props.initialRuns?.length ?? 0) < 1);
  const [error, setError] = useState("");
  const [candidatePayload, setCandidatePayload] = useState<CandidateRecommendationsPayload | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [showCandidateInsights, setShowCandidateInsights] = useState(false);
  const [showBenefitInsights, setShowBenefitInsights] = useState(false);
  const [showRealtimeProductExplorer, setShowRealtimeProductExplorer] = useState(false);
  const [showAdvancedRaw, setShowAdvancedRaw] = useState(false);
  const [interactiveReady, setInteractiveReady] = useState(false);
  const showInitialLoadNotice = Boolean(props.initialLoadNotice) && (loading || (!error && runs.length < 1));

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );
  const resolvedProfileId = useMemo(
    () => selectedRun?.profileId || runs[0]?.profileId || initialScope.effectiveProfileId || props.initialProfileId || "",
    [initialScope.effectiveProfileId, props.initialProfileId, runs, selectedRun],
  );
  const selectedRunVm = useMemo(
    () => (
      selectedRun
        ? safeBuildReportVMFromRun(selectedRun, {
          id: selectedRun.id,
          runId: selectedRun.id,
          createdAt: selectedRun.createdAt,
        })
        : { vm: null, error: null }
    ),
    [selectedRun],
  );
  const selectedRunVmData = selectedRunVm.vm;
  const baselineOptions = useMemo(() => {
    return runs
      .filter((run) => run.id !== selectedRunId)
      .filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [runs, selectedRunId]);
  const baselineRun = useMemo(
    () => runs.find((run) => run.id === baselineRunId) ?? null,
    [baselineRunId, runs],
  );

  useEffect(() => {
    if (runs.length < 1 || selectedRun) return;
    const fallbackRunId = runs[0]?.id ?? "";
    if (!fallbackRunId) return;
    setSelectedRunId(fallbackRunId);
  }, [runs, selectedRun]);
  const baselineRunVm = useMemo(
    () => (
      baselineRun
        ? safeBuildReportVMFromRun(baselineRun, {
          id: baselineRun.id,
          runId: baselineRun.id,
          createdAt: baselineRun.createdAt,
        })
        : { vm: null, error: null }
    ),
    [baselineRun],
  );
  const baselineRunVmData = baselineRunVm.vm;
  const reportDeltaRows = useMemo(
    () => (selectedRunVmData && baselineRunVmData ? computeReportDeltas(selectedRunVmData, baselineRunVmData) : []),
    [baselineRunVmData, selectedRunVmData],
  );
  const interpretationInput = useMemo(() => {
    if (!selectedRunVmData) return null;
    return toInterpretationInputFromReportVM(selectedRunVmData);
  }, [selectedRunVmData]);
  const canRenderInterpretability = useMemo(() => {
    if (!selectedRun) return false;
    if (!Array.isArray(selectedRun.stages) || selectedRun.stages.length < 1) return true;
    const simulateStage = selectedRun.stages.find((stage) => stage.id === "simulate");
    return !simulateStage || simulateStage.status === "SUCCESS";
  }, [selectedRun]);
  const summaryCards = useMemo(() => {
    if (!selectedRunVmData) {
      return {
        endNetWorthKrw: undefined,
        worstCashKrw: undefined,
        debtServiceRatioPct: undefined,
        warningsCount: undefined,
      };
    }
    return {
      endNetWorthKrw: selectedRunVmData.summaryCards.endNetWorthKrw,
      worstCashKrw: selectedRunVmData.summaryCards.worstCashKrw,
      debtServiceRatioPct: selectedRunVmData.summaryCards.dsrPct,
      warningsCount: selectedRunVmData.summaryCards.totalWarnings,
    };
  }, [selectedRunVmData]);
  const warningRows = useMemo(
    () => (selectedRunVmData?.guide.warnings ?? []).map((warning) => ({
      code: warning.code,
      message: warning.sampleMessage,
      count: warning.count,
    })),
    [selectedRunVmData],
  );
  const goalRows = useMemo<GoalRow[]>(
    () => (selectedRunVmData?.guide.goals ?? []).map((goal) => ({
      name: goal.name,
      achieved: goal.achieved,
      ...(typeof goal.shortfallKrw === "number" ? { shortfall: goal.shortfallKrw } : {}),
    })),
    [selectedRunVmData],
  );
  const topActions = useMemo<ActionRow[]>(
    () => (selectedRunVmData?.actionRows ?? []).slice(0, 3).map((action) => ({
      title: action.title,
      steps: action.steps.slice(0, 3).map((step) => step.length <= 80 ? step : `${step.slice(0, 79)}…`),
      severity: action.severity,
    })),
    [selectedRunVmData],
  );
  const runNormalizationReport = useMemo<NormalizationReport>(() => {
    return reportFromNormalizationDisclosure(selectedRunVmData?.normalization, "실행 결과");
  }, [selectedRunVmData]);
  const planningHref = useMemo(
    () => appendProfileIdQuery("/planning", resolvedProfileId),
    [resolvedProfileId],
  );
  const runsHref = useMemo(
    () => appendProfileIdQuery("/planning/runs", resolvedProfileId),
    [resolvedProfileId],
  );
  const selectedRunDetailHref = useMemo(
    () => (selectedRun ? `/planning/reports/${encodeURIComponent(selectedRun.id)}` : ""),
    [selectedRun],
  );
  const selectedRunHasExplicitRecommendRef = Boolean(
    queryRecommendRunId
    && queryRunId
    && selectedRun?.id === queryRunId,
  );
  const reverseRecommendHistoryHref = useMemo(
    () => (
      selectedRunHasExplicitRecommendRef
        ? `/recommend/history?open=${encodeURIComponent(queryRecommendRunId)}`
        : ""
    ),
    [queryRecommendRunId, selectedRunHasExplicitRecommendRef],
  );
  const handlePrint = (): void => {
    if (typeof window === "undefined") return;
    window.print();
  };

  useEffect(() => {
    setInteractiveReady(true);
  }, []);

  useEffect(() => {
    if (!queryBaseRunId) return;
    if (!baselineOptions.some((run) => run.id === queryBaseRunId)) return;
    setCompareMode(true);
    setBaselineRunId(queryBaseRunId);
  }, [baselineOptions, queryBaseRunId]);

  useEffect(() => {
    if (!compareMode) return;
    setBaselineRunId((previous) => {
      if (previous && baselineOptions.some((run) => run.id === previous)) {
        return previous;
      }
      return baselineOptions[0]?.id ?? "";
    });
  }, [baselineOptions, compareMode]);

  useEffect(() => {
    if (loading || runs.length < 1 || selectedRun) return;
    const fallbackRunId = runs[0]?.id ?? "";
    if (!fallbackRunId || fallbackRunId === selectedRunId) return;
    setSelectedRunId(fallbackRunId);
  }, [loading, runs, selectedRun, selectedRunId]);

  useEffect(() => {
    if (hasInitialRuns) {
      setRuns(initialScope.runs);
      setSelectedRunId(initialScope.initialRunId);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function loadRequestedRunFallback(runId: string): Promise<PlanningRunRecord | null> {
      const normalizedRunId = runId.trim();
      if (!normalizedRunId) return null;
      try {
        const response = await fetch(`/api/planning/v2/runs/${encodeURIComponent(normalizedRunId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<PlanningRunRecord>(rawPayload);
        if (!response.ok || !payload.ok || !payload.data) return null;
        return payload.data;
      } catch {
        return null;
      }
    }

    async function loadRuns(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", String(DEFAULT_REPORT_RUN_SCOPE_LIMIT));
        if (resolvedProfileId) params.set("profileId", resolvedProfileId);
        const response = await fetch(`/api/planning/v2/runs?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<PlanningRunRecord[]>(rawPayload);
        const requestedRun = initialPreferredRun ?? await loadRequestedRunFallback(preferredRunId);
        if (!active || controller.signal.aborted) return;
        if (!payload.ok || !response.ok || !Array.isArray(payload.data)) {
          if (requestedRun) {
            const fallbackScope = buildRequestedReportRunScope({
              runs: [],
              requestedRun,
              preferredRunId,
              fallbackProfileId: resolvedProfileId,
            });
            setRuns(fallbackScope.runs);
            setSelectedRunId(fallbackScope.initialRunId);
            setBaselineRunId("");
            setCompareMode(false);
            setError("");
            return;
          }
          setRuns([]);
          setSelectedRunId("");
          setBaselineRunId("");
          setCompareMode(false);
          setError(payload.ok ? "실행 기록을 불러오지 못했습니다." : toRunLoadErrorMessage(payload.error.message));
          return;
        }
        const nextScope = buildRequestedReportRunScope({
          runs: payload.data,
          requestedRun,
          preferredRunId,
          fallbackProfileId: resolvedProfileId,
        });
        setRuns(nextScope.runs);
        setSelectedRunId(nextScope.initialRunId);
      } catch (loadError) {
        if (controller.signal.aborted || !active) return;
        const requestedRun = initialPreferredRun ?? await loadRequestedRunFallback(preferredRunId);
        if (!active || controller.signal.aborted) return;
        if (requestedRun) {
          const fallbackScope = buildRequestedReportRunScope({
            runs: [],
            requestedRun,
            preferredRunId,
            fallbackProfileId: resolvedProfileId,
          });
          setRuns(fallbackScope.runs);
          setSelectedRunId(fallbackScope.initialRunId);
          setBaselineRunId("");
          setCompareMode(false);
          setError("");
          return;
        }
        setRuns([]);
        setSelectedRunId("");
        setBaselineRunId("");
        setCompareMode(false);
        setError(toRunLoadErrorMessage(loadError instanceof Error ? loadError.message : ""));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRuns();
    return () => {
      active = false;
      controller.abort();
    };
  }, [hasInitialRuns, initialPreferredRun, initialScope.initialRunId, initialScope.runs, preferredRunId, resolvedProfileId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadCandidatePayload(): Promise<void> {
      if (!showCandidateInsights || !selectedRun?.id) {
        setCandidatePayload(null);
        setCandidateError("");
        setCandidateLoading(false);
        return;
      }

      setCandidateLoading(true);
      setCandidateError("");
      try {
        const response = await fetch(`/api/products/candidates?runId=${encodeURIComponent(selectedRun.id)}&kind=all&limit=80`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as CandidateApiResponse | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? "후보 비교 데이터를 불러오지 못했습니다.");
        }
        setCandidatePayload(body.data);
      } catch (loadError) {
        if (controller.signal.aborted || !active) return;
        if (!active) return;
        setCandidatePayload(null);
        setCandidateError(loadError instanceof Error ? loadError.message : "후보 비교 데이터를 불러오지 못했습니다.");
      } finally {
        if (active) setCandidateLoading(false);
      }
    }

    void loadCandidatePayload();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedRun?.id, showCandidateInsights]);

  return (
    <PageShell className="bg-slate-50">
      <PageHeader
        title="플래닝 리포트"
        description="저장된 실행(run) 기준으로 요약 대시보드를 확인합니다."
        action={(
          <div className="no-print flex items-center gap-3">
            {reverseRecommendHistoryHref ? (
              <Link href={reverseRecommendHistoryHref}>
                <Button variant="outline" className="rounded-full font-bold h-9 bg-white">
                  추천 실행으로 돌아가기
                </Button>
              </Link>
            ) : null}
            <Button
              data-testid="report-print-button"
              onClick={handlePrint}
              size="sm"
              variant="outline"
              className="rounded-full font-bold h-9"
            >
              PDF 인쇄
            </Button>
            <Link href={planningHref}>
              <Button variant="primary" className="rounded-full font-bold h-9">플래닝 돌아가기</Button>
            </Link>
            <Link href={runsHref}>
              <Button variant="outline" className="rounded-full font-bold h-9 bg-white">실행 기록</Button>
            </Link>
          </div>
        )}
      />

      {showInitialLoadNotice && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm font-bold text-amber-800">
          {props.initialLoadNotice}
        </div>
      )}

      {loading ? (
        <LoadingState description="실행 기록을 불러오는 중입니다." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : runs.length < 1 ? (
        <div className="space-y-6">
          <EmptyState
            title="저장된 실행 기록이 없습니다"
            description="/planning에서 실행 후 저장하면 이 화면에서 리포트를 확인할 수 있습니다."
          />
          <Card className="p-8 text-center bg-slate-50/50 border-dashed rounded-[2.5rem]">
            <p className="text-sm font-bold text-slate-900">막히지 않게 바로 이어서 시작할 수 있습니다.</p>
            <p className="mt-2 text-xs text-slate-500 font-medium leading-relaxed">프로필 입력 후 실행하고 저장하면 공식 리포트와 비교 화면이 열립니다.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={planningHref}>
                <Button variant="primary" className="rounded-xl px-6">플래닝 시작</Button>
              </Link>
              <Link href={runsHref}>
                <Button variant="outline" className="rounded-xl px-6 bg-white">실행 기록 열기</Button>
              </Link>
            </div>
          </Card>
        </div>
      ) : !selectedRun ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm font-bold text-amber-800 italic">
          선택한 실행을 다시 찾지 못해 가장 최근 실행으로 다시 맞추는 중입니다.
        </div>
      ) : (
        <div className="space-y-6" data-testid="report-dashboard">
          <Card className="p-6">
            <SubSectionHeader
              title="실행 및 비교 선택"
              action={
                <div className="no-print flex flex-wrap items-center gap-3">
                  <select
                    className={cn(bodyCompactFieldClassName, "min-w-[240px] h-9 text-xs font-bold rounded-lg")}
                    id="report-run-selector"
                    value={selectedRunId}
                    onChange={(event) => setSelectedRunId(event.target.value)}
                  >
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {`${run.title?.trim() || `실행 ${run.id}`} · ${formatDateTime(run.createdAt)}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    data-testid="compare-toggle"
                    onClick={() => setCompareMode((previous) => !previous)}
                    size="sm"
                    variant={compareMode ? "primary" : "outline"}
                    className="rounded-lg h-9 font-bold"
                  >
                    {compareMode ? "비교 끄기" : "비교 켜기"}
                  </Button>
                </div>
              }
            />

            {selectedRunHasExplicitRecommendRef ? (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
                연결된 추천 실행 ID:
                {" "}
                <span className="font-mono text-emerald-900">{queryRecommendRunId}</span>
                {" · "}
                현재 보고 있는 리포트에서만 추천 실행으로 돌아갈 수 있습니다.
              </div>
            ) : null}

            {compareMode && (
              <div className="mt-6 p-6 rounded-2xl bg-slate-50 border border-slate-100 space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="report-baseline-selector">
                    기준 실행
                  </label>
                  <select
                    className={cn(bodyCompactFieldClassName, "min-w-[240px] h-8 text-[11px] font-bold rounded-lg bg-white")}
                    data-testid="baseline-selector"
                    id="report-baseline-selector"
                    value={baselineRunId}
                    onChange={(event) => setBaselineRunId(event.target.value)}
                  >
                    <option value="">기준 실행 선택</option>
                    {baselineOptions.map((run) => (
                      <option key={run.id} value={run.id}>
                        {`${run.title?.trim() || `실행 ${run.id}`} · ${formatDateTime(run.createdAt)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {!baselineRun ? (
                  <p className="text-sm font-bold text-slate-400 italic">다른 실행을 저장하면 비교할 수 있습니다.</p>
                ) : reportDeltaRows.length < 1 ? (
                  <p className="text-sm font-bold text-slate-400 italic">비교 가능한 핵심 변화가 없습니다.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="delta-cards">
                    {reportDeltaRows.map((item) => (
                      <div className="p-4 rounded-xl bg-white border border-slate-100 shadow-sm" key={item.key}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{item.label}</p>
                        <div className="flex items-baseline justify-between">
                          <p className={cn("text-lg font-black tabular-nums", item.delta > 0 ? "text-emerald-600" : item.delta < 0 ? "text-rose-600" : "text-slate-900")}>
                            {formatMetricDelta(item.unitKind, item.delta)}
                          </p>
                          <span className="text-[10px] font-bold text-slate-400">{directionLabel(item.direction)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-500">
                          <span>기준 {formatMetricValue(item.unitKind, item.baseValue)}</span>
                          <span>→ {formatMetricValue(item.unitKind, item.currentValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {interpretationInput && (
            canRenderInterpretability ? (
              <InterpretabilityGuideCard
                aggregatedWarnings={interpretationInput.aggregatedWarnings}
                goals={interpretationInput.goals}
                monthlyOperatingGuide={selectedRunVmData?.monthlyOperatingGuide}
                summaryMetrics={interpretationInput.summary}
                outcomes={interpretationInput.outcomes}
                summaryEvidence={interpretationInput.summaryEvidence}
              />
            ) : (
              <div className="p-6 rounded-[2rem] bg-slate-100 text-sm font-bold text-slate-500 text-center">
                해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
              </div>
            )
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="report-summary-cards">
            <StatCard
              label="말기 순자산"
              value={typeof summaryCards.endNetWorthKrw === "number" ? formatKrw("ko-KR", summaryCards.endNetWorthKrw) : "-"}
              className="rounded-3xl"
            />
            <StatCard
              label="최저 현금"
              value={typeof summaryCards.worstCashKrw === "number" ? formatKrw("ko-KR", summaryCards.worstCashKrw) : "-"}
              className="rounded-3xl"
            />
            <StatCard
              label="부채상환비율(DSR)"
              value={typeof summaryCards.debtServiceRatioPct === "number" ? formatPct("ko-KR", summaryCards.debtServiceRatioPct) : "-"}
              className="rounded-3xl"
            />
            <StatCard
              label="경고 수"
              value={typeof summaryCards.warningsCount === "number" ? summaryCards.warningsCount.toLocaleString("ko-KR") : "-"}
              className="rounded-3xl"
            />
          </div>

          <Card className="p-6">
            <SubSectionHeader
              title="추가 분석 및 리포트"
              description="핵심 리포트 외 필요한 보조 자료를 선택하여 불러옵니다."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!selectedRunVmData || showCandidateInsights}
                onClick={() => setShowCandidateInsights(true)}
                size="sm"
                variant={showCandidateInsights ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showCandidateInsights ? "상품 비교 완료" : "상품 비교 분석"}
              </Button>
              <Button
                disabled={!selectedRunVmData || showBenefitInsights}
                onClick={() => setShowBenefitInsights(true)}
                size="sm"
                variant={showBenefitInsights ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showBenefitInsights ? "혜택 후보 완료" : "혜택 후보 분석"}
              </Button>
              <Button
                disabled={showRealtimeProductExplorer}
                onClick={() => setShowRealtimeProductExplorer(true)}
                size="sm"
                variant={showRealtimeProductExplorer ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showRealtimeProductExplorer ? "상품 탐색 열림" : "상품 탐색기 열기"}
              </Button>
            </div>
          </Card>

          {selectedRunVmData && showCandidateInsights && (
            <Card className="p-0 overflow-hidden">
              <DeferredReportRecommendationsSection
                runId={selectedRun.id}
                vm={selectedRunVmData}
                payload={candidatePayload}
                payloadLoading={candidateLoading}
                payloadError={candidateError}
              />
            </Card>
          )}

          {selectedRunVmData && showBenefitInsights && (
            <Card className="p-0 overflow-hidden">
              <DeferredReportBenefitsSection profileId={selectedRun.profileId} vm={selectedRunVmData} />
            </Card>
          )}

          {showCandidateInsights && (
            <Card className="p-0 overflow-hidden">
              <DeferredCandidateComparisonSection
                runId={selectedRun.id}
                payload={candidatePayload}
                payloadLoading={candidateLoading}
                payloadError={candidateError}
              />
            </Card>
          )}

          {showRealtimeProductExplorer && (
            <Card className="p-0 overflow-hidden">
              <DeferredProductCandidatesPanel />
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <DisclosuresPanel report={runNormalizationReport} />
          </Card>

          <Card className="p-6" id={REPORT_SECTION_IDS.warnings}>
            <SubSectionHeader title="발생 경고 (Warnings)" />
            <div className="overflow-hidden rounded-2xl border border-slate-100 mt-4">
              <table className="min-w-full text-sm" data-testid="report-warnings-table">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-left">Message</th>
                    <th className="px-4 py-3 text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {warningRows.length < 1 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400 font-bold" colSpan={3}>경고가 없습니다.</td>
                    </tr>
                  ) : warningRows.map((row) => (
                    <tr key={`${row.code}:${row.message}`}>
                      <td className="px-4 py-4 font-black text-slate-900">{row.code}</td>
                      <td className="px-4 py-4 font-medium text-slate-600 leading-relaxed">{row.message}</td>
                      <td className="px-4 py-4 text-right tabular-nums font-bold text-slate-400">{row.count.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6">
            <SubSectionHeader title="목표 달성 여부 (Goals)" />
            <div className="overflow-hidden rounded-2xl border border-slate-100 mt-4">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-3 text-left">Goal Name</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Shortfall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {goalRows.length < 1 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400 font-bold" colSpan={3}>목표 정보가 없습니다.</td>
                    </tr>
                  ) : goalRows.map((row, index) => (
                    <tr key={`${row.name}:${index}`}>
                      <td className="px-4 py-4 font-black text-slate-900">{row.name}</td>
                      <td className="px-4 py-4 font-bold">
                        <Badge variant={row.achieved ? "secondary" : "destructive"} className="px-2 py-0.5 text-[10px] h-5">
                          {row.achieved ? "달성" : "미달"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-black text-rose-600">
                        {typeof row.shortfall === "number" && row.shortfall > 0 ? formatKrw("ko-KR", row.shortfall) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6" data-testid="report-top-actions">
            <SubSectionHeader title="최우선 권고 액션 (Top Actions)" />
            {topActions.length < 1 ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 mt-4">
                권고 액션 정보가 없습니다.
              </p>
            ) : (
              <div className="grid gap-4 mt-4">
                {topActions.map((action, index) => (
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden" key={`${action.title}:${index}`}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <p className="text-base font-black text-slate-900 tracking-tight">
                        {index + 1}. {action.title}
                      </p>
                      <Badge variant="secondary" className={cn("text-[9px] uppercase font-black",
                        action.severity === 'critical' ? "bg-rose-100 text-rose-700" :
                        action.severity === 'warn' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {severityLabel(action.severity)}
                      </Badge>
                    </div>
                    {action.steps.length > 0 ? (
                      <ul className="space-y-2">
                        {action.steps.map((step, stepIndex) => (
                          <li key={`${action.title}:${stepIndex}`} className="flex gap-3 text-xs font-medium text-slate-600 leading-relaxed">
                            <span className="text-emerald-500 font-black">•</span>
                            {step}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs font-bold text-slate-400 italic">세부 단계 정보가 없습니다.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="no-print p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
            <Button
              aria-expanded={showAdvancedRaw}
              data-ready={interactiveReady ? "true" : "false"}
              data-testid="report-advanced-toggle"
              disabled={!interactiveReady}
              onClick={() => setShowAdvancedRaw((prev) => !prev)}
              size="sm"
              variant="ghost"
              className="w-full h-10 font-bold text-slate-500"
            >
              {showAdvancedRaw ? "고급 보기 닫기 (Markdown)" : "고급 보기 (Markdown 리포트 관리)"}
            </Button>
            {showAdvancedRaw && (
              <div className="mt-4 p-6 bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-900/5">
                <DeferredPlanningReportsClient embedded />
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
