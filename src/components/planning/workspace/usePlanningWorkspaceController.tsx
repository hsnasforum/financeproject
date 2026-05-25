"use client";

import { useEffect, useMemo, useRef } from "react";
import { type StepId, type StepStatus } from "@/app/planning/_lib/runPipeline";
import {
  formToProfile,
  normalizeDraftWithDisclosure,
  toProfileJson,
  type FormDraft,
} from "@/app/planning/_lib/profileFormModel";
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
  resolveWorkspaceSelectedProfileSyncState,
  stableStringifyWorkspaceValue,
} from "@/app/planning/_lib/workspaceQuickStart";
import { assumptionsFormToRecord } from "@/app/planning/_lib/workspaceAssumptionsEditor";
import { debtOfferRowsToPayload } from "@/app/planning/_lib/workspaceDebtOffersEditor";
import {
  buildWorkspaceHealthGuardState,
  buildWorkspaceSnapshotState,
} from "@/app/planning/_lib/workspaceRunResult";
import { type SnapshotListItem } from "@/app/planning/_lib/snapshotList";
import { normalizeWorkspaceSnapshotItemsState } from "@/app/planning/_lib/workspaceSnapshotSelection";
import { getVisibleSections, type PlanningTabId } from "@/app/planning/_lib/workspaceUiState";
import { buildMetricEvidence } from "@/app/planning/_lib/metricEvidence";
import { writeDevCsrfToken } from "@/lib/dev/clientCsrf";
import { type PlanningFeatureFlags } from "@/lib/planning/config";
import { type Locale } from "@/lib/planning/i18n";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { type PlanningProfileRecord } from "@/lib/planning/store/types";
import { LIMITS } from "@/lib/planning/v2/limits";
import { preflightRun } from "@/lib/planning/v2/preflight";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import {
  mergeNormalizationReports,
  reportFromNormalizationDisclosure,
  type NormalizationReport,
} from "@/lib/planning/v2/normalizationReport";
import {
  buildPlanningWorkspaceSaveButtonDescribedBy,
} from "@/components/planning/workspace/controllerUtils";
import { useWorkspaceArrivalHandoff } from "@/components/planning/workspace/useWorkspaceArrivalHandoff";
import { useWorkspaceExecutionOptionsBundle } from "@/components/planning/workspace/useWorkspaceExecutionOptionsBundle";
import { useWorkspaceFeedbackUiBundle } from "@/components/planning/workspace/useWorkspaceFeedbackUiBundle";
import { useWorkspaceSnapshotSelectionBundle } from "@/components/planning/workspace/useWorkspaceSnapshotSelectionBundle";
import { useWorkspaceProfileBundle } from "@/components/planning/workspace/useWorkspaceProfileBundle";
import { useWorkspaceQuickStartHandoff } from "@/components/planning/workspace/useWorkspaceQuickStartHandoff";
import {
  formatPreflightIssue,
  formatRunOverallStatusKo,
  resolveRunMatchesCurrentProfile,
  resolveRunStatusReviewRequired,
  useWorkspaceRuntimeActionsBundle,
  useWorkspaceRuntimeStateBundle,
} from "@/components/planning/workspace/useWorkspaceRuntimeBundle";

export type PlanningWorkspaceClientProps = {
  featureFlags: PlanningFeatureFlags;
  locale: Locale;
  initialSelectedProfileId?: string;
  initialSelectedProfile?: PlanningProfileRecord | null;
  snapshotItems: {
    latest?: SnapshotListItem;
    history: SnapshotListItem[];
  };
  csrf?: string;
};

const TAB_LABELS: Record<PlanningTabId, string> = {
  summary: "Summary",
  warningsGoals: "Warnings & Goals",
  actions: "Actions",
  scenarios: "Scenarios",
  monteCarlo: "Monte Carlo",
  debt: "Debt",
};

