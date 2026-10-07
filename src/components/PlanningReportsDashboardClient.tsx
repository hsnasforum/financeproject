"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import { toInterpretationInputFromReportVM } from "@/lib/planning/reports/reportInterpretationAdapter";
import { type CandidateRecommendationsPayload } from "@/lib/planning/reports/recommendationSignals";
import {
  safeBuildReportVMFromRun,
} from "@/lib/planning/reports/reportViewModel";
import SavedReportBrief, { SAVED_REPORT_DETAILS_ID, isSavedReportInterpretable } from "@/components/planning/reports/SavedReportBrief";
import { resolveWarningCatalog } from "@/lib/planning/catalog/warningCatalog";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import DisclosuresPanel from "@/components/planning/DisclosuresPanel";
import {
  REPORT_ADVANCED_RAW_DEFAULT_OPEN,
  resolveReportAdvancedToggleReady,
} from "@/components/planning/reportDashboardReadiness";
import {
  bodyCompactFieldClassName,
} from "@/components/ui/BodyTone";
import { Button, ButtonLink } from "@/components/ui/Button";
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
import { withDevCsrf } from "@/lib/dev/clientCsrf";
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

type CreatedReportApiResponse = {
  ok?: boolean;
  data?: {
    id?: string;
  };
  error?: {
    message?: string;
  };
};

type SavedReportLookup = {
  id?: string;
};

type GoalRow = {
  name: string;
  achieved: boolean;
  interpretation: string;
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
  () => import("@/components/planning/reports/ReportBenefitsSection"),
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
  () => import("@/components/planning/reports/ReportRecommendationsSection"),
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
  () => import("@/components/planning/reports/CandidateComparisonSection"),
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
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).format(new Date(timestamp));
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

