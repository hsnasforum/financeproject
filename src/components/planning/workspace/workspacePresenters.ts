import { assumptionsFormToRecord, type AssumptionsFormModel } from "@/app/planning/_lib/workspaceAssumptionsEditor";
import { debtOfferRowsToPayload, type DebtOfferFormRow } from "@/app/planning/_lib/workspaceDebtOffersEditor";
import { type ProfileFormModel } from "@/app/planning/_lib/profileFormModel";
import {
  buildWorkspaceActionsDebugSections,
  buildWorkspaceActionsVm,
  buildWorkspaceDebtDebugSections,
  buildWorkspaceDebtVm,
  buildWorkspaceMonteCarloDebugSections,
  buildWorkspaceMonteCarloVm,
  buildWorkspaceScenarioDebugSections,
  buildWorkspaceWarningsGoalsDebugSections,
  buildWorkspaceResultSummaryVm,
  buildWorkspaceScenarioVm,
} from "@/app/planning/_lib/workspaceResultInsights";
import {
  buildWorkspaceQuickStartVm,
  isWorkspaceQuickStartProfileDone,
  type WorkspaceQuickStartVm,
  type WorkspaceSelectedProfileSyncState,
} from "@/app/planning/_lib/workspaceQuickStart";
import { getVisibleSections, type PlanningTabId } from "@/app/planning/_lib/workspaceUiState";
import { type SnapshotSelection } from "@/app/planning/_lib/snapshotSelection";
import { type StepStatus } from "@/app/planning/_lib/runPipeline";
import { LIMITS } from "@/lib/planning/v2/limits";
import { type ResultDtoV1 } from "@/lib/planning/v2/resultDto";
import { preflightRun } from "@/lib/planning/v2/preflight";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  formatPreflightIssue,
  formatRunOverallStatusKo,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";

const TAB_LABELS: Record<PlanningTabId, string> = {
  summary: "Summary",
  warningsGoals: "Warnings & Goals",
  actions: "Actions",
  scenarios: "Scenarios",
  monteCarlo: "Monte Carlo",
  debt: "Debt",
};

export type WorkspaceQuickStartNextStep = {
  label: string;
  description: string;
  targetId: string;
};

export function buildWorkspaceExecutionGuardPresenter(input: {
  profileForm: ProfileFormModel;
  effectiveSnapshotSelection: SnapshotSelection;
  assumptionsForm: AssumptionsFormModel;
  assumptionsExtraOverrides: Record<string, unknown>;
  beginnerMode: boolean;
  effectiveRunDebtEnabled: boolean;
  debtOfferRows: DebtOfferFormRow[];
  effectiveRunMonteCarloEnabled: boolean;
  monteCarloPaths: string;
  horizonMonths: string;
}) {
  const assumptionsOverride = assumptionsFormToRecord(input.assumptionsForm, input.assumptionsExtraOverrides);
  const debtOffers = !input.effectiveRunDebtEnabled || input.beginnerMode
    ? []
    : debtOfferRowsToPayload(input.debtOfferRows).map((entry) => ({
      liabilityId: String((entry as Record<string, unknown>).liabilityId ?? ""),
      newAprPct: Number((entry as Record<string, unknown>).newAprPct ?? 0),
      ...(typeof (entry as Record<string, unknown>).feeKrw === "number"
        ? { feeKrw: Number((entry as Record<string, unknown>).feeKrw) }
        : {}),
    }));
  const preflightIssues = preflightRun({
    profile: input.profileForm as unknown as Record<string, unknown>,
    selectedSnapshot: input.effectiveSnapshotSelection,
    debtOffers,
    assumptionsOverride,
    ...(input.effectiveRunMonteCarloEnabled ? {
      monteCarlo: {
        enabled: true,
        paths: Number.parseInt(input.monteCarloPaths, 10),
        horizonMonths: Number.parseInt(input.horizonMonths, 10),
      },
    } : {}),
  });
  const preflightBlockIssues = preflightIssues.filter((issue) => issue.severity === "block");
  const preflightWarnIssues = preflightIssues.filter((issue) => issue.severity === "warn");

  return {
    assumptionsOverride,
    debtOffers,
    preflightIssues,
    preflightBlockIssues,
    preflightWarnIssues,
    preflightHasBlockers: preflightBlockIssues.length > 0,
    preflightWarnSummary: preflightWarnIssues[0] ? formatPreflightIssue(preflightWarnIssues[0]) : "",
    preflightWarnSignature: preflightWarnIssues.map((issue) => `${issue.code}:${issue.message}`).join("|"),
  };
}