export function usePlanningWorkspaceController({
  featureFlags,
  locale,
  initialSelectedProfileId = "",
  initialSelectedProfile = null,
  snapshotItems,
  csrf = "",
}: PlanningWorkspaceClientProps) {
  const initialSnapshotItems = useMemo(
    () => normalizeWorkspaceSnapshotItemsState(snapshotItems),
    [snapshotItems],
  );
  const isMountedRef = useRef(true);

  useEffect(() => {
    writeDevCsrfToken(csrf);
  }, [csrf]);

  const feedback = useWorkspaceFeedbackUiBundle({ isMountedRef });
  const runtimeState = useWorkspaceRuntimeStateBundle({ isMountedRef });
  const { setHealthAck, setSaveWarningConfirmed, activeTab, setActiveTab } = runtimeState;
  const runtimeGeneratedAt = runtimeState.runResult?.meta?.generatedAt;

  const healthGuard = useMemo(
    () => buildWorkspaceHealthGuardState({
      runResult: runtimeState.runResult,
      healthAck: runtimeState.healthAck,
    }),
    [runtimeState.healthAck, runtimeState.runResult],
  );
  const healthSummary = healthGuard.summary;
  const healthWarnings = healthGuard.warnings;
  const hasCriticalHealth = healthGuard.hasCriticalHealth;
  const saveBlockedByHealth = healthGuard.saveBlockedByHealth;

  const execution = useWorkspaceExecutionOptionsBundle({
    featureFlags,
    saveBlockedByHealth,
  });
  const profileBundle = useWorkspaceProfileBundle({
    locale,
    initialSelectedProfileId,
    initialSelectedProfile,
    beginnerMode: execution.beginnerMode,
    isMountedRef,
    profileDeleteDialog: feedback.profileDeleteDialog,
    setProfileDeleteDialog: feedback.setProfileDeleteDialog,
    pushWorkspaceNotice: feedback.pushWorkspaceNotice,
    pushWorkspaceError: feedback.pushWorkspaceError,
  });
  const {
    availableSnapshotItems,
    snapshotItemsWarning,
    setSnapshotSelection,
    effectiveSnapshotSelection,
    selectedSnapshotItem,
  } = useWorkspaceSnapshotSelectionBundle({ initialSnapshotItems });

  const initialArrivalProfileId = useMemo(
    () => normalizeProfileId(initialSelectedProfileId),
    [initialSelectedProfileId],
  );
  const runsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/runs", profileBundle.selectedProfileId),
    [profileBundle.selectedProfileId],
  );
  const reportsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/reports", profileBundle.selectedProfileId),
    [profileBundle.selectedProfileId],
  );
  const metricEvidenceItems = useMemo(() => {
    const profile = formToProfile(profileBundle.profileForm);
    return buildMetricEvidence({
      profile,
      policyId: execution.policyId,
    });
  }, [execution.policyId, profileBundle.profileForm]);
  const profileNormalizationReport = useMemo<NormalizationReport>(() => {
    try {
      return normalizeDraftWithDisclosure(
        profileBundle.profileForm as unknown as FormDraft,
        profileBundle.profileName,
        execution.policyId,
      ).report;
    } catch {
      return { fixesApplied: [], defaultsApplied: [] };
    }
  }, [execution.policyId, profileBundle.profileForm, profileBundle.profileName]);
  const runNormalizationDisclosure = useMemo<ProfileNormalizationDisclosure | null>(() => {
    return parseProfileNormalizationDisclosure(runtimeState.runResult?.meta?.normalization);
  }, [runtimeState.runResult?.meta?.normalization]);
  const lastNormalizationReport = useMemo<NormalizationReport>(
    () => reportFromNormalizationDisclosure(profileBundle.lastNormalizationDisclosure, "최근 적용 결과"),
    [profileBundle.lastNormalizationDisclosure],
  );
  const runNormalizationReport = useMemo<NormalizationReport>(
    () => reportFromNormalizationDisclosure(runNormalizationDisclosure, "최근 실행 결과"),
    [runNormalizationDisclosure],
  );
  const combinedNormalizationReport = useMemo<NormalizationReport>(
    () => mergeNormalizationReports([profileNormalizationReport, lastNormalizationReport, runNormalizationReport]),
    [profileNormalizationReport, lastNormalizationReport, runNormalizationReport],
  );

  const workspaceSnapshotState = useMemo(
    () => buildWorkspaceSnapshotState({
      runResult: runtimeState.runResult,
      selectedSnapshot: selectedSnapshotItem,
    }),
    [runtimeState.runResult, selectedSnapshotItem],
  );
  const selectedSnapshotId = effectiveSnapshotSelection.mode === "history"
    ? effectiveSnapshotSelection.id.trim() || undefined
    : undefined;
  const debtLiabilityOptions = useMemo(
    () => profileBundle.profileForm.debts.map((debt, index) => ({
      id: debt.id.trim(),
      label: debt.name.trim() || `부채 ${index + 1}`,
    })).filter((row) => row.id.length > 0),
    [profileBundle.profileForm.debts],
  );
  const assumptionsOverrideForPreflight = useMemo(
    () => assumptionsFormToRecord(execution.assumptionsForm, execution.assumptionsExtraOverrides),
    [execution.assumptionsExtraOverrides, execution.assumptionsForm],
  );
  const debtOffersForPreflight = useMemo(() => {
    if (!execution.effectiveRunDebtEnabled || execution.beginnerMode) return [];
    return debtOfferRowsToPayload(execution.debtOfferRows).map((entry) => ({
      liabilityId: String((entry as Record<string, unknown>).liabilityId ?? ""),
      newAprPct: Number((entry as Record<string, unknown>).newAprPct ?? 0),
      ...(typeof (entry as Record<string, unknown>).feeKrw === "number"
        ? { feeKrw: Number((entry as Record<string, unknown>).feeKrw) }
        : {}),
    }));
  }, [execution.beginnerMode, execution.debtOfferRows, execution.effectiveRunDebtEnabled]);
  const preflightIssues = useMemo(
    () => preflightRun({
      profile: profileBundle.profileForm as unknown as Record<string, unknown>,
      selectedSnapshot: effectiveSnapshotSelection,
      debtOffers: debtOffersForPreflight,
      assumptionsOverride: assumptionsOverrideForPreflight,
      ...(execution.effectiveRunMonteCarloEnabled ? {
        monteCarlo: {
          enabled: true,
          paths: Number.parseInt(execution.monteCarloPaths, 10),
          horizonMonths: Number.parseInt(execution.horizonMonths, 10),
        },
      } : {}),
    }),
    [
      assumptionsOverrideForPreflight,
      debtOffersForPreflight,
      effectiveSnapshotSelection,
      execution.effectiveRunMonteCarloEnabled,
      execution.horizonMonths,
      execution.monteCarloPaths,
      profileBundle.profileForm,
    ],
  );
  const preflightBlockIssues = useMemo(
    () => preflightIssues.filter((issue) => issue.severity === "block"),
    [preflightIssues],
  );
  const preflightWarnIssues = useMemo(
    () => preflightIssues.filter((issue) => issue.severity === "warn"),
    [preflightIssues],
  );
  const preflightHasBlockers = preflightBlockIssues.length > 0;
  const preflightWarnSummary = preflightWarnIssues[0] ? formatPreflightIssue(preflightWarnIssues[0]) : "";
  const preflightWarnSignature = useMemo(
    () => preflightWarnIssues.map((issue) => `${issue.code}:${issue.message}`).join("|"),
    [preflightWarnIssues],
  );
  const profileSyncState = useMemo(() => resolveWorkspaceSelectedProfileSyncState({
    selectedProfileId: profileBundle.selectedProfileId,
    selectedProfile: profileBundle.selectedProfile
      ? {
        name: profileBundle.selectedProfile.name,
        profile: profileBundle.selectedProfile.profile as Record<string, unknown>,
      }
      : null,
    profileForm: profileBundle.profileForm,
    profileName: profileBundle.profileName,
    pendingSuggestionsCount: profileBundle.pendingSuggestions.length,
  }), [
    profileBundle.pendingSuggestions.length,
    profileBundle.profileForm,
    profileBundle.profileName,
    profileBundle.selectedProfile,
    profileBundle.selectedProfileId,
  ]);
  const currentProfileHashInput = useMemo(() => {
    if (profileSyncState === "missing" || profileSyncState === "unknown") return "";
    try {
      return stableStringifyWorkspaceValue(normalizeDraftWithDisclosure(
        toProfileJson(profileBundle.profileForm) as FormDraft,
        profileBundle.profileName,
      ).profile);
    } catch {
      return "";
    }
  }, [profileBundle.profileForm, profileBundle.profileName, profileSyncState]);
  const runtimeActions = useWorkspaceRuntimeActionsBundle({
    profile: {
      selectedProfileId: profileBundle.selectedProfileId,
      selectedProfile: profileBundle.selectedProfile,
      profileName: profileBundle.profileName,
      profileForm: profileBundle.profileForm,
      profileValidationErrors: profileBundle.profileValidation.errors,
      loadProfiles: profileBundle.loadProfiles,
      setPendingProfileSave: profileBundle.setPendingProfileSave,
      setPendingSuggestions: profileBundle.setPendingSuggestions,
      setAcceptedSuggestionCodes: profileBundle.setAcceptedSuggestionCodes,
      setLastNormalizationDisclosure: profileBundle.setLastNormalizationDisclosure,
    },
    execution: {
      beginnerMode: execution.beginnerMode,
      policyId: execution.policyId,
      horizonMonths: execution.horizonMonths,
      assumptionsForm: execution.assumptionsForm,
      assumptionsExtraOverrides: execution.assumptionsExtraOverrides,
      monteCarloPaths: execution.monteCarloPaths,
      monteCarloSeed: execution.monteCarloSeed,
      effectiveRunScenariosEnabled: execution.effectiveRunScenariosEnabled,
      effectiveRunMonteCarloEnabled: execution.effectiveRunMonteCarloEnabled,
      effectiveRunActionsEnabled: execution.effectiveRunActionsEnabled,
      effectiveRunDebtEnabled: execution.effectiveRunDebtEnabled,
      effectiveIncludeProducts: execution.effectiveIncludeProducts,
      maxCandidatesPerAction: execution.maxCandidatesPerAction,
      debtExtraPaymentKrw: execution.debtExtraPaymentKrw,
      debtOfferRows: execution.debtOfferRows,
      runTitle: execution.runTitle,
      optimizerServerDisabled: execution.optimizerServerDisabled,
      optimizerConstraintsJson: execution.optimizerConstraintsJson,
      optimizerKnobsJson: execution.optimizerKnobsJson,
      optimizerSearchJson: execution.optimizerSearchJson,
    },
    snapshot: {
      selectedSnapshotId,
      setSnapshotSelection,
      workspaceSnapshotState,
    },
    guard: {
      preflightHasBlockers,
      preflightBlockIssues,
      preflightWarnIssues,
      saveBlockedByHealth,
      healthSummary,
    },
    feedback: {
      locale,
      pushWorkspaceNotice: feedback.pushWorkspaceNotice,
      pushWorkspaceError: feedback.pushWorkspaceError,
      feedbackCategory: feedback.feedbackCategory,
      feedbackTitle: feedback.feedbackTitle,
      feedbackMessage: feedback.feedbackMessage,
      setFeedbackSubmitting: feedback.setFeedbackSubmitting,
      setFeedbackModalOpen: feedback.setFeedbackModalOpen,
      setFeedbackCategory: feedback.setFeedbackCategory,
      setFeedbackTitle: feedback.setFeedbackTitle,
      setFeedbackMessage: feedback.setFeedbackMessage,
      setFeedbackToast: feedback.setFeedbackToast,
    },
    runtime: {
      isMountedRef,
      currentProfileHashInput,
      state: runtimeState,
    },
  });
  const saveNeedsWarningConfirmation = preflightWarnIssues.length > 0 && !runtimeState.saveWarningConfirmed;
  const quickStartHandoff = useWorkspaceQuickStartHandoff({
    profileName: profileBundle.profileName,
    selectedProfileId: profileBundle.selectedProfileId,
    applyHydratedProfileEditorState: profileBundle.applyLocalProfileEditorState,
    clearPendingSuggestions: profileBundle.clearPendingSuggestions,
    pushWorkspaceNotice: feedback.pushWorkspaceNotice,
  });

  useEffect(() => {
    if (!hasCriticalHealth) {
      setHealthAck(false);
    }
  }, [hasCriticalHealth, setHealthAck]);

  useEffect(() => {
    setSaveWarningConfirmed(false);
  }, [preflightWarnSignature, runtimeGeneratedAt, setSaveWarningConfirmed]);

  const resultDto = runtimeState.runResult?.resultDto ?? null;
  const scenariosVm = buildWorkspaceScenarioVm(resultDto);
  const scenariosBaseSummary = scenariosVm.baseSummary;
  const scenariosBaseWarnings = scenariosVm.baseWarnings;
  const scenarioComparisonRows = scenariosVm.comparisonRows;

  const monteVm = buildWorkspaceMonteCarloVm(resultDto);
  const monteData = monteVm.data;
  const monteProbabilities = monteVm.probabilities;
  const monteEndNetWorth = monteVm.percentiles.endNetWorthKrw;
  const monteWorstCash = monteVm.percentiles.worstCashKrw;
  const monteDepletionProb = monteVm.depletionProbability;

  const actionsVm = buildWorkspaceActionsVm(resultDto);
  const topActionTitles = actionsVm.topActionTitles;
  const actionTableRows = actionsVm.tableRows;
  const visibleActionRows = runtimeState.showAllActions
    ? actionTableRows
    : actionTableRows.slice(0, LIMITS.actionsTop);
  const omittedActionRows = Math.max(0, actionTableRows.length - visibleActionRows.length);
  const actionsTopForInsight = actionsVm.topActionsForInsight;

  const debtVm = buildWorkspaceDebtVm(resultDto);
  const debtMeta = debtVm.meta;
  const debtSummaries = debtVm.summaries;
  const debtRefinance = debtVm.refinance;
  const debtWarnings = debtVm.warnings;
  const debtWhatIfSummary = debtVm.whatIfSummary;
  const optimizeCandidates = runtimeState.optimizeResult?.candidates ?? [];

  const healthDisabledReason = healthGuard.disabledReason;
  const saveButtonDescribedBy = buildPlanningWorkspaceSaveButtonDescribedBy({
    preflightHasBlockers,
    saveBlockedByHealth,
    hasPreflightWarnings: preflightWarnIssues.length > 0,
  });

  const currentStepStatuses = runtimeState.running
    ? runtimeState.pipelineStatuses
    : (runtimeState.runResult?.stepStatuses ?? runtimeState.pipelineStatuses);
  const statusById = new Map(currentStepStatuses.map((row) => [row.id, row]));
  const statusFor = (id: StepId): StepStatus => statusById.get(id) ?? { id, state: "PENDING" };
  const monteCarloStatus = statusFor("monteCarlo");
  const monteCarloBudgetSkipped = monteCarloStatus.state === "SKIPPED"
    && typeof monteCarloStatus.message === "string"
    && monteCarloStatus.message.includes("예산 초과");
  const scenariosStatus = statusFor("scenarios");
  const actionsStatus = statusFor("actions");
  const debtStatus = statusFor("debtStrategy");
  const hasScenariosData = Boolean(resultDto?.scenarios);
  const hasMonteCarloData = Boolean(resultDto?.monteCarlo);
  const hasActionsData = Boolean(resultDto?.actions);
  const hasDebtData = Boolean(resultDto?.debt);

  const {
    chartPoints,
    chartMode,
    aggregatedWarningsForInsight,
    aggregatedWarnings,
    goalTableRows,
    goalsForInsight,
    timelineSummaryRows,
    achievedGoalCount,
    summaryEndNetWorthKrw,
    summaryWorstCashKrw,
    summaryWorstCashMonth,
    summaryGoalsText,
    summaryDsr,
    summaryMonthlySurplusKrw,
    summaryEmergencyFundMonths,
    summaryEvidence,
    summaryCriticalWarnings,
    warningsSummaryTop5,
    guideBadge,
    keyFindings,
  } = buildWorkspaceResultSummaryVm({
    resultDto,
    debtMonthlyPaymentKrw: typeof debtMeta.totalMonthlyPaymentKrw === "number" ? debtMeta.totalMonthlyPaymentKrw : undefined,
  });
  const warningsGoalsDebugSections = buildWorkspaceWarningsGoalsDebugSections({
    beginnerMode: execution.beginnerMode,
    aggregatedWarnings,
    goalTableRows,
    timelineSummaryRows,
    chartPoints,
  });
  const scenariosDebugSections = buildWorkspaceScenarioDebugSections({
    beginnerMode: execution.beginnerMode,
    baseSummary: scenariosBaseSummary,
    comparisonRows: scenarioComparisonRows,
    baseWarnings: scenariosBaseWarnings,
  });
  const monteCarloDebugSections = buildWorkspaceMonteCarloDebugSections({
    beginnerMode: execution.beginnerMode,
    probabilities: monteProbabilities,
    endNetWorthKrw: monteEndNetWorth,
    worstCashKrw: monteWorstCash,
    ...(typeof monteDepletionProb === "number" ? { depletionProbability: monteDepletionProb } : {}),
  });
  const actionsDebugSections = buildWorkspaceActionsDebugSections({
    beginnerMode: execution.beginnerMode,
    topActionTitles,
    actionRows: actionTableRows,
  });
  const debtDebugSections = buildWorkspaceDebtDebugSections({
    beginnerMode: execution.beginnerMode,
    debtMeta,
    debtSummaries,
    debtRefinance,
    debtWhatIfSummary,
    debtWarnings,
  });

  const visibleSections = getVisibleSections(execution.beginnerMode, {
    hasResult: Boolean(resultDto),
    hasActions: hasActionsData || actionsStatus.state === "FAILED",
    hasScenarios: hasScenariosData || scenariosStatus.state === "FAILED",
    hasMonteCarlo: hasMonteCarloData || monteCarloStatus.state === "FAILED" || monteCarloStatus.state === "SKIPPED",
    hasDebt: hasDebtData || debtStatus.state === "FAILED",
  });
  const tabs = visibleSections.map((id) => ({
    id,
    label: TAB_LABELS[id],
  }));
  const beginnerStepProfileDone = isWorkspaceQuickStartProfileDone(
    profileBundle.profileForm,
    profileBundle.profileValidation.errors.length,
  );
  const runStatusReviewRequired = useMemo(() => {
    return resolveRunStatusReviewRequired({
      profileSyncState,
      savedRun: runtimeState.savedRun,
      selectedProfileId: profileBundle.selectedProfileId,
      currentProfileHashInput,
      currentProfileHashState: runtimeState.currentProfileHashState,
    });
  }, [
    currentProfileHashInput,
    profileBundle.selectedProfileId,
    profileSyncState,
    runtimeState.currentProfileHashState,
    runtimeState.savedRun,
  ]);
  const runMatchesCurrentProfile = useMemo(() => {
    return resolveRunMatchesCurrentProfile({
      runStatusReviewRequired,
      profileSyncState,
      savedRun: runtimeState.savedRun,
      selectedProfileId: profileBundle.selectedProfileId,
      currentProfileHash: runtimeActions.currentProfileHash,
    });
  }, [
    profileBundle.selectedProfileId,
    profileSyncState,
    runStatusReviewRequired,
    runtimeActions.currentProfileHash,
    runtimeState.savedRun,
  ]);
  const beginnerStepRunDone = Boolean(runtimeState.runResult?.hasSimulateResult) && runMatchesCurrentProfile;
  const beginnerStepSaveDone = Boolean(runtimeState.savedRun?.id) && runMatchesCurrentProfile;
  const quickStartVm = useMemo(() => buildWorkspaceQuickStartVm({
    selectedProfileId: profileBundle.selectedProfileId,
    profileSyncState,
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    runStatusReviewRequired,
    savedRunId: runtimeState.savedRun?.id,
    savedRunOverallStatus: runtimeState.savedRun?.overallStatus,
    reportsPageHref,
    selectedProfileReportHref: (runId) => appendProfileIdQuery(
      `/planning/reports?runId=${encodeURIComponent(runId)}`,
      profileBundle.selectedProfileId,
    ),
    formatRunOverallStatus: formatRunOverallStatusKo,
  }), [
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    profileBundle.selectedProfileId,
    profileSyncState,
    reportsPageHref,
    runStatusReviewRequired,
    runtimeState.savedRun?.id,
    runtimeState.savedRun?.overallStatus,
  ]);
  const quickStartNextStep = useMemo(() => {
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
  }, [
    profileSyncState,
    quickStartVm.beginnerStepRunDone,
    quickStartVm.beginnerStepSaveDone,
    quickStartVm.runStatusReviewRequired,
  ]);

  useWorkspaceArrivalHandoff({
    initialArrivalProfileId,
    loadingProfiles: profileBundle.loadingProfiles,
    selectedProfileId: profileBundle.selectedProfileId,
    targetId: quickStartNextStep.targetId,
  });

  useEffect(() => {
    if (visibleSections.includes(activeTab)) return;
    setActiveTab("summary");
  }, [activeTab, setActiveTab, visibleSections]);

  const quickStart = {
    locale,
    feedbackToast: feedback.feedbackToast,
    workspaceError: feedback.workspaceError,
    workspaceNotice: feedback.workspaceNotice,
    beginnerMode: execution.beginnerMode,
    savingProfile: profileBundle.savingProfile,
    running: runtimeState.running,
    savingRun: runtimeState.savingRun,
    quickStartNextStep,
    profileSyncState,
    quickStartVm,
    selectedProfileId: profileBundle.selectedProfileId,
    profiles: profileBundle.profiles,
    selectedProfile: profileBundle.selectedProfile,
    selectedSnapshotItem,
    preflightHasBlockers,
    preflightBlockIssues,
    preflightWarnIssues,
    saveButtonDescribedBy,
    saveBlockedByHealth,
    saveNeedsWarningConfirmation,
    runsPageHref,
    reportsPageHref,
    liveSummary: profileBundle.liveSummary,
    beginnerEmergencyMonths: profileBundle.beginnerEmergencyMonths,
    profileForm: profileBundle.profileForm,
    savedRun: runtimeState.savedRun,
  };

  const profile = {
    locale,
    beginnerMode: execution.beginnerMode,
    loadingProfiles: profileBundle.loadingProfiles,
    profiles: profileBundle.profiles,
    profilesLoadError: profileBundle.profilesLoadError,
    selectedProfileId: profileBundle.selectedProfileId,
    profileName: profileBundle.profileName,
    profileJsonDraft: profileBundle.profileJsonDraft,
    profileJsonError: profileBundle.profileJsonError,
    profileForm: profileBundle.profileForm,
    benefitSigunguOptions: profileBundle.benefitSigunguOptions,
    liveSummary: profileBundle.liveSummary,
    pendingProfileSave: profileBundle.pendingProfileSave,
    pendingSuggestions: profileBundle.pendingSuggestions,
    acceptedSuggestionCodes: profileBundle.acceptedSuggestionCodes,
    savingProfile: profileBundle.savingProfile,
    profileValidation: profileBundle.profileValidation,
    beginnerGoals: profileBundle.beginnerGoals,
    beginnerEmergencyMonths: profileBundle.beginnerEmergencyMonths,
    snapshotItemsWarning,
    selectedProfile: profileBundle.selectedProfile,
    runsPageHref,
    reportsPageHref,
  };

  const executionGroup = {
    locale,
    beginnerMode: execution.beginnerMode,
    selectedProfileId: profileBundle.selectedProfileId,
    snapshotItemsWarning,
    availableSnapshotItems,
    effectiveSnapshotSelection,
    policyId: execution.policyId,
    runTitle: execution.runTitle,
    horizonMonths: execution.horizonMonths,
    assumptionsOverrideJson: execution.assumptionsOverrideJson,
    assumptionsJsonError: execution.assumptionsJsonError,
    assumptionsForm: execution.assumptionsForm,
    runScenariosEnabled: execution.runScenariosEnabled,
    runMonteCarloEnabled: execution.runMonteCarloEnabled,
    runActionsEnabled: execution.runActionsEnabled,
    runDebtEnabled: execution.runDebtEnabled,
    runOptimizeEnabled: execution.runOptimizeEnabled,
    includeProducts: execution.includeProducts,
    maxCandidatesPerAction: execution.maxCandidatesPerAction,
    monteCarloPaths: execution.monteCarloPaths,
    monteCarloSeed: execution.monteCarloSeed,
    debtExtraPaymentKrw: execution.debtExtraPaymentKrw,
    debtOffersJson: execution.debtOffersJson,
    debtOffersJsonError: execution.debtOffersJsonError,
    debtOfferRows: execution.debtOfferRows,
    debtLiabilityOptions,
    optimizerConstraintsJson: execution.optimizerConstraintsJson,
    optimizerKnobsJson: execution.optimizerKnobsJson,
    optimizerSearchJson: execution.optimizerSearchJson,
    loadingBaselineRuns: runtimeState.loadingBaselineRuns,
    baselineRunId: runtimeState.baselineRunId,
    scenarioTemplateId: runtimeState.scenarioTemplateId,
    availableBaselineRuns: runtimeActions.availableBaselineRuns,
    scenarioPatchesPreview: runtimeActions.scenarioPatchesPreview,
    healthWarnings,
    hasCriticalHealth,
    saveBlockedByHealth,
    monteCarloServerDisabled: execution.monteCarloServerDisabled,
    includeProductsServerDisabled: execution.includeProductsServerDisabled,
    optimizerServerDisabled: execution.optimizerServerDisabled,
    effectiveRunDebtEnabled: execution.effectiveRunDebtEnabled,
    preflightBlockIssues,
    preflightWarnIssues,
    preflightHasBlockers,
    preflightWarnSummary,
    saveNeedsWarningConfirmation,
    saveButtonDescribedBy,
    currentStepStatuses,
    monteCarloBudgetSkipped,
    healthAck: runtimeState.healthAck,
    healthDisabledReason,
    saveWarningConfirmed: runtimeState.saveWarningConfirmed,
    autoSaveRunAfterSuccess: runtimeState.autoSaveRunAfterSuccess,
    running: runtimeState.running,
    runResult: runtimeState.runResult,
    savingRun: runtimeState.savingRun,
    runningOptimize: runtimeState.runningOptimize,
  };

  const results = {
    locale,
    optimizeCandidates,
    optimizeResult: runtimeState.optimizeResult,
    runResult: runtimeState.runResult,
    guideBadge,
    achievedGoalCount,
    goalTableRows,
    topActionTitles,
    activeTab: runtimeState.activeTab,
    showAllActions: runtimeState.showAllActions,
    tabs,
    metricEvidenceItems,
    combinedNormalizationReport,
    summaryMonthlySurplusKrw,
    summaryEmergencyFundMonths,
    summaryEndNetWorthKrw,
    summaryWorstCashKrw,
    summaryWorstCashMonth,
    summaryGoalsText,
    summaryDsr,
    summaryEvidence,
    summaryCriticalWarnings,
    aggregatedWarningsForInsight,
    goalsForInsight,
    actionsTopForInsight,
    workspaceSnapshotState,
    monteDepletionProb,
    savedRun: runtimeState.savedRun,
    resultDto,
    keyFindings,
    warningsSummaryTop5,
    currentStepStatuses,
    runsPageHref,
    selectedProfileId: profileBundle.selectedProfileId,
    chartMode,
    chartPoints,
    aggregatedWarnings,
    timelineSummaryRows,
    warningsGoalsDebugSections,
    scenariosStatus,
    hasScenariosData,
    scenariosBaseSummary,
    scenariosBaseWarnings,
    scenarioComparisonRows,
    scenariosDebugSections,
    monteCarloStatus,
    hasMonteCarloData,
    monteData,
    monteEndNetWorth,
    monteWorstCash,
    monteCarloDebugSections,
    actionsStatus,
    visibleActionRows,
    actionTableRows,
    omittedActionRows,
    actionsDebugSections,
    debtStatus,
    hasDebtData,
    debtMeta,
    debtSummaries,
    debtRefinance,
    debtWarnings,
    debtWhatIfSummary,
    debtDebugSections,
  };

  const dialogs = {
    profileDeleteDialog: feedback.profileDeleteDialog,
    feedbackModalOpen: feedback.feedbackModalOpen,
    feedbackSubmitting: feedback.feedbackSubmitting,
    feedbackCategory: feedback.feedbackCategory,
    feedbackTitle: feedback.feedbackTitle,
    feedbackMessage: feedback.feedbackMessage,
    workspaceSnapshotState,
    savedRun: runtimeState.savedRun,
    healthSummary,
    savingProfile: profileBundle.savingProfile,
  };

  const actions = {
    setSelectedProfileId: profileBundle.setSelectedProfileId,
    setFeedbackModalOpen: feedback.setFeedbackModalOpen,
    applyQuickStartAction: quickStartHandoff.applyQuickStartAction,
    loadSampleProfileAction: profileBundle.loadSampleProfileAction,
    runPlanAction: runtimeActions.runPlanAction,
    saveRunAction: runtimeActions.saveRunAction,
    setBeginnerMode: execution.setBeginnerMode,
    applyWizardOutputAction: quickStartHandoff.applyWizardOutputAction,
    loadProfiles: profileBundle.loadProfiles,
    markProfileEditorLocalEdit: profileBundle.markProfileEditorLocalEdit,
    setProfileName: profileBundle.setProfileName,
    updateProfileField: profileBundle.updateProfileField,
    applyProfileForm: profileBundle.applyProfileForm,
    addDebtRow: profileBundle.addDebtRow,
    removeDebtRow: profileBundle.removeDebtRow,
    updateDebtRow: profileBundle.updateDebtRow,
    addGoalRow: profileBundle.addGoalRow,
    removeGoalRow: profileBundle.removeGoalRow,
    updateGoalRow: profileBundle.updateGoalRow,
    updateBeginnerGoal: profileBundle.updateBeginnerGoal,
    replaceProfileFromJsonText: profileBundle.replaceProfileFromJsonText,
    applyProfileJsonEditorAction: profileBundle.applyProfileJsonEditorAction,
    copyProfileJsonEditorAction: profileBundle.copyProfileJsonEditorAction,
    beginProfileSave: profileBundle.beginProfileSave,
    applySuggestedProfileSaveAction: profileBundle.applySuggestedProfileSaveAction,
    continueProfileSaveWithoutSuggestionsAction: profileBundle.continueProfileSaveWithoutSuggestionsAction,
    deleteProfileAction: profileBundle.deleteProfileAction,
    clearPendingSuggestions: profileBundle.clearPendingSuggestions,
    toggleSuggestionCode: profileBundle.toggleSuggestionCode,
    setSnapshotSelection,
    setPolicyId: execution.setPolicyId,
    setRunTitle: execution.setRunTitle,
    setHorizonMonths: execution.setHorizonMonths,
    updateAssumptionsField: execution.updateAssumptionsField,
    setRunScenariosEnabled: execution.setRunScenariosEnabled,
    setRunMonteCarloEnabled: execution.setRunMonteCarloEnabled,
    setRunActionsEnabled: execution.setRunActionsEnabled,
    setRunDebtEnabled: execution.setRunDebtEnabled,
    setRunOptimizeEnabled: execution.setRunOptimizeEnabled,
    setIncludeProducts: execution.setIncludeProducts,
    setMaxCandidatesPerAction: execution.setMaxCandidatesPerAction,
    setMonteCarloPaths: execution.setMonteCarloPaths,
    setMonteCarloSeed: execution.setMonteCarloSeed,
    setDebtExtraPaymentKrw: execution.setDebtExtraPaymentKrw,
    addDebtOfferRow: execution.addDebtOfferRow,
    removeDebtOfferRow: execution.removeDebtOfferRow,
    updateDebtOfferRow: execution.updateDebtOfferRow,
    setOptimizerConstraintsJson: execution.setOptimizerConstraintsJson,
    setOptimizerKnobsJson: execution.setOptimizerKnobsJson,
    setOptimizerSearchJson: execution.setOptimizerSearchJson,
    replaceAssumptionsFromJsonText: execution.replaceAssumptionsFromJsonText,
    replaceDebtOffersFromJsonText: execution.replaceDebtOffersFromJsonText,
    setHealthAck: runtimeState.setHealthAck,
    setSaveWarningConfirmed: runtimeState.setSaveWarningConfirmed,
    setAutoSaveRunAfterSuccess: runtimeState.setAutoSaveRunAfterSuccess,
    setBaselineRunId: runtimeState.setBaselineRunId,
    setScenarioTemplateId: runtimeState.setScenarioTemplateId,
    runScenarioAction: runtimeActions.runScenarioAction,
    runOptimizeAction: runtimeActions.runOptimizeAction,
    copyStrategyAction: runtimeActions.copyStrategyAction,
    setActiveTab: runtimeState.setActiveTab,
    setShowAllActions: runtimeState.setShowAllActions,
    setProfileDeleteDialog: feedback.setProfileDeleteDialog,
    submitDeleteProfileAction: profileBundle.submitDeleteProfileAction,
    setFeedbackCategory: feedback.setFeedbackCategory,
    setFeedbackTitle: feedback.setFeedbackTitle,
    setFeedbackMessage: feedback.setFeedbackMessage,
    submitPlanningFeedbackAction: runtimeActions.submitPlanningFeedbackAction,
  };

  return {
    quickStart,
    profile,
    execution: executionGroup,
    results,
    dialogs,
    actions,
  };
}

export type PlanningWorkspaceController = ReturnType<typeof usePlanningWorkspaceController>;