function resolveRequestedBaselineRunId(
  runs: PlanningRunRecord[],
  selectedRunId: string,
  requestedBaselineRunId: string,
): string {
  if (!requestedBaselineRunId) return "";
  return runs.some((run) => (
    run.id === requestedBaselineRunId
    && run.id !== selectedRunId
    && (run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")
  ))
    ? requestedBaselineRunId
    : "";
}


export default function PlanningReportsDashboardClient(props: PlanningReportsDashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitialRuns = (props.initialRuns?.length ?? 0) > 0;
  const queryRunId = asString(searchParams.get("runId"));
  const queryBaseRunId = asString(searchParams.get("baseRunId"));
  const queryRecommendRunId = asString(searchParams.get("recommendRunId"));
  const querySelectedReportId = asString(searchParams.get("selected"));
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
  const initialBaselineRunId = useMemo(
    () => resolveRequestedBaselineRunId(initialScope.runs, initialScope.initialRunId, queryBaseRunId),
    [initialScope.initialRunId, initialScope.runs, queryBaseRunId],
  );
  const [runs, setRuns] = useState<PlanningRunRecord[]>(initialScope.runs);
  const [selectedRunId, setSelectedRunId] = useState(initialScope.initialRunId);
  const [compareMode, setCompareMode] = useState(Boolean(initialBaselineRunId));
  const [baselineRunId, setBaselineRunId] = useState(initialBaselineRunId);
  const [loading, setLoading] = useState((props.initialRuns?.length ?? 0) < 1);
  const [error, setError] = useState("");
  const [loadFailureKind, setLoadFailureKind] = useState<"generic" | "auth-required">("generic");
  const [candidatePayload, setCandidatePayload] = useState<CandidateRecommendationsPayload | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [showCandidateInsights, setShowCandidateInsights] = useState(false);
  const [showBenefitInsights, setShowBenefitInsights] = useState(false);
  const [showRealtimeProductExplorer, setShowRealtimeProductExplorer] = useState(false);
  const [showAdvancedRaw, setShowAdvancedRaw] = useState(REPORT_ADVANCED_RAW_DEFAULT_OPEN);
  const [recommendRestoreInfoOpen, setRecommendRestoreInfoOpen] = useState(false);
  const [saveReportWorking, setSaveReportWorking] = useState(false);
  const [saveReportNotice, setSaveReportNotice] = useState("");
  const [saveReportError, setSaveReportError] = useState("");
  const savedReportId = querySelectedReportId;
  const [validatedSavedReportId, setValidatedSavedReportId] = useState("");
  const [invalidSavedReportId, setInvalidSavedReportId] = useState("");
  const showInitialLoadNotice = Boolean(props.initialLoadNotice) && (loading || (!error && runs.length < 1));
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const resolvedSelectedRunId = useMemo(() => {
    if (selectedRunId && runs.some((run) => run.id === selectedRunId)) return selectedRunId;
    return runs[0]?.id ?? "";
  }, [runs, selectedRunId]);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === resolvedSelectedRunId) ?? null,
    [resolvedSelectedRunId, runs],
  );
  const advancedToggleReady = useMemo(
    () => resolveReportAdvancedToggleReady({
      clientReady,
      loading,
      runsCount: runs.length,
      selectedRunId: resolvedSelectedRunId,
      hasSelectedRun: Boolean(selectedRun?.id),
    }),
    [clientReady, loading, resolvedSelectedRunId, runs.length, selectedRun?.id],
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
  const scenarioRows = useMemo(
    () => selectedRunVmData?.scenarioRows ?? [],
    [selectedRunVmData],
  );
  const baselineOptions = useMemo(() => {
    return runs
      .filter((run) => run.id !== resolvedSelectedRunId)
      .filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [resolvedSelectedRunId, runs]);
  const resolvedBaselineRunId = useMemo(() => {
    if (!compareMode) return "";
    if (baselineRunId && baselineOptions.some((run) => run.id === baselineRunId)) {
      return baselineRunId;
    }
    return baselineOptions[0]?.id ?? "";
  }, [baselineOptions, baselineRunId, compareMode]);
  const baselineRun = useMemo(
    () => runs.find((run) => run.id === resolvedBaselineRunId) ?? null,
    [resolvedBaselineRunId, runs],
  );
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
  const canRenderInterpretability = useMemo(
    () => isSavedReportInterpretable(selectedRun, selectedRunVmData),
    [selectedRun, selectedRunVmData],
  );
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
      interpretation: goal.interpretation,
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
  const hasValidSavedReportDetail = Boolean(savedReportId) && savedReportId === validatedSavedReportId;
  const hasInvalidSavedReportDetail = Boolean(savedReportId) && savedReportId === invalidSavedReportId;
  const hasPendingSavedReportDetail = Boolean(savedReportId) && !hasValidSavedReportDetail && !hasInvalidSavedReportDetail;
  const showSavedReportRecheckAction = Boolean(savedReportId) && !hasPendingSavedReportDetail;
  const savedReportDetailHref = useMemo(
    () => (hasValidSavedReportDetail ? `/planning/reports/${encodeURIComponent(savedReportId)}` : ""),
    [hasValidSavedReportDetail, savedReportId],
  );
  const savedReportDetailHelper = useMemo(() => {
    if (hasPendingSavedReportDetail) {
      return "저장된 상세 리포트를 확인하는 중입니다. 현재 기본 리포트 화면은 계속 볼 수 있고, 상세 링크는 확인이 끝난 뒤에만 열립니다.";
    }
    if (hasInvalidSavedReportDetail) {
      return "저장된 상세 리포트를 찾지 못했지만 현재 리포트 화면은 계속 볼 수 있습니다. 필요하면 이 실행을 다시 보관해 새 상세 리포트를 열어 주세요.";
    }
    if (!savedReportDetailHref) return "";
    return saveReportNotice
      ? "기본 리포트 화면은 여기서 계속 읽고, 필요하면 방금 보관한 상세 리포트에서 원문과 보관 정보를 따로 확인할 수 있습니다."
      : "보관해 둔 상세 리포트는 이 기본 화면과 분리된 상세 확인 단계입니다. 필요하면 아래 보조 링크로 열어 원문과 보관 정보를 다시 확인하세요.";
  }, [hasInvalidSavedReportDetail, hasPendingSavedReportDetail, savedReportDetailHref, saveReportNotice]);
  const showSavedReportNotice = Boolean(saveReportNotice) || hasValidSavedReportDetail || hasInvalidSavedReportDetail || hasPendingSavedReportDetail;
  const showSavedReportDetailCta = Boolean(savedReportDetailHref);
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
  const handleExportHtml = (): void => {
    if (typeof window === "undefined" || !selectedRun?.id) return;
    window.location.assign(`/api/planning/reports/${encodeURIComponent(selectedRun.id)}/export.html`);
  };
  const handleSavedReportManualRecheck = (): void => {
    const normalizedSavedReportId = savedReportId.trim();
    if (!normalizedSavedReportId) return;
    if (
      normalizedSavedReportId !== validatedSavedReportId
      && normalizedSavedReportId !== invalidSavedReportId
    ) {
      return;
    }
    setValidatedSavedReportId("");
    setInvalidSavedReportId("");
  };
  const requestSavedReportRevalidation = useEffectEvent(() => {
    handleSavedReportManualRecheck();
  });

  const handleSaveReport = async (): Promise<void> => {
    if (!selectedRun?.id || saveReportWorking) return;
    setSaveReportWorking(true);
    setSaveReportNotice("");
    setSaveReportError("");
    try {
      const response = await fetch("/api/planning/v2/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          runId: selectedRun.id,
          ...(queryRecommendRunId ? { recommendRunId: queryRecommendRunId } : {}),
        })),
      });
      const payload = (await response.json().catch(() => null)) as CreatedReportApiResponse | null;
      const createdReportId = asString(payload?.data?.id);
      if (!response.ok || !payload?.ok || !createdReportId) {
        throw new Error(payload?.error?.message ?? "저장된 리포트를 만들지 못했습니다.");
      }
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("selected", createdReportId);
      const nextHref = nextParams.size > 0 ? `${pathname}?${nextParams.toString()}` : pathname;
      setValidatedSavedReportId(createdReportId);
      setInvalidSavedReportId("");
      router.replace(nextHref, { scroll: false });
      setSaveReportNotice(
        queryRecommendRunId
          ? "저장된 리포트를 만들고 연결된 추천 실행 참조도 함께 보관했습니다."
          : "리포트를 별도로 보관했습니다. 아래 링크에서 보관한 상세 내용을 열 수 있습니다.",
      );
    } catch (saveError) {
      setSaveReportNotice("");
      setSaveReportError(saveError instanceof Error ? saveError.message : "저장된 리포트를 만들지 못했습니다.");
    } finally {
      setSaveReportWorking(false);
    }
  };

  useEffect(() => {
    if (!savedReportId || !hasValidSavedReportDetail) return;

    const handleWindowFocus = () => {
      requestSavedReportRevalidation();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      requestSavedReportRevalidation();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasValidSavedReportDetail, savedReportId]);

  useEffect(() => {
    const normalizedSavedReportId = savedReportId.trim();
    if (!normalizedSavedReportId) {
      return;
    }
    if (
      normalizedSavedReportId === validatedSavedReportId
      || normalizedSavedReportId === invalidSavedReportId
    ) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function validateSavedReport(): Promise<void> {
      try {
        const response = await fetch(`/api/planning/v2/reports/${encodeURIComponent(normalizedSavedReportId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<SavedReportLookup>(rawPayload);
        if (!active || controller.signal.aborted) return;
        const foundReportId = payload.ok ? asString(payload.data?.id) : "";
        if (response.ok && payload.ok && foundReportId === normalizedSavedReportId) {
          setValidatedSavedReportId(normalizedSavedReportId);
          setInvalidSavedReportId("");
          return;
        }
      } catch {
        if (controller.signal.aborted || !active) return;
      }

      if (!active || controller.signal.aborted) return;
      setValidatedSavedReportId("");
      setInvalidSavedReportId(normalizedSavedReportId);
    }

    const validationTimer = window.setTimeout(() => {
      void validateSavedReport();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(validationTimer);
      controller.abort();
    };
  }, [invalidSavedReportId, savedReportId, validatedSavedReportId]);

  useEffect(() => {
    if (hasInitialRuns) return;

    let active = true;
    const controller = new AbortController();

    function applyRequestedBaselineRun(nextRuns: PlanningRunRecord[], nextSelectedRunId: string): void {
      const nextBaselineRunId = resolveRequestedBaselineRunId(nextRuns, nextSelectedRunId, queryBaseRunId);
      if (!nextBaselineRunId) return;
      setCompareMode(true);
      setBaselineRunId(nextBaselineRunId);
    }

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
      setLoadFailureKind("generic");
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
        if (!active || controller.signal.aborted) return;
        if (response.status === 401) {
          setRuns([]);
          setSelectedRunId("");
          setBaselineRunId("");
          setCompareMode(false);
          setLoadFailureKind("auth-required");
          setError("로그인 상태를 확인한 뒤 다시 시도해주세요.");
          return;
        }
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
        applyRequestedBaselineRun(nextScope.runs, nextScope.initialRunId);
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
  }, [hasInitialRuns, initialPreferredRun, preferredRunId, queryBaseRunId, resolvedProfileId]);

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
    <PageShell className="bg-surface-muted">
      <PageHeader
        title="플래닝 리포트"
        description="저장된 진단에서 핵심 상태와 다음 행동을 확인하세요."
        action={(
          <div className="no-print flex max-w-full flex-wrap items-center gap-2">
            {reverseRecommendHistoryHref ? (
              <ButtonLink href={reverseRecommendHistoryHref} variant="outline" className="rounded-full font-bold h-9 bg-white">
                추천 비교 기록 보기
              </ButtonLink>
            ) : null}
            <Button
              data-testid="report-print-button"
              disabled={!clientReady}
              onClick={handlePrint}
              size="sm"
              variant="outline"
              className="rounded-full font-bold h-9"
            >
              PDF 인쇄
            </Button>
            <Button
              data-testid="report-export-html-button"
              disabled={!clientReady || !selectedRun?.id}
              onClick={handleExportHtml}
              size="sm"
              variant="outline"
              className="rounded-full font-bold h-9"
            >
              HTML 저장
            </Button>
            <ButtonLink href={planningHref} variant="primary" className="rounded-full font-bold h-9">플래닝으로 돌아가기</ButtonLink>
            <ButtonLink href={runsHref} variant="outline" className="rounded-full font-bold h-9 bg-white">실행 기록 보기</ButtonLink>
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
        <ErrorState kind={loadFailureKind} message={error} onRetry={() => window.location.reload()} />
      ) : runs.length < 1 ? (
        <div className="space-y-6">
          <EmptyState
            title="아직 저장된 실행이 없습니다"
            description="재무 진단에서 첫 결과를 저장하면 이곳에서 다시 열어볼 수 있습니다."
          />
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={planningHref} variant="primary">재무 진단 시작</ButtonLink>
            <ButtonLink href={runsHref} variant="outline">실행 기록 열기</ButtonLink>
          </div>
        </div>
      ) : !selectedRun ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm font-bold text-amber-800 italic">
          선택한 실행을 다시 찾지 못해 가장 최근 실행으로 다시 맞추는 중입니다.
        </div>
      ) : (
        <div className="space-y-6" data-testid="report-dashboard">
          <Card className="p-6">
            <SubSectionHeader
              title="보고 있는 기록"
              description="다른 기록을 선택하거나, 비교·별도 보관을 할 수 있습니다."
              action={
                <div className="no-print flex flex-wrap items-center gap-3">
                  <select
                    className={cn(bodyCompactFieldClassName, "min-w-0 max-w-full h-11 text-sm font-semibold rounded-lg")}
                    aria-label="보고 있는 실행"
                    id="report-run-selector"
                    value={resolvedSelectedRunId}
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
                    {compareMode ? "비교 닫기" : "비교 열기"}
                  </Button>
                  <Button
                    data-testid="report-save-button"
                    disabled={!clientReady || !selectedRun?.id || saveReportWorking}
                    onClick={() => void handleSaveReport()}
                    size="sm"
                    variant="outline"
                    className="rounded-lg h-9 font-bold bg-white"
                  >
                    {saveReportWorking ? "리포트 보관 중..." : "저장된 리포트로 보관"}
                  </Button>
                </div>
              }
            />

            {showSavedReportNotice ? (
              <div
                className={cn(
                  "mt-4 rounded-2xl border px-4 py-3 text-xs font-bold",
                  hasInvalidSavedReportDetail
                    ? "border-amber-100 bg-amber-50 text-amber-800"
                    : hasPendingSavedReportDetail
                      ? "border-slate-200 bg-surface-muted text-slate-700"
                    : "border-primary/10 bg-primary/5 text-navy",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    {saveReportNotice ? <p>{saveReportNotice}</p> : null}
                    {savedReportDetailHelper ? (
                      <p
                        className={cn(
                          "text-[11px] font-medium leading-relaxed",
                          hasInvalidSavedReportDetail
                            ? "text-amber-700"
                            : hasPendingSavedReportDetail
                              ? "text-slate-600"
                              : "text-navy",
                        )}
                      >
                        {savedReportDetailHelper}
                      </p>
                    ) : null}
                  </div>
                  {showSavedReportDetailCta || showSavedReportRecheckAction ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {showSavedReportDetailCta ? (
                        <Link
                          className="inline-flex items-center rounded-xl border border-primary/20 bg-white px-3 py-2 text-[11px] font-black text-navy transition-colors hover:border-primary/30 hover:bg-primary/10"
                          data-testid="report-saved-detail-link"
                          href={savedReportDetailHref}
                        >
                          저장된 상세 리포트 열기
                        </Link>
                      ) : null}
                      {showSavedReportRecheckAction ? (
                        <Button
                          className={cn(
                            "h-8 rounded-xl bg-white px-3 text-[11px] font-black",
                            hasInvalidSavedReportDetail
                              ? "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-100"
                              : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-surface-muted",
                          )}
                          data-testid="report-saved-detail-recheck-button"
                          onClick={handleSavedReportManualRecheck}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          상태 다시 확인
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {saveReportError ? (
              <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {saveReportError}
              </div>
            ) : null}

            {selectedRunHasExplicitRecommendRef ? (
              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs font-bold text-navy">
                <p>이 리포트는 추천 비교 기록과 함께 열렸습니다. 필요하면 위 버튼으로 돌아가 저장 당시 비교 후보를 다시 확인해 보세요.</p>
                <details
                  className="mt-3 rounded-xl border border-primary/10 bg-white/70 px-3 py-2"
                  onToggle={(event) => setRecommendRestoreInfoOpen(event.currentTarget.open)}
                  open={recommendRestoreInfoOpen}
                >
                  <summary className="cursor-pointer list-none text-[11px] font-semibold text-navy marker:hidden">
                    공유·복구용 보조 정보
                  </summary>
                  <p className="mt-2 text-[11px] font-medium leading-relaxed text-navy">
                    추천 비교 기록 식별자 (recommendRunId): <span className="font-mono text-navy">{queryRecommendRunId}</span>
                  </p>
                </details>
              </div>
            ) : null}

          </Card>

          <SavedReportBrief run={selectedRun} vm={selectedRunVmData} />
          <nav aria-label="저장된 리포트 이동" className="no-print flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-primary">
            <a href="#report-summary" className="inline-flex min-h-11 items-center hover:underline">핵심 지표</a>
            <a href={`#${REPORT_SECTION_IDS.warnings}`} className="inline-flex min-h-11 items-center hover:underline">주의 신호</a>
            <a href="#report-goals" className="inline-flex min-h-11 items-center hover:underline">목표</a>
            <a href="#report-actions" className="inline-flex min-h-11 items-center hover:underline">실행 단계</a>
          </nav>

          <div className="grid scroll-mt-28 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="report-summary-cards" id="report-summary">
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



          <Card className="scroll-mt-28 p-5 sm:p-6" id={REPORT_SECTION_IDS.warnings}>
            <SubSectionHeader title="발생 경고·주의 신호" />
            <div className="overflow-x-auto rounded-xl border border-slate-200 mt-4">
              <table className="min-w-full text-sm" data-testid="report-warnings-table">
                <thead className="bg-surface-muted border-b border-slate-100">
                  <tr className="text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3 text-left">항목</th>
                    <th className="px-4 py-3 text-left">내용</th>
                    <th className="px-4 py-3 text-right">횟수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {warningRows.length < 1 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400 font-bold" colSpan={3}>경고가 없습니다.</td>
                    </tr>
                  ) : warningRows.map((row) => (
                    <tr key={`${row.code}:${row.message}`}>
                      <td className="px-4 py-4 font-semibold text-navy">
                        {resolveWarningCatalog(row.code).title === row.code ? resolveWarningCatalog(row.code).plainDescription : resolveWarningCatalog(row.code).title}
                        <details className="mt-1 text-xs font-normal text-slate-500"><summary className="cursor-pointer py-1">기술 코드</summary>{row.code}</details>
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-600 leading-relaxed">{row.message}</td>
                      <td className="px-4 py-4 text-right tabular-nums font-bold text-slate-400">{row.count.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="scroll-mt-28 p-5 sm:p-6" id="report-goals">
            <SubSectionHeader title="목표 달성 여부" />
            <div className="overflow-x-auto rounded-xl border border-slate-200 mt-4">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted border-b border-slate-100">
                  <tr className="text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3 text-left">목표</th>
                    <th className="px-4 py-3 text-left">상태</th>
                    <th className="px-4 py-3 text-right">부족액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {goalRows.length < 1 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400 font-bold" colSpan={3}>목표 정보가 없습니다.</td>
                    </tr>
                  ) : goalRows.map((row, index) => (
                    <tr key={`${row.name}:${index}`}>
                      <td className="px-4 py-4 font-black text-navy">{row.name}</td>
                      <td className="px-4 py-4 font-bold">
                        <Badge variant={row.achieved ? "secondary" : "destructive"} className="px-2 py-0.5 text-[10px] h-5">
                          {row.achieved ? row.interpretation || "달성" : "미달"}
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

          {scenarioRows.length > 0 && (
            <Card className="p-6" data-testid="report-scenario-comparison">
              <SubSectionHeader
                title="현재 실행의 시나리오 비교"
                description="한 실행 안의 가정 변화에 따른 결과입니다. 기준 대비 변화는 기준 시나리오(Base)와의 말기 순자산 차이입니다."
              />
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">현재 실행의 가정별 결과와 기준 시나리오 대비 변화</caption>
                  <thead className="border-b border-slate-100 bg-surface-muted">
                    <tr className="text-xs font-bold text-slate-500">
                      <th scope="col" className="px-4 py-3 text-left">시나리오</th>
                      <th scope="col" className="px-4 py-3 text-right">말기 순자산</th>
                      <th scope="col" className="px-4 py-3 text-right">기준 대비 변화</th>
                      <th scope="col" className="px-4 py-3 text-right">최저 현금</th>
                      <th scope="col" className="px-4 py-3 text-right">목표 달성 수</th>
                      <th scope="col" className="px-4 py-3 text-right">경고 수</th>
                      <th scope="col" className="px-4 py-3 text-left">해석</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 bg-white">
                    {scenarioRows.map((row) => (
                      <tr key={row.id} data-testid={`report-scenario-${row.id}`}>
                        <th scope="row" className="px-4 py-4 text-left font-bold text-navy">{row.title}</th>
                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{formatKrw("ko-KR", row.endNetWorthKrw)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{formatMetricDelta("krw", row.endNetWorthDeltaKrw)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{formatKrw("ko-KR", row.worstCashKrw)}</td>
                        <td className="px-4 py-4 text-right tabular-nums">{row.goalsAchievedCount.toLocaleString("ko-KR")}</td>
                        <td className="px-4 py-4 text-right tabular-nums">{row.warningsCount.toLocaleString("ko-KR")}</td>
                        <td className="min-w-[220px] px-4 py-4 text-slate-600">{row.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="scroll-mt-28 p-5 sm:p-6" data-testid="report-top-actions" id="report-actions">
            <SubSectionHeader
              title="다음 행동의 실행 단계"
              description="기준 실행에서 우선 확인할 행동입니다. 위 시나리오별로 새로 생성한 행동은 아닙니다."
            />
            {topActions.length < 1 ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 bg-surface-muted/50 rounded-2xl border border-dashed border-slate-200 mt-4">
                권고 액션 정보가 없습니다.
              </p>
            ) : (
              <div className="grid gap-4 mt-4">
                {topActions.map((action, index) => (
                  <div className="p-5 rounded-2xl bg-surface-muted border border-slate-100 relative overflow-hidden" key={`${action.title}:${index}`}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <p className="text-base font-black text-navy tracking-tight">
                        {index + 1}. {action.title}
                      </p>
                      <Badge variant="secondary" className={cn("text-[9px] uppercase font-black",
                        action.severity === 'critical' ? "bg-rose-100 text-rose-700" :
                        action.severity === 'warn' ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-navy"
                      )}>
                        {severityLabel(action.severity)}
                      </Badge>
                    </div>
                    {action.steps.length > 0 ? (
                      <ul className="space-y-2">
                        {action.steps.map((step, stepIndex) => (
                          <li key={`${action.title}:${stepIndex}`} className="flex gap-3 text-xs font-medium text-slate-600 leading-relaxed">
                            <span className="text-primary font-black">•</span>
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

          {compareMode && (
            <div className="p-6 rounded-2xl bg-surface-muted border border-slate-100 space-y-6" data-testid="report-run-comparison">
              <SubSectionHeader title="저장 실행 간 비교" description="서로 다른 저장 실행 A와 B의 결과를 비교합니다. 한 실행 안의 시나리오 비교와는 별도입니다." />
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-600" htmlFor="report-baseline-selector">
                  기준 실행
                </label>
                <select
                  className={cn(bodyCompactFieldClassName, "min-w-0 max-w-full h-11 text-sm font-semibold rounded-lg bg-white")}
                  data-testid="baseline-selector"
                  id="report-baseline-selector"
                  value={resolvedBaselineRunId}
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
                <p className="text-sm font-bold text-slate-400 italic">비교할 다른 실행을 저장하면, 지금 보는 리포트와 무엇이 달라졌는지 같은 자리에서 읽을 수 있습니다.</p>
              ) : reportDeltaRows.length < 1 ? (
                <p className="text-sm font-bold text-slate-400 italic">핵심 지표 차이는 크지 않지만, 상세 리포트에서 가정과 경고 차이는 다시 확인할 수 있습니다.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="delta-cards">
                  {reportDeltaRows.map((item) => (
                    <div className="p-4 rounded-xl bg-white border border-slate-100 shadow-sm" key={item.key}>
                      <p className="text-xs font-semibold text-slate-600 mb-2">{item.label}</p>
                      <div className="flex items-baseline justify-between">
                        <p className={cn("text-lg font-black tabular-nums", item.delta > 0 ? "text-success" : item.delta < 0 ? "text-danger" : "text-navy")}>
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

          <details id={SAVED_REPORT_DETAILS_ID} className="group scroll-mt-28 rounded-xl border border-slate-200 bg-white p-5" data-testid="report-interpretation-details">
            <summary className="cursor-pointer py-1 text-base font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">상세 해석·월급 운영안·계산 근거</summary>
            <div className="mt-6 space-y-6">
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
              <div className="p-6 rounded-[2rem] bg-surface-muted text-sm font-bold text-slate-500 text-center">
                해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
              </div>
            )
          )}

              <DisclosuresPanel report={runNormalizationReport} />
            </div>
          </details>

          <Card className="p-6">
            <SubSectionHeader
              title="추가 분석 및 다음 확인"
              description="핵심 리포트를 읽은 뒤, 추천 비교 자료나 혜택 후보처럼 이어서 확인할 보조 자료를 선택합니다."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!selectedRunVmData || showCandidateInsights}
                onClick={() => setShowCandidateInsights(true)}
                size="sm"
                variant={showCandidateInsights ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showCandidateInsights ? "추천 비교 자료 열림" : "추천 비교 자료 열기"}
              </Button>
              <Button
                disabled={!selectedRunVmData || showBenefitInsights}
                onClick={() => setShowBenefitInsights(true)}
                size="sm"
                variant={showBenefitInsights ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showBenefitInsights ? "혜택 후보 열림" : "혜택 후보 열기"}
              </Button>
              <Button
                disabled={showRealtimeProductExplorer}
                onClick={() => setShowRealtimeProductExplorer(true)}
                size="sm"
                variant={showRealtimeProductExplorer ? "outline" : "primary"}
                className="rounded-xl h-10 px-5 font-bold"
              >
                {showRealtimeProductExplorer ? "상품 탐색 열림" : "상품 탐색 열기"}
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

          <div className="no-print p-4 rounded-2xl border border-slate-200 bg-surface-muted/50">
            <Button
              aria-expanded={showAdvancedRaw}
              data-ready={advancedToggleReady ? "true" : "false"}
              data-testid="report-advanced-toggle"
              disabled={!advancedToggleReady}
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
