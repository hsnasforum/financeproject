"use client";

import { useCallback, useEffect, useMemo } from "react";
import { assumptionsFormToRecord, type AssumptionsFormModel } from "@/lib/planning/ui/workspaceAssumptionsEditor";
import { debtOfferRowsToPayload, type DebtOfferFormRow } from "@/lib/planning/ui/workspaceDebtOffersEditor";
import {
  buildStepStatusesFromRunStages,
} from "@/lib/planning/ui/workspaceRunResult";
import { type SnapshotSelection } from "@/lib/planning/ui/snapshotSelection";
import { type Locale } from "@/lib/planning/i18n";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { applyProfilePatch } from "@/lib/planning/v2/profilePatch";
import { type NormalizationSuggestion } from "@/lib/planning/v2/normalizeProfile";
import {
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type PreflightIssue } from "@/lib/planning/v2/preflight";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";
import { type PlanningProfileRecord, type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  normalizeDraft,
  normalizeDraftWithDisclosure,
  validateDebtOfferLiabilityIds,
  type FormDraft,
  type ProfileFormModel,
} from "@/lib/planning/ui/profileFormModel";
import { type ProfileSaveMode } from "@/components/planning/workspace/useWorkspaceProfileBundle";
import {
  SCENARIO_TEMPLATE_LABELS,
  createScenarioPatchesFromTemplate,
  parseHorizonMonths,
  parseMaxCandidatesPerAction,
  parseMonteCarloPaths,
  parseMonteCarloSeed,
  resolveWorkspaceRuntimeSnapshotFallback,
  selectPreferredBaselineRunId,
  type BaselineRunOption,
  type CurrentProfileHashState,
  type ParsedRunInputs,
  type RunInputScenario,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";
import {
  useWorkspaceRuntimeStateBundle,
  type MountedRef,
} from "@/components/planning/workspace/useWorkspaceRuntimeStateBundle";
import { useWorkspaceFeedbackSubmitAction } from "@/components/planning/workspace/useWorkspaceFeedbackSubmitAction";
import { useWorkspaceOptimizeAction } from "@/components/planning/workspace/useWorkspaceOptimizeAction";
import { useWorkspaceProfileSyncAction } from "@/components/planning/workspace/useWorkspaceProfileSyncAction";
import { useWorkspaceRunExecutionActions } from "@/components/planning/workspace/useWorkspaceRunExecutionActions";

export {
  SCENARIO_TEMPLATE_LABELS,
  buildPlanningRunInput,
  createScenarioPatchesFromTemplate,
  formatPreflightIssue,
  formatRunOverallStatusKo,
  parseHorizonMonths,
  parseJsonText,
  parseMaxCandidatesPerAction,
  parseMonteCarloPaths,
  parseMonteCarloSeed,
  resolveRunMatchesCurrentProfile,
  resolveRunStatusReviewRequired,
  resolveWorkspaceRuntimeSnapshotFallback,
  selectPreferredBaselineRunId,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";
export type {
  BaselineRunOption,
  CurrentProfileHashState,
  ParsedRunInputs,
  RunInputScenario,
  ScenarioTemplateId,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";
export {
  useWorkspaceRuntimeStateBundle,
} from "@/components/planning/workspace/useWorkspaceRuntimeStateBundle";
export type {
  MountedRef,
} from "@/components/planning/workspace/useWorkspaceRuntimeStateBundle";

type ApiError = {
  code?: string;
  message?: string;
  issues?: string[];
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiError;
};

type RuntimeProfileBundleInput = {
  selectedProfileId: string;
  selectedProfile: PlanningProfileRecord | null;
  profileName: string;
  profileForm: ProfileFormModel;
  profileValidationErrors: string[];
  ensureProfileUpdateTarget: (targetProfileId: string) => boolean;
  loadProfiles: (nextSelectedId?: string) => Promise<void>;
  setPendingProfileSave: (value: { mode: ProfileSaveMode; profile: ProfileV2 } | null) => void;
  setPendingSuggestions: (value: NormalizationSuggestion[]) => void;
  setAcceptedSuggestionCodes: (value: string[]) => void;
  setLastNormalizationDisclosure: (value: ProfileNormalizationDisclosure | null) => void;
};

type RuntimeExecutionBundleInput = {
  beginnerMode: boolean;
  policyId: AllocationPolicyId;
  horizonMonths: string;
  assumptionsForm: AssumptionsFormModel;
  assumptionsExtraOverrides: Record<string, unknown>;
  monteCarloPaths: string;
  monteCarloSeed: string;
  effectiveRunScenariosEnabled: boolean;
  effectiveRunMonteCarloEnabled: boolean;
  effectiveRunActionsEnabled: boolean;
  effectiveRunDebtEnabled: boolean;
  effectiveIncludeProducts: boolean;
  maxCandidatesPerAction: string;
  debtExtraPaymentKrw: string;
  debtOfferRows: DebtOfferFormRow[];
  runTitle: string;
  optimizerServerDisabled: boolean;
  optimizerConstraintsJson: string;
  optimizerKnobsJson: string;
  optimizerSearchJson: string;
};

type RuntimeSnapshotBundleInput = {
  selectedSnapshotId?: string;
  setSnapshotSelection: (nextSelection: SnapshotSelection) => void;
  workspaceSnapshotState: {
    displayId?: string;
    feedbackContext: Record<string, unknown>;
  };
};

type RuntimeGuardBundleInput = {
  preflightHasBlockers: boolean;
  preflightBlockIssues: PreflightIssue[];
  preflightWarnIssues: PreflightIssue[];
  healthSummary: {
    criticalCount?: number;
    warningCodes?: string[];
  } | null;
};

type RuntimeFeedbackBundleInput = {
  locale: Locale;
  pushWorkspaceNotice: (message: string) => void;
  pushWorkspaceError: (message: string) => void;
  feedbackCategory: PlanningFeedbackCategory;
  feedbackTitle: string;
  feedbackMessage: string;
  setFeedbackSubmitting: (submitting: boolean) => void;
  setFeedbackModalOpen: (open: boolean) => void;
  setFeedbackCategory: (category: PlanningFeedbackCategory) => void;
  setFeedbackTitle: (title: string) => void;
  setFeedbackMessage: (message: string) => void;
  setFeedbackToast: (message: string) => void;
};

type RuntimeLocalBundleInput = {
  isMountedRef: MountedRef;
  currentProfileHashInput: string;
  state: ReturnType<typeof useWorkspaceRuntimeStateBundle>;
};

type RuntimeActionsBundleInput = {
  profile: RuntimeProfileBundleInput;
  execution: RuntimeExecutionBundleInput;
  snapshot: RuntimeSnapshotBundleInput;
  guard: RuntimeGuardBundleInput;
  feedback: RuntimeFeedbackBundleInput;
  runtime: RuntimeLocalBundleInput;
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeLooseNumberText(value: string): string {
  return value.replaceAll(",", "").trim();
}

function toFiniteNumber(value: string, fallback = 0): number {
  const normalized = normalizeLooseNumberText(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isTerminalOverallStatus(status: PlanningRunRecord["overallStatus"]): boolean {
  return status === "SUCCESS" || status === "PARTIAL_SUCCESS" || status === "FAILED";
}

export function useWorkspaceRuntimeActionsBundle({
  profile,
  execution,
  snapshot,
  guard,
  feedback,
  runtime,
}: RuntimeActionsBundleInput) {
  const {
    selectedProfileId,
    selectedProfile,
    profileName,
    profileForm,
    profileValidationErrors,
    ensureProfileUpdateTarget,
    loadProfiles,
    setPendingProfileSave,
    setPendingSuggestions,
    setAcceptedSuggestionCodes,
    setLastNormalizationDisclosure,
  } = profile;
  const {
    beginnerMode,
    policyId,
    horizonMonths,
    assumptionsForm,
    assumptionsExtraOverrides,
    monteCarloPaths,
    monteCarloSeed,
    effectiveRunScenariosEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    effectiveIncludeProducts,
    maxCandidatesPerAction,
    debtExtraPaymentKrw,
    debtOfferRows,
    runTitle,
    optimizerServerDisabled,
    optimizerConstraintsJson,
    optimizerKnobsJson,
    optimizerSearchJson,
  } = execution;
  const { selectedSnapshotId, setSnapshotSelection, workspaceSnapshotState } = snapshot;
  const {
    preflightHasBlockers,
    preflightBlockIssues,
    preflightWarnIssues,
    healthSummary,
  } = guard;
  const {
    locale,
    pushWorkspaceNotice,
    pushWorkspaceError,
    feedbackCategory,
    feedbackTitle,
    feedbackMessage,
    setFeedbackSubmitting,
    setFeedbackModalOpen,
    setFeedbackCategory,
    setFeedbackTitle,
    setFeedbackMessage,
    setFeedbackToast,
  } = feedback;
  const { isMountedRef, currentProfileHashInput, state } = runtime;
  const setBaselineRuns = state.setBaselineRuns;
  const setBaselineRunId = state.setBaselineRunId;
  const setLoadingBaselineRuns = state.setLoadingBaselineRuns;
  const setCurrentProfileHashState = state.setCurrentProfileHashState;
  const availableBaselineRuns = useMemo(
    () => state.baselineRuns.filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS"),
    [state.baselineRuns],
  );
  const scenarioPatchesPreview = useMemo(
    () => createScenarioPatchesFromTemplate(state.scenarioTemplateId),
    [state.scenarioTemplateId],
  );
  const currentProfileHash = state.currentProfileHashState.input === currentProfileHashInput
    ? state.currentProfileHashState.hash
    : "";

  const loadBaselineRuns = useCallback(async (profileId: string): Promise<void> => {
    const safeProfileId = profileId.trim();
    if (!safeProfileId) {
      setBaselineRuns([]);
      setBaselineRunId("");
      return;
    }
    setLoadingBaselineRuns(true);
    try {
      const response = await fetch(`/api/planning/v2/runs?profileId=${encodeURIComponent(safeProfileId)}&limit=20`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord[]> | null;
      if (!isMountedRef.current) return;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        setBaselineRuns([]);
        setBaselineRunId("");
        return;
      }
      const rows: BaselineRunOption[] = payload.data.map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        ...(run.title ? { title: run.title } : {}),
        ...(run.overallStatus ? { overallStatus: run.overallStatus } : {}),
      }));
      setBaselineRuns(rows);
      setBaselineRunId((prev) => selectPreferredBaselineRunId(rows, prev));
    } catch {
      if (!isMountedRef.current) return;
      setBaselineRuns([]);
      setBaselineRunId("");
    } finally {
      if (!isMountedRef.current) return;
      setLoadingBaselineRuns(false);
    }
  }, [isMountedRef, setBaselineRunId, setBaselineRuns, setLoadingBaselineRuns]);

  useEffect(() => {
    if (!selectedProfileId) {
      setBaselineRuns([]);
      setBaselineRunId("");
      return;
    }
    void loadBaselineRuns(selectedProfileId);
  }, [loadBaselineRuns, selectedProfileId, setBaselineRunId, setBaselineRuns]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    function commitHashState(nextState: CurrentProfileHashState): void {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setCurrentProfileHashState(nextState);
        }
      }, 0);
    }

    async function syncCurrentProfileHash(): Promise<void> {
      const nextInput = currentProfileHashInput;
      if (!nextInput) {
        commitHashState({ input: "", hash: "" });
        return;
      }

      try {
        const subtle = globalThis.crypto?.subtle;
        if (!subtle) {
          commitHashState({ input: nextInput, hash: "" });
          return;
        }

        const digest = await subtle.digest("SHA-256", new TextEncoder().encode(nextInput));
        if (cancelled) return;
        const hash = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        commitHashState({ input: nextInput, hash });
      } catch {
        commitHashState({ input: nextInput, hash: "" });
      }
    }

    void syncCurrentProfileHash();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [currentProfileHashInput, setCurrentProfileHashState]);

  const parseCoreInputs = useCallback((): {
    profile: Record<string, unknown>;
    assumptions: Record<string, unknown>;
    horizon: number;
    policyId: AllocationPolicyId;
    snapshotId?: string;
  } | null => {
    if (profileValidationErrors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidationErrors.join("\n- ")}`);
      return null;
    }
    let profile: Record<string, unknown>;
    try {
      profile = normalizeDraftWithDisclosure(profileForm as unknown as FormDraft, profileName).profile as unknown as Record<string, unknown>;
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "프로필 정규화에 실패했습니다.");
      return null;
    }

    const assumptions = assumptionsFormToRecord(assumptionsForm, assumptionsExtraOverrides);
    const horizon = parseHorizonMonths(horizonMonths);
    if (!horizon) {
      pushWorkspaceError("horizonMonths는 1~1200 범위 숫자여야 합니다.");
      return null;
    }

    return {
      profile,
      assumptions,
      horizon,
      policyId,
      ...(selectedSnapshotId ? { snapshotId: selectedSnapshotId } : {}),
    };
  }, [
    assumptionsExtraOverrides,
    assumptionsForm,
    horizonMonths,
    policyId,
    profileForm,
    profileName,
    profileValidationErrors,
    pushWorkspaceError,
    selectedSnapshotId,
  ]);

  const parseRunInputs = useCallback((): ParsedRunInputs | null => {
    const core = parseCoreInputs();
    if (!core) return null;

    const paths = parseMonteCarloPaths(monteCarloPaths);
    const seed = parseMonteCarloSeed(monteCarloSeed);
    if (effectiveRunMonteCarloEnabled) {
      if (paths === null) {
        pushWorkspaceError("Monte Carlo paths는 1~20000 범위여야 합니다.");
        return null;
      }
      if (seed === null) {
        pushWorkspaceError("Monte Carlo seed는 숫자여야 합니다.");
        return null;
      }
    }

    const maxCandidates = parseMaxCandidatesPerAction(maxCandidatesPerAction);
    if (effectiveRunActionsEnabled && maxCandidates === null) {
      pushWorkspaceError("후보 최대 개수는 1~20 범위여야 합니다.");
      return null;
    }

    const extraPayment = Math.max(0, Math.trunc(toFiniteNumber(debtExtraPaymentKrw, 0)));
    if (!Number.isFinite(extraPayment) || extraPayment < 0) {
      pushWorkspaceError("debt extraPaymentKrw는 0 이상의 숫자여야 합니다.");
      return null;
    }

    const offers = beginnerMode ? [] : debtOfferRowsToPayload(debtOfferRows);
    if (!beginnerMode) {
      const invalidLiabilityIds = validateDebtOfferLiabilityIds(
        offers.map((offer) => asRecord(offer)),
        profileForm.debts,
      );
      if (invalidLiabilityIds.length > 0) {
        pushWorkspaceError(`리파이낸스 제안의 liabilityId가 프로필 부채와 일치하지 않습니다.\n- ${invalidLiabilityIds.join("\n- ")}`);
        return null;
      }
    }

    return {
      ...core,
      monteCarlo: { paths: paths ?? 0, seed: seed ?? 0 },
      actions: {
        includeProducts: effectiveIncludeProducts,
        maxCandidatesPerAction: maxCandidates ?? 0,
      },
      debt: {
        offers,
        options: {
          ...(extraPayment > 0 ? { extraPaymentKrw: extraPayment } : {}),
        },
      },
    };
  }, [
    beginnerMode,
    debtExtraPaymentKrw,
    debtOfferRows,
    effectiveIncludeProducts,
    effectiveRunActionsEnabled,
    effectiveRunMonteCarloEnabled,
    maxCandidatesPerAction,
    monteCarloPaths,
    monteCarloSeed,
    parseCoreInputs,
    profileForm.debts,
    pushWorkspaceError,
  ]);

  const handleSnapshotNotFoundCode = useCallback((code: unknown): boolean => {
    const fallbackSelection = resolveWorkspaceRuntimeSnapshotFallback(code);
    if (!fallbackSelection) return false;
    setSnapshotSelection(fallbackSelection);
    pushWorkspaceError("선택한 스냅샷을 찾을 수 없습니다. 목록을 새로고침하거나 latest를 사용하세요.");
    return true;
  }, [pushWorkspaceError, setSnapshotSelection]);

  const handleSnapshotNotFound = useCallback((payload: ApiResponse<unknown> | null): boolean => {
    return handleSnapshotNotFoundCode(payload?.error?.code);
  }, [handleSnapshotNotFoundCode]);

  const copyStrategyAction = useCallback(async (strategy: unknown): Promise<void> => {
    try {
      if (!navigator?.clipboard?.writeText) {
        pushWorkspaceError("클립보드 복사를 지원하지 않는 환경입니다.");
        return;
      }
      await navigator.clipboard.writeText(pretty(strategy));
      pushWorkspaceNotice("후보 전략 값을 클립보드에 복사했습니다.");
    } catch {
      pushWorkspaceError("전략 값 복사에 실패했습니다.");
    }
  }, [pushWorkspaceError, pushWorkspaceNotice]);

  const buildRunInputScenarioFromSelection = useCallback((): RunInputScenario | undefined => {
    const patches = createScenarioPatchesFromTemplate(state.scenarioTemplateId);
    if (patches.length < 1) return undefined;
    const canonicalProfile = normalizeDraft(profileForm as unknown as FormDraft, profileName) as unknown as ProfileV2;
    try {
      applyProfilePatch(canonicalProfile, patches);
    } catch (error) {
      if (error instanceof Error) {
        pushWorkspaceError(`시나리오 검증에 실패했습니다.\n${error.message}`);
      } else {
        pushWorkspaceError("시나리오 검증에 실패했습니다.");
      }
      return undefined;
    }
    return {
      title: SCENARIO_TEMPLATE_LABELS[state.scenarioTemplateId],
      ...(state.baselineRunId ? { baseRunId: state.baselineRunId } : {}),
      patch: patches,
    };
  }, [profileForm, profileName, pushWorkspaceError, state.baselineRunId, state.scenarioTemplateId]);

  const runOptimizeAction = useWorkspaceOptimizeAction({
    locale,
    optimizerServerDisabled,
    optimizerConstraintsJson,
    optimizerKnobsJson,
    optimizerSearchJson,
    parseCoreInputs,
    handleSnapshotNotFound,
    pushWorkspaceError,
    pushWorkspaceNotice,
    setRunningOptimize: state.setRunningOptimize,
    setOptimizeResult: state.setOptimizeResult,
  });

  const pollRunUntilTerminal = useCallback(async (runId: string, seed?: PlanningRunRecord): Promise<PlanningRunRecord | null> => {
    let latest = seed ?? null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (!isMountedRef.current) return latest;
      if (latest?.stages) {
        state.setPipelineStatuses(buildStepStatusesFromRunStages(latest.stages));
      }
      if (latest && isTerminalOverallStatus(latest.overallStatus)) {
        return latest;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
      if (!isMountedRef.current) return latest;
      const response = await fetch(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!isMountedRef.current) return latest;
      if (!response.ok || !payload?.ok || !payload.data) {
        return latest;
      }
      latest = payload.data;
    }
    return latest;
  }, [isMountedRef, state]);

  const syncProfileIfNeeded = useWorkspaceProfileSyncAction({
    locale,
    selectedProfileId,
    selectedProfile,
    profileName,
    profileForm,
    profileValidationErrors,
    ensureProfileUpdateTarget,
    loadProfiles,
    pushWorkspaceError,
    setPendingProfileSave,
    setPendingSuggestions,
    setAcceptedSuggestionCodes,
    setLastNormalizationDisclosure,
  });

  const {
    runPlanAction,
    runScenarioAction,
  } = useWorkspaceRunExecutionActions({
    locale,
    beginnerMode,
    selectedProfileId,
    runTitle,
    effectiveRunScenariosEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    preflightHasBlockers,
    preflightBlockIssues,
    preflightWarnIssues,
    parseRunInputs,
    buildRunInputScenarioFromSelection,
    syncProfileIfNeeded,
    pollRunUntilTerminal,
    handleSnapshotNotFound,
    loadBaselineRuns,
    pushWorkspaceError,
    pushWorkspaceNotice,
    setLastNormalizationDisclosure,
    isMountedRef,
    state,
  });

  const submitPlanningFeedbackAction = useWorkspaceFeedbackSubmitAction({
    feedbackCategory,
    feedbackTitle,
    feedbackMessage,
    savedRun: state.savedRun,
    healthSummary,
    pushWorkspaceError,
    workspaceSnapshotFeedbackContext: workspaceSnapshotState.feedbackContext,
    setFeedbackSubmitting,
    setFeedbackModalOpen,
    setFeedbackCategory,
    setFeedbackTitle,
    setFeedbackMessage,
    setFeedbackToast,
  });

  return {
    availableBaselineRuns,
    scenarioPatchesPreview,
    currentProfileHash,
    loadBaselineRuns,
    parseCoreInputs,
    parseRunInputs,
    handleSnapshotNotFoundCode,
    handleSnapshotNotFound,
    copyStrategyAction,
    buildRunInputScenarioFromSelection,
    runOptimizeAction,
    pollRunUntilTerminal,
    syncProfileIfNeeded,
    runPlanAction,
    runScenarioAction,
    submitPlanningFeedbackAction,
  };
}
