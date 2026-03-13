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
  BodyActionLink,
  BodyEmptyState,
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
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
    <Card className="space-y-3">
      <LoadingState title={title} />
      <p className="text-xs text-slate-600">{description}</p>
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
  const selectedRunVmError = selectedRunVm.error;
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
    <PageShell className="report-root">
      <PageHeader
        title="플래닝 리포트"
        description="저장된 실행(run) 기준으로 요약 대시보드를 확인합니다."
        action={(
          <div className="no-print flex items-center gap-3 text-sm">
            <Button
              data-testid="report-print-button"
              onClick={handlePrint}
              size="sm"
              type="button"
              variant="outline"
            >
              PDF 인쇄
            </Button>
            <BodyActionLink href={planningHref} prefetch={false}>플래닝</BodyActionLink>
            <BodyActionLink href={runsHref} prefetch={false}>실행 기록</BodyActionLink>
          </div>
        )}
      />

      {showInitialLoadNotice ? (
        <BodyStatusInset className="no-print mb-4 text-sm" tone="warning">
          {props.initialLoadNotice}
        </BodyStatusInset>
      ) : null}

      {loading ? (
        <LoadingState title="실행 기록을 불러오는 중입니다" />
      ) : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} retryLabel="다시 불러오기" />
      ) : null}

      {!loading && !error && runs.length < 1 ? (
        <div className="space-y-4">
          <EmptyState
            title="저장된 실행 기록이 없습니다"
            description="/planning에서 실행 후 저장하면 이 화면에서 리포트를 확인할 수 있습니다."
            icon="data"
          />
          <BodyInset className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">막히지 않게 바로 이어서 시작할 수 있습니다.</p>
              <p className="mt-1 text-xs text-slate-600">프로필 입력 후 실행하고 저장하면 공식 리포트와 비교 화면이 열립니다.</p>
            </div>
            <div className={bodyDenseActionRowClassName}>
              <Link href={planningHref} prefetch={false}>
                <Button size="sm" type="button" variant="primary">플래닝 시작</Button>
              </Link>
              <Link href={runsHref} prefetch={false}>
                <Button size="sm" type="button" variant="outline">실행 기록 열기</Button>
              </Link>
            </div>
          </BodyInset>
        </div>
      ) : null}

      {!loading && !error && runs.length > 0 && !selectedRun ? (
        <BodyStatusInset className="no-print" tone="warning">
          선택한 실행을 다시 찾지 못해 가장 최근 실행으로 다시 맞추는 중입니다.
        </BodyStatusInset>
      ) : null}

      {!loading && !error && runs.length > 0 && selectedRun ? (
        <div className="report-root space-y-5" data-testid="report-dashboard">
          <Card className="print-card space-y-3">
            <BodySectionHeading
              className="no-print"
              title="실행 선택"
              action={
                <div className={bodyDenseActionRowClassName}>
                  <select
                    className={`${bodyCompactFieldClassName} min-w-[280px]`}
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
                  <BodyActionLink href={selectedRunDetailHref} prefetch={false}>
                    상세 리포트
                  </BodyActionLink>
                  <Button
                    data-testid="compare-toggle"
                    onClick={() => setCompareMode((previous) => !previous)}
                    size="sm"
                    type="button"
                    variant={compareMode ? "primary" : "outline"}
                  >
                    {compareMode ? "비교 끄기" : "비교 켜기"}
                  </Button>
                </div>
              }
            />

            {compareMode ? (
              <BodyInset className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600" htmlFor="report-baseline-selector">
                    기준 실행
                  </label>
                  <select
                    className={`${bodyCompactFieldClassName} min-w-[280px]`}
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
                  <BodyEmptyState className="px-3 py-4" description="다른 실행을 먼저 저장하면 비교 기준으로 선택할 수 있습니다." title="비교 가능한 기준 실행이 없습니다." />
                ) : reportDeltaRows.length < 1 ? (
                  <BodyEmptyState className="px-3 py-4" description="현재 실행과 기준 실행 사이에서 비교 가능한 핵심 변화가 없습니다." title="표시 가능한 변화 지표가 없습니다." />
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="delta-cards">
                    {reportDeltaRows.map((item) => (
                      <BodyInset className="px-3 py-2" key={item.key}>
                        <p className="text-[11px] font-semibold text-slate-600">{item.label}</p>
                        <p className="text-sm text-slate-700">
                          기준 {formatMetricValue(item.unitKind, item.baseValue)}
                        </p>
                        <p className="text-sm text-slate-700">
                          현재 {formatMetricValue(item.unitKind, item.currentValue)}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatMetricDelta(item.unitKind, item.delta)}
                          {" · "}
                          {directionLabel(item.direction)}
                        </p>
                      </BodyInset>
                    ))}
                  </div>
                )}
              </BodyInset>
            ) : null}
          </Card>

          {interpretationInput ? (
            canRenderInterpretability ? (
              <div className="print-card">
                <InterpretabilityGuideCard
                  aggregatedWarnings={interpretationInput.aggregatedWarnings}
                  goals={interpretationInput.goals}
                  monthlyOperatingGuide={selectedRunVmData?.monthlyOperatingGuide}
                  summaryMetrics={interpretationInput.summary}
                  outcomes={interpretationInput.outcomes}
                  summaryEvidence={interpretationInput.summaryEvidence}
                />
              </div>
            ) : (
              <BodyInset className="print-card text-sm text-slate-700">
                해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
              </BodyInset>
            )
          ) : null}

          <Card className="print-card space-y-3" data-testid="report-summary-cards">
            <h2 className="text-base font-bold text-slate-900">Summary</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <BodyInset className="px-3 py-2">
                <p className="text-[11px] text-slate-500">말기 순자산</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.endNetWorthKrw === "number" ? formatKrw("ko-KR", summaryCards.endNetWorthKrw) : "-"}
                </p>
              </BodyInset>
              <BodyInset className="px-3 py-2">
                <p className="text-[11px] text-slate-500">최저 현금</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.worstCashKrw === "number" ? formatKrw("ko-KR", summaryCards.worstCashKrw) : "-"}
                </p>
              </BodyInset>
              <BodyInset className="px-3 py-2">
                <p className="text-[11px] text-slate-500">부채상환비율(DSR)</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.debtServiceRatioPct === "number" ? formatPct("ko-KR", summaryCards.debtServiceRatioPct) : "-"}
                </p>
              </BodyInset>
              <BodyInset className="px-3 py-2">
                <p className="text-[11px] text-slate-500">경고 수</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.warningsCount === "number" ? summaryCards.warningsCount.toLocaleString("ko-KR") : "-"}
                </p>
              </BodyInset>
            </div>
          </Card>

          <Card className="print-card space-y-3" data-testid="report-optional-sections">
            <h2 className="text-base font-bold text-slate-900">추가 비교 자료</h2>
            <p className="text-sm text-slate-600">
              핵심 리포트를 먼저 보고, 필요한 보조 자료만 직접 불러오도록 기본 동작을 줄였습니다.
            </p>
            <div className={`${bodyDenseActionRowClassName} items-start`}>
              <Button
                disabled={!selectedRunVmData || showCandidateInsights}
                onClick={() => setShowCandidateInsights(true)}
                size="sm"
                type="button"
                variant={showCandidateInsights ? "outline" : "primary"}
              >
                {showCandidateInsights ? "상품 비교 자료 불러옴" : "상품 비교 자료 불러오기"}
              </Button>
              <Button
                disabled={!selectedRunVmData || showBenefitInsights}
                onClick={() => setShowBenefitInsights(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                {showBenefitInsights ? "혜택 후보 불러옴" : "혜택 후보 불러오기"}
              </Button>
              <Button
                disabled={showRealtimeProductExplorer}
                onClick={() => setShowRealtimeProductExplorer(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                {showRealtimeProductExplorer ? "실시간 상품 탐색 열림" : "실시간 상품 탐색 열기"}
              </Button>
            </div>
          </Card>

          {selectedRunVmData && showCandidateInsights ? (
            <div className="print-card">
              <DeferredReportRecommendationsSection
                runId={selectedRun.id}
                vm={selectedRunVmData}
                payload={candidatePayload}
                payloadLoading={candidateLoading}
                payloadError={candidateError}
              />
            </div>
          ) : null}

          {selectedRunVmData && showBenefitInsights ? (
            <div className="print-card">
              <DeferredReportBenefitsSection profileId={selectedRun.profileId} vm={selectedRunVmData} />
            </div>
          ) : null}

          {showCandidateInsights ? (
            <div className="print-card">
              <DeferredCandidateComparisonSection
                runId={selectedRun.id}
                payload={candidatePayload}
                payloadLoading={candidateLoading}
                payloadError={candidateError}
              />
            </div>
          ) : null}

          {showRealtimeProductExplorer ? (
            <div className="print-card">
              <DeferredProductCandidatesPanel />
            </div>
          ) : null}

          <div className="print-card">
            <DisclosuresPanel report={runNormalizationReport} />
          </div>

          {selectedRunVmError ? (
            <BodyStatusInset className="print-card" tone="danger">
              선택한 실행의 리포트를 구성하지 못했습니다. {selectedRunVmError}
            </BodyStatusInset>
          ) : null}

          <Card className="print-card space-y-3" id={REPORT_SECTION_IDS.warnings}>
            <h2 className="text-base font-bold text-slate-900">Warnings</h2>
            <BodyTableFrame>
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="report-warnings-table">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">code</th>
                    <th className="px-3 py-2 text-left">message</th>
                    <th className="px-3 py-2 text-right">count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {warningRows.length < 1 ? (
                    <tr>
                      <td className="px-3 py-2 text-slate-600" colSpan={3}>경고가 없습니다.</td>
                    </tr>
                  ) : warningRows.map((row) => (
                    <tr key={`${row.code}:${row.message}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.code}</td>
                      <td className="px-3 py-2 text-slate-700">{row.message}</td>
                      <td className="px-3 py-2 text-right">{row.count.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BodyTableFrame>
          </Card>

          <Card className="print-card space-y-3">
            <h2 className="text-base font-bold text-slate-900">Goals</h2>
            <BodyTableFrame>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">name</th>
                    <th className="px-3 py-2 text-left">achieved</th>
                    <th className="px-3 py-2 text-right">shortfall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {goalRows.length < 1 ? (
                    <tr>
                      <td className="px-3 py-2 text-slate-600" colSpan={3}>목표 정보가 없습니다.</td>
                    </tr>
                  ) : goalRows.map((row, index) => (
                    <tr key={`${row.name}:${index}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-3 py-2">{row.achieved ? "달성" : "미달"}</td>
                      <td className="px-3 py-2 text-right">
                        {typeof row.shortfall === "number" ? formatKrw("ko-KR", row.shortfall) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BodyTableFrame>
          </Card>

          <Card className="print-card space-y-3" data-testid="report-top-actions">
            <h2 className="text-base font-bold text-slate-900">Top Actions</h2>
            {topActions.length < 1 ? (
              <BodyEmptyState className="px-4 py-6" description="실행 결과가 액션 추천을 만들지 못했습니다." title="액션 정보가 없습니다." />
            ) : (
              <ol className="space-y-2">
                {topActions.map((action, index) => (
                  <li key={`${action.title}:${index}`}>
                    <BodyInset className="bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. [{severityLabel(action.severity)}] {action.title}
                    </p>
                    {action.steps.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-700">
                        {action.steps.map((step, stepIndex) => (
                          <li key={`${action.title}:${stepIndex}`}>{step}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">세부 단계 정보가 없습니다.</p>
                    )}
                    </BodyInset>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="no-print rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
            <Button
              aria-expanded={showAdvancedRaw}
              data-ready={interactiveReady ? "true" : "false"}
              data-testid="report-advanced-toggle"
              disabled={!interactiveReady}
              onClick={() => setShowAdvancedRaw((prev) => !prev)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {showAdvancedRaw ? "고급 보기 닫기 (Markdown 리포트 관리)" : "고급 보기 (Markdown 리포트 관리)"}
            </Button>
            {showAdvancedRaw ? (
              <BodyInset className="mt-3 bg-white p-4" data-testid="report-advanced-raw">
                <DeferredPlanningReportsClient embedded />
              </BodyInset>
            ) : null}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