export function buildWorkspaceQuickStartNextStep(input: {
  profileSyncState: WorkspaceSelectedProfileSyncState;
  quickStartVm: WorkspaceQuickStartVm;
}): WorkspaceQuickStartNextStep {
  const { profileSyncState, quickStartVm } = input;
  if (profileSyncState === "missing") {
    return {
      label: "먼저 프로필 저장",
      description: "아래 프로필 영역에서 새로 만들기를 누르면 저장 뒤 첫 실행으로 넘어가고, 결과 저장 뒤 리포트를 확인할 수 있습니다.",
      targetId: "planning-profile-create-button",
    };
  }
  if (profileSyncState === "unknown") {
    return {
      label: "진행 상태 다시 확인",
      description: "저장된 프로필과 현재 편집값을 아직 맞춰 보지 못했습니다. 아래 프로필 목록을 새로고침한 뒤 상태를 다시 확인해 주세요.",
      targetId: "planning-profile-refresh-button",
    };
  }
  if (profileSyncState === "dirty") {
    return {
      label: "먼저 프로필 저장",
      description: "선택된 프로필과 현재 편집값이 달라 먼저 저장하거나 변경 상태를 정리한 뒤 첫 실행으로 이어가세요.",
      targetId: "planning-profile-update-button",
    };
  }
  if (quickStartVm.runStatusReviewRequired) {
    return {
      label: "진행 상태 다시 확인",
      description: "현재 환경에서는 최근 저장 실행과 현재 프로필의 일치 여부를 자동 확인하지 못했습니다. 아래 실행 내역에서 진행 상태를 다시 확인해 주세요.",
      targetId: "planning-quickstart-runs-link",
    };
  }
  if (!quickStartVm.beginnerStepRunDone) {
    return {
      label: "이제 첫 실행 시작",
      description: "아래 간단 진행 카드의 첫 실행 시작을 누르면 요약, 액션, 경고를 한 번에 계산하고, 결과 저장 뒤 저장된 리포트 확인으로 이어집니다.",
      targetId: "planning-quickstart-run-cta",
    };
  }
  if (!quickStartVm.beginnerStepSaveDone) {
    return {
      label: "이제 결과 저장",
      description: "첫 실행이 끝났습니다. 아래 결과 저장 버튼으로 현재 상태를 보관하면 저장된 리포트와 실행 내역 비교로 이어집니다.",
      targetId: "planning-quickstart-save-run-button",
    };
  }
  return {
    label: "저장된 리포트 확인",
    description: "저장까지 끝났습니다. 아래 리포트 버튼으로 저장된 결과를 다시 보고, 실행 내역에서는 비교를 이어갈 수 있습니다.",
    targetId: "planning-quickstart-report-button",
  };
}

export function buildWorkspaceQuickStartPresenter(input: {
  selectedProfileId: string;
  profileSyncState: WorkspaceSelectedProfileSyncState;
  profileForm: ProfileFormModel;
  profileValidationErrorCount: number;
  runHasSimulateResult: boolean;
  runMatchesCurrentProfile: boolean;
  runStatusReviewRequired: boolean;
  savedRun?: PlanningRunRecord | null;
  reportsPageHref: string;
  selectedProfileReportHref: (runId: string) => string;
}) {
  const beginnerStepProfileDone = isWorkspaceQuickStartProfileDone(
    input.profileForm,
    input.profileValidationErrorCount,
  );
  const beginnerStepRunDone = input.runHasSimulateResult && input.runMatchesCurrentProfile;
  const beginnerStepSaveDone = Boolean(input.savedRun?.id) && input.runMatchesCurrentProfile;
  const quickStartVm = buildWorkspaceQuickStartVm({
    selectedProfileId: input.selectedProfileId,
    profileSyncState: input.profileSyncState,
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    runStatusReviewRequired: input.runStatusReviewRequired,
    savedRunId: input.savedRun?.id,
    savedRunOverallStatus: input.savedRun?.overallStatus,
    reportsPageHref: input.reportsPageHref,
    selectedProfileReportHref: input.selectedProfileReportHref,
    formatRunOverallStatus: formatRunOverallStatusKo,
  });

  return {
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    quickStartVm,
    quickStartNextStep: buildWorkspaceQuickStartNextStep({
      profileSyncState: input.profileSyncState,
      quickStartVm,
    }),
  };
}

