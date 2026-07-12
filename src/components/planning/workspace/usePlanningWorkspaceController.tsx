"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  formToProfile,
  normalizeDraftWithDisclosure,
  toProfileJson,
  type FormDraft,
} from "@/lib/planning/ui/profileFormModel";
import {
  resolveWorkspaceSelectedProfileSyncState,
  stableStringifyWorkspaceValue,
} from "@/lib/planning/ui/workspaceQuickStart";
import {
  buildWorkspaceHealthGuardState,
  buildWorkspaceSnapshotState,
} from "@/lib/planning/ui/workspaceRunResult";
import { type SnapshotListItem } from "@/lib/planning/ui/snapshotListTypes";
import { normalizeWorkspaceSnapshotItemsState } from "@/lib/planning/ui/workspaceSnapshotSelection";
import { buildMetricEvidence } from "@/lib/planning/ui/metricEvidence";
import { writeDevCsrfToken } from "@/lib/dev/clientCsrf";
import { type PlanningFeatureFlags } from "@/lib/planning/config";
import { type Locale } from "@/lib/planning/i18n";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { type PlanningProfileRecord } from "@/lib/planning/store/types";
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
  buildPlanningWorkspaceRunButtonDescribedBy,
} from "@/components/planning/workspace/controllerUtils";
import { useWorkspaceArrivalHandoff } from "@/components/planning/workspace/useWorkspaceArrivalHandoff";
import { useWorkspaceExecutionOptionsBundle } from "@/components/planning/workspace/useWorkspaceExecutionOptionsBundle";
import { useWorkspaceFeedbackUiBundle } from "@/components/planning/workspace/useWorkspaceFeedbackUiBundle";
import { useWorkspaceSnapshotSelectionBundle } from "@/components/planning/workspace/useWorkspaceSnapshotSelectionBundle";
import { useWorkspaceProfileBundle } from "@/components/planning/workspace/useWorkspaceProfileBundle";
import { useWorkspaceQuickStartHandoff } from "@/components/planning/workspace/useWorkspaceQuickStartHandoff";
import {
  buildWorkspaceExecutionGuardPresenter,
  buildWorkspaceQuickStartPresenter,
  buildWorkspaceResultPresenter,
} from "@/components/planning/workspace/workspacePresenters";
import {
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
  const { setHealthAck, setRunWarningConfirmed, activeTab, setActiveTab } = runtimeState;
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
  const advancedActionsBlockedByHealth = healthGuard.advancedActionsBlockedByHealth;

  const execution = useWorkspaceExecutionOptionsBundle({
    featureFlags,
    advancedActionsBlockedByHealth,
  });
  const profileBundle = useWorkspaceProfileBundle({
    locale,
    initialSelectedProfileId,
    initialSelectedProfile,
    beginnerMode: execution.beginnerMode,
    beginnerModeLoaded: execution.beginnerModeLoaded,
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
  const savedRunHistoryHref = useMemo(
    () => runtimeState.savedRun?.id
      ? appendProfileIdQuery(
        `/planning/runs?selected=${encodeURIComponent(runtimeState.savedRun.id)}`,
        runtimeState.savedRun.profileId,
      )
      : runsPageHref,
    [runsPageHref, runtimeState.savedRun],
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
  const executionGuard = useMemo(
    () => buildWorkspaceExecutionGuardPresenter({
      profileForm: profileBundle.profileForm,
      effectiveSnapshotSelection,
      assumptionsForm: execution.assumptionsForm,
      assumptionsExtraOverrides: execution.assumptionsExtraOverrides,
      beginnerMode: execution.beginnerMode,
      effectiveRunDebtEnabled: execution.effectiveRunDebtEnabled,
      debtOfferRows: execution.debtOfferRows,
      effectiveRunMonteCarloEnabled: execution.effectiveRunMonteCarloEnabled,
      monteCarloPaths: execution.monteCarloPaths,
      horizonMonths: execution.horizonMonths,
    }),
    [
      effectiveSnapshotSelection,
      execution.assumptionsExtraOverrides,
      execution.assumptionsForm,
      execution.beginnerMode,
      execution.debtOfferRows,
      execution.effectiveRunDebtEnabled,
      execution.effectiveRunMonteCarloEnabled,
      execution.horizonMonths,
      execution.monteCarloPaths,
      profileBundle.profileForm,
    ],
  );
  const {
    preflightBlockIssues,
    preflightWarnIssues,
    preflightHasBlockers,
    preflightWarnSummary,
    preflightWarnSignature,
  } = executionGuard;
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
  const runNeedsWarningConfirmation = preflightWarnIssues.length > 0 && !runtimeState.runWarningConfirmed;
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
    setRunWarningConfirmed(false);
  }, [preflightWarnSignature, runtimeGeneratedAt, setRunWarningConfirmed]);

  const resultDto = runtimeState.runResult?.resultDto ?? null;
  const currentStepStatuses = runtimeState.running
    ? runtimeState.pipelineStatuses
    : (runtimeState.runResult?.stepStatuses ?? runtimeState.pipelineStatuses);
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
    scenariosBaseSummary,
    scenariosBaseWarnings,
    scenarioComparisonRows,
    monteData,
    monteEndNetWorth,
    monteWorstCash,
    monteDepletionProb,
    topActionTitles,
    actionTableRows,
    visibleActionRows,
    omittedActionRows,
    actionsTopForInsight,
    debtMeta,
    debtSummaries,
    debtRefinance,
    debtWarnings,
    debtWhatIfSummary,
    monteCarloStatus,
    monteCarloBudgetSkipped,
    scenariosStatus,
    actionsStatus,
    debtStatus,
    hasScenariosData,
    hasMonteCarloData,
    hasDebtData,
    warningsGoalsDebugSections,
    scenariosDebugSections,
    monteCarloDebugSections,
    actionsDebugSections,
    debtDebugSections,
    visibleSections,
    tabs,
  } = useMemo(() => buildWorkspaceResultPresenter({
    resultDto,
    currentStepStatuses,
    showAllActions: runtimeState.showAllActions,
    beginnerMode: execution.beginnerMode,
  }), [currentStepStatuses, execution.beginnerMode, resultDto, runtimeState.showAllActions]);
  const optimizeCandidates = runtimeState.optimizeResult?.candidates ?? [];

  const healthDisabledReason = healthGuard.disabledReason;
  const runButtonDescribedBy = buildPlanningWorkspaceRunButtonDescribedBy({
    preflightHasBlockers,
    hasPreflightWarnings: preflightWarnIssues.length > 0,
  });

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
  const { quickStartVm, quickStartNextStep } = useMemo(() => buildWorkspaceQuickStartPresenter({
    selectedProfileId: profileBundle.selectedProfileId,
    profileSyncState,
    profileForm: profileBundle.profileForm,
    profileValidationErrorCount: profileBundle.profileValidation.errors.length,
    runHasSimulateResult: Boolean(runtimeState.runResult?.hasSimulateResult),
    runMatchesCurrentProfile,
    runStatusReviewRequired,
    runNeedsWarningConfirmation,
    savedRun: runtimeState.savedRun,
    reportsPageHref,
    selectedProfileReportHref: (runId) => appendProfileIdQuery(
      `/planning/reports?runId=${encodeURIComponent(runId)}`,
      runtimeState.savedRun?.id === runId
        ? runtimeState.savedRun.profileId
        : profileBundle.selectedProfileId,
    ),
  }), [
    profileBundle.profileForm,
    profileBundle.profileValidation.errors.length,
    profileBundle.selectedProfileId,
    profileSyncState,
    reportsPageHref,
    runMatchesCurrentProfile,
    runNeedsWarningConfirmation,
    runStatusReviewRequired,
    runtimeState.runResult?.hasSimulateResult,
    runtimeState.savedRun,
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
    runButtonDescribedBy,
    runNeedsWarningConfirmation,
    runsPageHref: savedRunHistoryHref,
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
    running: runtimeState.running,
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
    advancedActionsBlockedByHealth,
    monteCarloServerDisabled: execution.monteCarloServerDisabled,
    includeProductsServerDisabled: execution.includeProductsServerDisabled,
    optimizerServerDisabled: execution.optimizerServerDisabled,
    effectiveRunDebtEnabled: execution.effectiveRunDebtEnabled,
    preflightBlockIssues,
    preflightWarnIssues,
    preflightHasBlockers,
    preflightWarnSummary,
    runNeedsWarningConfirmation,
    runButtonDescribedBy,
    currentStepStatuses,
    monteCarloBudgetSkipped,
    healthAck: runtimeState.healthAck,
    healthDisabledReason,
    runWarningConfirmed: runtimeState.runWarningConfirmed,
    running: runtimeState.running,
    runResult: runtimeState.runResult,
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
    runsPageHref: savedRunHistoryHref,
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
    setRunWarningConfirmed: runtimeState.setRunWarningConfirmed,
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
