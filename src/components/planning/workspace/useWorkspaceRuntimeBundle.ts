"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createInitialStepStatuses,
  type StepStatus,
} from "@/app/planning/_lib/runPipeline";
import { assumptionsFormToRecord, type AssumptionsFormModel } from "@/app/planning/_lib/workspaceAssumptionsEditor";
import { debtOfferRowsToPayload, type DebtOfferFormRow } from "@/app/planning/_lib/workspaceDebtOffersEditor";
import {
  buildWorkspaceCompletedRunState,
  buildStepStatusesFromRunStages,
  type WorkspaceRunMeta as PlanningMeta,
  type WorkspaceRunResult,
} from "@/app/planning/_lib/workspaceRunResult";
import { type SnapshotSelection } from "@/app/planning/_lib/snapshotSelection";
import { resolveWorkspaceSnapshotSelectionFallback } from "@/app/planning/_lib/workspaceSnapshotSelection";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { t, type Locale } from "@/lib/planning/i18n";
import { normalizePlanningResponse, type PlanningApiEngineEnvelope } from "@/lib/planning/api/contracts";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { applyProfilePatch, type ScenarioPatch } from "@/lib/planning/v2/profilePatch";
import { suggestProfileNormalizations, type NormalizationSuggestion } from "@/lib/planning/v2/normalizeProfile";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type PreflightIssue } from "@/lib/planning/v2/preflight";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";
import { type PlanningProfileRecord, type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  normalizeDraft,
  normalizeDraftWithDisclosure,
  toProfileJson,
  validateDebtOfferLiabilityIds,
  type FormDraft,
  type ProfileFormModel,
} from "@/app/planning/_lib/profileFormModel";
import { type ProfileSaveMode } from "@/components/planning/workspace/useWorkspaceProfileBundle";

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

type PlanningFeedbackCreateResponse = {
  id?: string;
};

export type ParsedRunInputs = {
  profile: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  horizon: number;
  snapshotId?: string;
  policyId: AllocationPolicyId;
  monteCarlo: { paths: number; seed: number };
  actions: { includeProducts: boolean; maxCandidatesPerAction: number };
  debt: {
    offers: unknown[];
    options: {
      extraPaymentKrw?: number;
    };
  };
};

export type BaselineRunOption = {
  id: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
};

export type RunInputScenario = NonNullable<PlanningRunRecord["input"]["scenario"]>;

export type ScenarioTemplateId =
  | "NONE"
  | "REDUCE_DISCRETIONARY_10"
  | "REDUCE_DISCRETIONARY_20"
  | "INCOME_PLUS_5";

export const SCENARIO_TEMPLATE_LABELS: Record<ScenarioTemplateId, string> = {
  NONE: "없음",
  REDUCE_DISCRETIONARY_10: "선택지출 -10%",
  REDUCE_DISCRETIONARY_20: "선택지출 -20%",
  INCOME_PLUS_5: "월수입 +5%",
};

export type CurrentProfileHashState = {
  input: string;
  hash: string;
};

type MountedRef = {
  current: boolean;
};

type RuntimeStateBundleInput = {
  isMountedRef: MountedRef;
};