export function buildWorkspaceResultPresenter(input: {
  resultDto: ResultDtoV1 | null;
  currentStepStatuses: StepStatus[];
  showAllActions: boolean;
  beginnerMode: boolean;
}) {
  const { resultDto } = input;
  const scenariosVm = buildWorkspaceScenarioVm(resultDto);
  const monteVm = buildWorkspaceMonteCarloVm(resultDto);
  const actionsVm = buildWorkspaceActionsVm(resultDto);
  const actionTableRows = actionsVm.tableRows;
  const visibleActionRows = input.showAllActions
    ? actionTableRows
    : actionTableRows.slice(0, LIMITS.actionsTop);
  const debtVm = buildWorkspaceDebtVm(resultDto);
  const debtMeta = debtVm.meta;
  const summaryVm = buildWorkspaceResultSummaryVm({
    resultDto,
    debtMonthlyPaymentKrw: typeof debtMeta.totalMonthlyPaymentKrw === "number" ? debtMeta.totalMonthlyPaymentKrw : undefined,
  });

  const statusById = new Map(input.currentStepStatuses.map((row) => [row.id, row]));
  const statusFor = (id: StepStatus["id"]): StepStatus => statusById.get(id) ?? { id, state: "PENDING" };
  const monteCarloStatus = statusFor("monteCarlo");
  const scenariosStatus = statusFor("scenarios");
  const actionsStatus = statusFor("actions");
  const debtStatus = statusFor("debtStrategy");
  const hasScenariosData = Boolean(resultDto?.scenarios);
  const hasMonteCarloData = Boolean(resultDto?.monteCarlo);
  const hasActionsData = Boolean(resultDto?.actions);
  const hasDebtData = Boolean(resultDto?.debt);

  const visibleSections = getVisibleSections(input.beginnerMode, {
    hasResult: Boolean(resultDto),
    hasActions: hasActionsData || actionsStatus.state === "FAILED",
    hasScenarios: hasScenariosData || scenariosStatus.state === "FAILED",
    hasMonteCarlo: hasMonteCarloData || monteCarloStatus.state === "FAILED" || monteCarloStatus.state === "SKIPPED",
    hasDebt: hasDebtData || debtStatus.state === "FAILED",
  });

  return {
    ...summaryVm,
    scenariosBaseSummary: scenariosVm.baseSummary,
    scenariosBaseWarnings: scenariosVm.baseWarnings,
    scenarioComparisonRows: scenariosVm.comparisonRows,
    monteData: monteVm.data,
    monteProbabilities: monteVm.probabilities,
    monteEndNetWorth: monteVm.percentiles.endNetWorthKrw,
    monteWorstCash: monteVm.percentiles.worstCashKrw,
    monteDepletionProb: monteVm.depletionProbability,
    topActionTitles: actionsVm.topActionTitles,
    actionTableRows,
    visibleActionRows,
    omittedActionRows: Math.max(0, actionTableRows.length - visibleActionRows.length),
    actionsTopForInsight: actionsVm.topActionsForInsight,
    debtMeta,
    debtSummaries: debtVm.summaries,
    debtRefinance: debtVm.refinance,
    debtWarnings: debtVm.warnings,
    debtWhatIfSummary: debtVm.whatIfSummary,
    monteCarloStatus,
    monteCarloBudgetSkipped: monteCarloStatus.state === "SKIPPED"
      && typeof monteCarloStatus.message === "string"
      && monteCarloStatus.message.includes("예산 초과"),
    scenariosStatus,
    actionsStatus,
    debtStatus,
    hasScenariosData,
    hasMonteCarloData,
    hasActionsData,
    hasDebtData,
    warningsGoalsDebugSections: buildWorkspaceWarningsGoalsDebugSections({
      beginnerMode: input.beginnerMode,
      aggregatedWarnings: summaryVm.aggregatedWarnings,
      goalTableRows: summaryVm.goalTableRows,
      timelineSummaryRows: summaryVm.timelineSummaryRows,
      chartPoints: summaryVm.chartPoints,
    }),
    scenariosDebugSections: buildWorkspaceScenarioDebugSections({
      beginnerMode: input.beginnerMode,
      baseSummary: scenariosVm.baseSummary,
      comparisonRows: scenariosVm.comparisonRows,
      baseWarnings: scenariosVm.baseWarnings,
    }),
    monteCarloDebugSections: buildWorkspaceMonteCarloDebugSections({
      beginnerMode: input.beginnerMode,
      probabilities: monteVm.probabilities,
      endNetWorthKrw: monteVm.percentiles.endNetWorthKrw,
      worstCashKrw: monteVm.percentiles.worstCashKrw,
      ...(typeof monteVm.depletionProbability === "number" ? { depletionProbability: monteVm.depletionProbability } : {}),
    }),
    actionsDebugSections: buildWorkspaceActionsDebugSections({
      beginnerMode: input.beginnerMode,
      topActionTitles: actionsVm.topActionTitles,
      actionRows: actionTableRows,
    }),
    debtDebugSections: buildWorkspaceDebtDebugSections({
      beginnerMode: input.beginnerMode,
      debtMeta,
      debtSummaries: debtVm.summaries,
      debtRefinance: debtVm.refinance,
      debtWhatIfSummary: debtVm.whatIfSummary,
      debtWarnings: debtVm.warnings,
    }),
    visibleSections,
    tabs: visibleSections.map((id) => ({
      id,
      label: TAB_LABELS[id],
    })),
  };
}

export type WorkspaceExecutionGuardPresenter = ReturnType<typeof buildWorkspaceExecutionGuardPresenter>;
export type WorkspaceResultPresenter = ReturnType<typeof buildWorkspaceResultPresenter>;
export type WorkspaceQuickStartPresenter = ReturnType<typeof buildWorkspaceQuickStartPresenter>;