type RuntimeProfileBundleInput = {
  selectedProfileId: string;
  selectedProfile: PlanningProfileRecord | null;
  profileName: string;
  profileForm: ProfileFormModel;
  profileValidationErrors: string[];
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
  saveBlockedByHealth: boolean;
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

function truncate(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function resolveApiErrorMessage(locale: Locale, error: ApiError | undefined, fallbackMessage: string): string {
  const code = typeof error?.code === "string" ? error.code.trim().toUpperCase() : "";
  const mapped = code ? t(locale, code) : "";
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  const base = mapped && mapped !== code ? mapped : (raw || fallbackMessage);
  if (raw && mapped && mapped !== code && raw !== mapped) return `${base} (${truncate(raw)})`;
  return base;
}

function parseApiPayload<T>(
  locale: Locale,
  res: Response,
  payload: ApiResponse<T> | null,
  fallbackMessage: string,
): { ok: boolean; errorMessage: string } {
  if (!isApiBaseResponse(payload)) {
    return {
      ok: false,
      errorMessage: `${fallbackMessage}: 응답 파싱 실패`,
    };
  }
  const typedPayload = payload as ApiResponse<T>;
  if (!res.ok || !typedPayload.ok) {
    return {
      ok: false,
      errorMessage: resolveApiErrorMessage(locale, typedPayload.error, fallbackMessage),
    };
  }
  return { ok: true, errorMessage: "" };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
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

export function parseJsonText<T = unknown>(label: string, text: string): { value: T | null; error: string } {
  try {
    return { value: JSON.parse(text) as T, error: "" };
  } catch {
    return { value: null, error: `${label} JSON 파싱에 실패했습니다.` };
  }
}

export function createScenarioPatchesFromTemplate(templateId: ScenarioTemplateId): ScenarioPatch[] {
  if (templateId === "NONE") {
    return [];
  }
  if (templateId === "REDUCE_DISCRETIONARY_10") {
    return [{ op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.9 }];
  }
  if (templateId === "REDUCE_DISCRETIONARY_20") {
    return [{ op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.8 }];
  }
  return [{ op: "mul", field: "monthlyIncomeNet", value: 1.05 }];
}

export function parseHorizonMonths(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1200) return null;
  return parsed;
}

export function formatPreflightIssue(issue: PreflightIssue): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.message} (${issue.fixHint})`;
  }
  return issue.message;
}

export function formatRunOverallStatusKo(status: PlanningRunRecord["overallStatus"] | undefined): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

export function selectPreferredBaselineRunId(
  rows: BaselineRunOption[],
  previousId = "",
): string {
  if (previousId && rows.some((run) => run.id === previousId)) return previousId;
  return rows.find((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")?.id ?? "";
}

export function resolveRunStatusReviewRequired(input: {
  profileSyncState: string;
  savedRun: PlanningRunRecord | null;
  selectedProfileId: string;
  currentProfileHashInput: string;
  currentProfileHashState: CurrentProfileHashState;
}): boolean {
  if (input.profileSyncState !== "saved" || !input.savedRun?.id || !input.selectedProfileId) return false;
  if (input.savedRun.profileId !== input.selectedProfileId) return false;
  if (!input.savedRun.reproducibility?.profileHash) return true;
  if (!input.currentProfileHashInput) return true;
  if (input.currentProfileHashState.input !== input.currentProfileHashInput) return true;
  return !input.currentProfileHashState.hash;
}

export function resolveRunMatchesCurrentProfile(input: {
  runStatusReviewRequired: boolean;
  profileSyncState: string;
  savedRun: PlanningRunRecord | null;
  selectedProfileId: string;
  currentProfileHash: string;
}): boolean {
  if (input.runStatusReviewRequired) return false;
  if (input.profileSyncState !== "saved" || !input.savedRun?.id || !input.selectedProfileId || !input.currentProfileHash) {
    return false;
  }
  return input.savedRun.profileId === input.selectedProfileId
    && input.savedRun.reproducibility?.profileHash === input.currentProfileHash;
}

export function resolveWorkspaceRuntimeSnapshotFallback(code: unknown) {
  return resolveWorkspaceSnapshotSelectionFallback(code);
}

export function buildPlanningRunInput(input: {
  parsed: ParsedRunInputs;
  effectiveRunScenariosEnabled: boolean;
  effectiveRunActionsEnabled: boolean;
  effectiveRunDebtEnabled: boolean;
  effectiveRunMonteCarloEnabled: boolean;
  scenario?: RunInputScenario;
}): Record<string, unknown> {
  return {
    horizonMonths: input.parsed.horizon,
    policyId: input.parsed.policyId,
    assumptionsOverride: input.parsed.assumptions,
    runScenarios: input.effectiveRunScenariosEnabled,
    getActions: input.effectiveRunActionsEnabled,
    analyzeDebt: input.effectiveRunDebtEnabled,
    includeProducts: input.effectiveRunActionsEnabled ? input.parsed.actions.includeProducts : false,
    ...(input.parsed.snapshotId ? { snapshotId: input.parsed.snapshotId } : {}),
    ...(input.effectiveRunMonteCarloEnabled ? { monteCarlo: input.parsed.monteCarlo } : {}),
    ...(input.effectiveRunDebtEnabled ? {
      debtStrategy: {
        offers: input.parsed.debt.offers,
        options: input.parsed.debt.options,
      },
    } : {}),
    ...(input.scenario ? { scenario: input.scenario } : {}),
  };
}

function isTerminalOverallStatus(status: PlanningRunRecord["overallStatus"]): boolean {
  return status === "SUCCESS" || status === "PARTIAL_SUCCESS" || status === "FAILED";
}

export function useWorkspaceRuntimeStateBundle({
  isMountedRef,
}: RuntimeStateBundleInput) {
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runningOptimize, setRunningOptimize] = useState(false);
  const [autoSaveRunAfterSuccess, setAutoSaveRunAfterSuccess] = useState(false);
  const [pipelineStatuses, setPipelineStatuses] = useState<StepStatus[]>(() => createInitialStepStatuses());
  const [runResult, setRunResult] = useState<WorkspaceRunResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<{
    meta?: PlanningMeta;
    engine: PlanningApiEngineEnvelope["engine"];
    engineSchemaVersion: number;
    candidates: Record<string, unknown>[];
  } | null>(null);
  const [savedRun, setSavedRun] = useState<PlanningRunRecord | null>(null);
  const [currentProfileHashState, setCurrentProfileHashState] = useState<CurrentProfileHashState>({
    input: "",
    hash: "",
  });
  const [baselineRuns, setBaselineRuns] = useState<BaselineRunOption[]>([]);
  const [loadingBaselineRuns, setLoadingBaselineRuns] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [scenarioTemplateId, setScenarioTemplateId] = useState<ScenarioTemplateId>("NONE");
  const [activeTab, setActiveTab] = useState<"summary" | "warningsGoals" | "actions" | "scenarios" | "monteCarlo" | "debt">("summary");
  const [showAllActions, setShowAllActions] = useState(false);
  const [healthAck, setHealthAck] = useState(false);
  const [saveWarningConfirmed, setSaveWarningConfirmed] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [isMountedRef]);

  return {
    running,
    setRunning,
    savingRun,
    setSavingRun,
    runningOptimize,
    setRunningOptimize,
    autoSaveRunAfterSuccess,
    setAutoSaveRunAfterSuccess,
    pipelineStatuses,
    setPipelineStatuses,
    runResult,
    setRunResult,
    optimizeResult,
    setOptimizeResult,
    savedRun,
    setSavedRun,
    currentProfileHashState,
    setCurrentProfileHashState,
    baselineRuns,
    setBaselineRuns,
    loadingBaselineRuns,
    setLoadingBaselineRuns,
    baselineRunId,
    setBaselineRunId,
    scenarioTemplateId,
    setScenarioTemplateId,
    activeTab,
    setActiveTab,
    showAllActions,
    setShowAllActions,
    healthAck,
    setHealthAck,
    saveWarningConfirmed,
    setSaveWarningConfirmed,
  };
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
    saveBlockedByHealth,
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

    const paths = Number.parseInt(monteCarloPaths, 10);
    const seed = Number.parseInt(monteCarloSeed, 10);
    if (effectiveRunMonteCarloEnabled) {
      if (!Number.isFinite(paths) || paths < 1 || paths > 20000) {
        pushWorkspaceError("Monte Carlo paths는 1~20000 범위여야 합니다.");
        return null;
      }
      if (!Number.isFinite(seed)) {
        pushWorkspaceError("Monte Carlo seed는 숫자여야 합니다.");
        return null;
      }
    }

    const maxCandidates = Number.parseInt(maxCandidatesPerAction, 10);
    if (effectiveRunActionsEnabled && (!Number.isFinite(maxCandidates) || maxCandidates < 1 || maxCandidates > 20)) {
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
      monteCarlo: { paths, seed },
      actions: {
        includeProducts: effectiveIncludeProducts,
        maxCandidatesPerAction: maxCandidates,
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

  const runOptimizeAction = useCallback(async (): Promise<void> => {
    const core = parseCoreInputs();
    if (!core) return;
    if (optimizerServerDisabled) {
      pushWorkspaceError("서버 설정으로 Optimizer 기능이 비활성화되어 있습니다.");
      return;
    }

    const constraintsParsed = parseJsonText<Record<string, unknown>>("Optimizer constraints", optimizerConstraintsJson);
    if (!constraintsParsed.value) {
      pushWorkspaceError(constraintsParsed.error);
      return;
    }
    const knobsParsed = parseJsonText<Record<string, unknown>>("Optimizer knobs", optimizerKnobsJson);
    if (!knobsParsed.value) {
      pushWorkspaceError(knobsParsed.error);
      return;
    }
    const searchParsed = parseJsonText<Record<string, unknown>>("Optimizer search", optimizerSearchJson);
    if (!searchParsed.value) {
      pushWorkspaceError(searchParsed.error);
      return;
    }

    state.setRunningOptimize(true);
    try {
      const res = await fetch("/api/planning/v2/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profile: core.profile,
          horizonMonths: core.horizon,
          assumptions: core.assumptions,
          ...(core.snapshotId ? { snapshotId: core.snapshotId } : {}),
          constraints: constraintsParsed.value,
          knobs: knobsParsed.value,
          search: searchParsed.value,
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
      if (handleSnapshotNotFound(payload)) return;
      const parsedPayload = parseApiPayload(locale, res, payload, "Optimizer 실행에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return;
      }
      const typedPayload = payload as ApiResponse<Record<string, unknown>>;

      const normalized = normalizePlanningResponse(asRecord(typedPayload.data));
      const rows = asArray(asRecord(normalized.data).candidates).map((entry) => asRecord(entry));
      state.setOptimizeResult({
        meta: asRecord(typedPayload.meta) as PlanningMeta,
        engine: normalized.engine,
        engineSchemaVersion: normalized.engineSchemaVersion,
        candidates: rows,
      });
      pushWorkspaceNotice(`Optimizer 후보 ${rows.length}개를 생성했습니다.`);
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "Optimizer 실행 중 오류가 발생했습니다.");
    } finally {
      state.setRunningOptimize(false);
    }
  }, [
    handleSnapshotNotFound,
    locale,
    optimizerConstraintsJson,
    optimizerKnobsJson,
    optimizerSearchJson,
    optimizerServerDisabled,
    parseCoreInputs,
    pushWorkspaceError,
    pushWorkspaceNotice,
    state,
  ]);

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

  const syncProfileIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!selectedProfileId) {
      pushWorkspaceError("저장할 프로필을 먼저 선택하세요.");
      return false;
    }

    if (profileValidationErrors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidationErrors.join("\n- ")}`);
      return false;
    }
    const parsedProfile = toProfileJson(profileForm);
    const canonicalProfile = normalizeDraftWithDisclosure(parsedProfile as unknown as FormDraft, profileName);

    const suggestions = suggestProfileNormalizations(parsedProfile);
    if (suggestions.length > 0) {
      setPendingProfileSave({ mode: "update", profile: parsedProfile });
      setPendingSuggestions(suggestions);
      setAcceptedSuggestionCodes([]);
      pushWorkspaceError("프로필 저장 전 정규화 제안을 먼저 확인해주세요.");
      return false;
    }

    const before = pretty(normalizeDraft((selectedProfile?.profile ?? {}) as FormDraft, selectedProfile?.name ?? profileName));
    const after = pretty(canonicalProfile.profile);
    const dirty = before !== after || (selectedProfile?.name ?? "") !== profileName;
    if (!dirty) return true;

    const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withDevCsrf({
        name: profileName,
        profile: canonicalProfile.profile,
      })),
    });
    const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
    const parsedPayload = parseApiPayload(locale, res, payload, "실행 기록 저장 전 프로필 동기화에 실패했습니다.");
    if (!parsedPayload.ok) {
      pushWorkspaceError(parsedPayload.errorMessage);
      return false;
    }
    const normalizationFromResponse = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
    setLastNormalizationDisclosure(normalizationFromResponse ?? canonicalProfile.normalization);

    await loadProfiles(selectedProfileId);
    return true;
  }, [
    loadProfiles,
    locale,
    profileForm,
    profileName,
    profileValidationErrors,
    pushWorkspaceError,
    selectedProfile,
    selectedProfileId,
    setAcceptedSuggestionCodes,
    setLastNormalizationDisclosure,
    setPendingProfileSave,
    setPendingSuggestions,
  ]);

  const persistRunAction = useCallback(async (
    parsed: ParsedRunInputs,
    options?: { silent?: boolean; bypassWarningConfirmation?: boolean; scenario?: RunInputScenario },
  ): Promise<PlanningRunRecord | null> => {
    if (!selectedProfileId) {
      if (!options?.silent) pushWorkspaceError("저장할 프로필을 먼저 선택하세요.");
      return null;
    }
    if (preflightHasBlockers) {
      if (!options?.silent) {
        const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
        pushWorkspaceError(`사전 점검 오류로 저장할 수 없습니다.\n${details}`);
      }
      return null;
    }
    if (preflightWarnIssues.length > 0 && !options?.bypassWarningConfirmation) {
      if (!options?.silent) {
        pushWorkspaceError("사전 점검 경고를 확인한 뒤 '이대로 저장' 체크를 켜주세요.");
      }
      return null;
    }

    state.setSavingRun(true);
    try {
      const synced = await syncProfileIfNeeded();
      if (!synced) return null;

      const res = await fetch("/api/planning/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          title: options?.scenario?.title ? `${runTitle} [What-if: ${options.scenario.title}]` : runTitle,
          input: buildPlanningRunInput({
            parsed,
            effectiveRunScenariosEnabled,
            effectiveRunActionsEnabled,
            effectiveRunDebtEnabled,
            effectiveRunMonteCarloEnabled,
            ...(options?.scenario ? { scenario: options.scenario } : {}),
          }),
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (handleSnapshotNotFound(payload)) return null;
      const parsedPayload = parseApiPayload(locale, res, payload, "실행 기록 저장에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return null;
      }
      const saved = (payload as ApiResponse<PlanningRunRecord>).data ?? null;
      state.setSavedRun(saved);
      if (!options?.silent) {
        pushWorkspaceNotice(
          beginnerMode
            ? "결과 저장을 완료했습니다. 이제 저장된 리포트를 확인하고 실행 기록에서 비교를 이어갈 수 있습니다."
            : "실행 기록 저장을 완료했습니다. /planning/runs에서 비교할 수 있습니다.",
        );
      }
      return saved;
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "실행 기록 저장 중 오류가 발생했습니다.");
      return null;
    } finally {
      state.setSavingRun(false);
    }
  }, [
    beginnerMode,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunScenariosEnabled,
    handleSnapshotNotFound,
    locale,
    preflightBlockIssues,
    preflightHasBlockers,
    preflightWarnIssues.length,
    pushWorkspaceError,
    pushWorkspaceNotice,
    runTitle,
    selectedProfileId,
    state,
    syncProfileIfNeeded,
  ]);

  const runPlanAction = useCallback(async (options?: { scenario?: RunInputScenario }): Promise<void> => {
    if (preflightHasBlockers) {
      const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
      pushWorkspaceError(`사전 점검 오류를 먼저 해결하세요.\n${details}`);
      return;
    }
    if (!selectedProfileId) {
      pushWorkspaceError("실행할 프로필을 먼저 선택하세요.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;

    state.setRunning(true);
    state.setPipelineStatuses(createInitialStepStatuses());
    state.setSavedRun(null);

    try {
      const synced = await syncProfileIfNeeded();
      if (!isMountedRef.current) return;
      if (!synced) return;

      const response = await fetch("/api/planning/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          title: options?.scenario?.title ? `${runTitle} · ${options.scenario.title}` : runTitle,
          input: buildPlanningRunInput({
            parsed,
            effectiveRunScenariosEnabled,
            effectiveRunActionsEnabled,
            effectiveRunDebtEnabled,
            effectiveRunMonteCarloEnabled,
            ...(options?.scenario ? { scenario: options.scenario } : {}),
          }),
        })),
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!isMountedRef.current) return;
      if (handleSnapshotNotFound(payload)) return;
      const parsedPayload = parseApiPayload(locale, response, payload, "실행 요청에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return;
      }
      const normalizationFromRunMeta = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
      if (normalizationFromRunMeta) {
        setLastNormalizationDisclosure(normalizationFromRunMeta);
      }

      const created = (payload as ApiResponse<PlanningRunRecord>).data;
      if (!created?.id) {
        pushWorkspaceError("실행 ID를 확인하지 못했습니다.");
        return;
      }
      const finalRun = await pollRunUntilTerminal(created.id, created);
      if (!isMountedRef.current) return;
      if (!finalRun) {
        pushWorkspaceError("실행 상태를 확인하지 못했습니다.");
        return;
      }

      const completedRunState = buildWorkspaceCompletedRunState(finalRun);
      state.setRunResult(completedRunState.runResult);
      state.setSavedRun(finalRun);
      state.setPipelineStatuses(completedRunState.stepStatuses);
      if (selectedProfileId) {
        void loadBaselineRuns(selectedProfileId);
      }
      state.setActiveTab("summary");
      state.setShowAllActions(false);

      const runCompletedNotice = beginnerMode
        ? "첫 실행과 결과 저장을 완료했습니다. 이제 저장된 리포트를 확인하고 실행 기록에서 비교를 이어갈 수 있습니다."
        : "실행을 완료했습니다.";
      if (completedRunState.notices.length > 0) {
        pushWorkspaceNotice([runCompletedNotice, ...completedRunState.notices.map((notice) => `- ${notice}`)].join("\n"));
      } else {
        pushWorkspaceNotice(runCompletedNotice);
      }
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "실행 중 오류가 발생했습니다.");
    } finally {
      if (!isMountedRef.current) return;
      state.setRunning(false);
    }
  }, [
    beginnerMode,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunScenariosEnabled,
    handleSnapshotNotFound,
    isMountedRef,
    loadBaselineRuns,
    locale,
    parseRunInputs,
    pollRunUntilTerminal,
    preflightBlockIssues,
    preflightHasBlockers,
    pushWorkspaceError,
    pushWorkspaceNotice,
    runTitle,
    selectedProfileId,
    setLastNormalizationDisclosure,
    state,
    syncProfileIfNeeded,
  ]);

  const runScenarioAction = useCallback(async (): Promise<void> => {
    const scenario = buildRunInputScenarioFromSelection();
    if (!scenario) {
      pushWorkspaceError("시나리오 템플릿을 먼저 선택하세요.");
      return;
    }
    await runPlanAction({ scenario });
  }, [buildRunInputScenarioFromSelection, pushWorkspaceError, runPlanAction]);

  const saveRunAction = useCallback(async (): Promise<void> => {
    if (!state.runResult?.hasSimulateResult) {
      pushWorkspaceError("먼저 실행을 진행하세요.");
      return;
    }
    if (saveBlockedByHealth) {
      pushWorkspaceError("치명 경고 확인 체크 후 저장할 수 있습니다.");
      return;
    }
    if (preflightHasBlockers) {
      const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
      pushWorkspaceError(`사전 점검 오류로 저장할 수 없습니다.\n${details}`);
      return;
    }
    if (preflightWarnIssues.length > 0 && !state.saveWarningConfirmed) {
      pushWorkspaceError("사전 점검 경고를 확인한 뒤 '이대로 저장' 체크를 켜주세요.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;
    const selectedScenario = buildRunInputScenarioFromSelection();
    await persistRunAction(parsed, {
      bypassWarningConfirmation: true,
      ...(selectedScenario ? { scenario: selectedScenario } : {}),
    });
  }, [
    buildRunInputScenarioFromSelection,
    parseRunInputs,
    persistRunAction,
    preflightBlockIssues,
    preflightHasBlockers,
    preflightWarnIssues.length,
    pushWorkspaceError,
    saveBlockedByHealth,
    state.runResult,
    state.saveWarningConfirmed,
  ]);

  const submitPlanningFeedbackAction = useCallback(async (): Promise<void> => {
    const title = feedbackTitle.trim();
    const message = feedbackMessage.trim();
    if (title.length < 2 || title.length > 160) {
      pushWorkspaceError("피드백 제목은 2~160자로 입력하세요.");
      return;
    }
    if (message.length < 5 || message.length > 5000) {
      pushWorkspaceError("피드백 내용은 5~5000자로 입력하세요.");
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const response = await fetch("/api/ops/feedback/planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          from: { screen: "/planning" },
          context: {
            ...(Object.keys(workspaceSnapshotState.feedbackContext).length > 0 ? { snapshot: workspaceSnapshotState.feedbackContext } : {}),
            ...(state.savedRun?.id ? { runId: state.savedRun.id } : {}),
            ...(healthSummary ? {
              health: {
                ...(typeof healthSummary.criticalCount === "number" ? { criticalCount: healthSummary.criticalCount } : {}),
                ...(Array.isArray(healthSummary.warningCodes) ? { warningsCodes: healthSummary.warningCodes } : {}),
              },
            } : {}),
          },
          content: {
            category: feedbackCategory,
            title,
            message,
          },
        })),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: { code?: string; message?: string };
        data?: PlanningFeedbackCreateResponse;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? payload?.message ?? "피드백 저장에 실패했습니다.");
      }

      const createdId = asString(payload.data?.id);
      setFeedbackModalOpen(false);
      setFeedbackCategory("ux");
      setFeedbackTitle("");
      setFeedbackMessage("");
      setFeedbackToast(createdId ? `저장됨(${createdId})` : "저장됨");
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "피드백 저장 중 오류가 발생했습니다.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    feedbackCategory,
    feedbackMessage,
    feedbackTitle,
    healthSummary,
    pushWorkspaceError,
    setFeedbackCategory,
    setFeedbackMessage,
    setFeedbackModalOpen,
    setFeedbackSubmitting,
    setFeedbackTitle,
    setFeedbackToast,
    state.savedRun?.id,
    workspaceSnapshotState.feedbackContext,
  ]);

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
    persistRunAction,
    runPlanAction,
    runScenarioAction,
    saveRunAction,
    submitPlanningFeedbackAction,
  };
}
