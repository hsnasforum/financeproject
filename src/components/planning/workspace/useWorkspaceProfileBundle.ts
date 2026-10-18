"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildProfileJsonEditorState,
  createDefaultProfileFormModel,
  normalizeDraftWithDisclosure,
  type FormDraft,
  hydrateProfileJsonEditorState,
  parseProfileJsonEditorDraft,
  toProfileJson,
  validateProfileForm,
  type ProfileFormDebt,
  type ProfileFormGoal,
  type ProfileJsonEditorState,
  type ProfileFormModel,
} from "@/lib/planning/ui/profileFormModel";
import { buildWorkspaceLiveSummary } from "@/lib/planning/ui/workspaceQuickStart";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { createManualConfirmInput, verifyConfirm } from "@/lib/ops/confirm";
import { t, type Locale } from "@/lib/planning/i18n";
import {
  normalizeProfileId,
  PLANNING_SELECTED_PROFILE_STORAGE_KEY,
} from "@/lib/planning/profileScope";
import { SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME } from "@/lib/planning/samples/profile.sample.ko";
import { type PlanningProfileRecord } from "@/lib/planning/store/types";
import { applySuggestions } from "@/lib/planning/v2/applySuggestions";
import {
  suggestProfileNormalizations,
  type NormalizationSuggestion,
} from "@/lib/planning/v2/normalizeProfile";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "@/lib/regions/kr_admin_2025";
import { type WorkspaceProfileDeleteDialogState } from "@/components/planning/workspace/useWorkspaceFeedbackUiBundle";

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

const profileHydrationCache = new Map<string, PlanningProfileRecord>();

export type ProfileSaveMode = "create" | "duplicate" | "update";

const DEFAULT_PROFILE_JSON = `{
  "monthlyIncomeNet": 4200000,
  "monthlyEssentialExpenses": 1600000,
  "monthlyDiscretionaryExpenses": 700000,
  "liquidAssets": 1200000,
  "investmentAssets": 3500000,
  "debts": [
    {
      "id": "demo-loan-1",
      "name": "Mortgage A",
      "balance": 78000000,
      "minimumPayment": 1120000,
      "aprPct": 4.8,
      "remainingMonths": 180,
      "repaymentType": "amortizing"
    }
  ],
  "goals": []
}`;

export const BEGINNER_MAX_DEBT_ROWS = 3;

const BEGINNER_GOAL_IDS = {
  emergency: "goal-emergency",
  lumpSum: "goal-lumpsum",
  retirement: "goal-retirement",
} as const;

type BeginnerGoalKind = keyof typeof BEGINNER_GOAL_IDS;

type BeginnerGoalContext = {
  monthlyExpenses: number;
  liquidAssets: number;
  investmentAssets: number;
};

type MountedRef = {
  current: boolean;
};

type WorkspaceProfileBundleInput = {
  locale: Locale;
  initialSelectedProfileId: string;
  initialSelectedProfile?: PlanningProfileRecord | null;
  beginnerMode: boolean;
  beginnerModeLoaded: boolean;
  isMountedRef: MountedRef;
  profileDeleteDialog: WorkspaceProfileDeleteDialogState;
  setProfileDeleteDialog: Dispatch<SetStateAction<WorkspaceProfileDeleteDialogState>>;
  pushWorkspaceNotice: (message: string) => void;
  pushWorkspaceError: (message: string) => void;
};

export function resolveInitialProfileRequestId(
  initialSelectedProfileId: string,
  storedSelectedProfileId?: string | null,
): string {
  return normalizeProfileId(initialSelectedProfileId) || normalizeProfileId(storedSelectedProfileId);
}

export function selectLoadedProfileId(
  profiles: PlanningProfileRecord[],
  requestedId?: string,
): string {
  if (requestedId && profiles.some((profile) => profile.id === requestedId)) {
    return requestedId;
  }
  return profiles[0]?.id ?? "";
}

export function buildSelectedProfileHydrationStamp(profile: PlanningProfileRecord | null): string {
  if (!profile) return "";
  return `${profile.id}:${profile.updatedAt}:${profile.name}`;
}

export function shouldHydrateSelectedProfile(nextStamp: string, previousStamp: string): boolean {
  return nextStamp.length > 0 && nextStamp !== previousStamp;
}

export function shouldSkipSelectedProfileHydrationAfterLocalEdit(input: {
  profileId: string;
  selectedProfileId: string;
  lastHydratedProfileStamp: string;
  hasLocalEdits: boolean;
}): boolean {
  if (!input.hasLocalEdits) return false;
  const profileId = normalizeProfileId(input.profileId);
  if (!profileId) return false;
  if (normalizeProfileId(input.selectedProfileId) === profileId) return true;
  return input.lastHydratedProfileStamp.startsWith(`${profileId}:`);
}

export function shouldApplyProfileHydrationForEditVersion(input: {
  currentLocalEditVersion: number;
  hydrationLocalEditVersion: number;
}): boolean {
  return input.currentLocalEditVersion === input.hydrationLocalEditVersion;
}

// A detail read only applies to the selection it was started for. The generation also
// changes on A -> B -> A, and the data epoch changes after a committed save or delete.
export function shouldApplyProfileDetailResponse(input: {
  requestedProfileId: string;
  currentSelectedProfileId: string;
  requestSelectionGeneration: number;
  currentSelectionGeneration: number;
  requestDataEpoch: number;
  currentDataEpoch: number;
}): boolean {
  return input.requestedProfileId.length > 0
    && input.requestedProfileId === input.currentSelectedProfileId
    && input.requestSelectionGeneration === input.currentSelectionGeneration
    && input.requestDataEpoch === input.currentDataEpoch;
}

export function isLatestProfileListResponse(input: {
  requestSequence: number;
  latestSequence: number;
}): boolean {
  return input.requestSequence === input.latestSequence;
}

// Checked when the list response is applied: a selection or content edit made while the
// list was loading keeps the current selection instead of the id requested at start.
export function resolveProfileListSelectionRequest(input: {
  nextSelectedId?: string;
  currentSelectedProfileId: string;
  requestSelectionGeneration: number;
  currentSelectionGeneration: number;
  editedSinceRequest: boolean;
}): string {
  if (input.requestSelectionGeneration !== input.currentSelectionGeneration || input.editedSinceRequest) {
    return input.currentSelectedProfileId;
  }
  return input.nextSelectedId || input.currentSelectedProfileId;
}

// The content version counts form, name and JSON draft edits; focus alone does not count.
export function hasProfileEditsSinceDispatch(input: {
  dispatchContentVersion: number;
  currentContentVersion: number;
}): boolean {
  return input.currentContentVersion !== input.dispatchContentVersion;
}

// Content versions only grow. A selection change discards earlier edits, so only edits made
// after both the save dispatch and the current selection are still on screen and unsaved.
export function hasUnsavedProfileEditsAfterSave(input: {
  dispatchContentVersion: number;
  selectionContentVersion: number;
  currentContentVersion: number;
}): boolean {
  return input.currentContentVersion !== Math.max(input.dispatchContentVersion, input.selectionContentVersion);
}

export function clearProfileSuggestionState() {
  return {
    pendingProfileSave: null,
    pendingSuggestions: [] as NormalizationSuggestion[],
    acceptedSuggestionCodes: [] as string[],
  };
}

export function buildSelectedProfileHydration(profile: PlanningProfileRecord) {
  return {
    profileName: profile.name,
    editorState: hydrateProfileJsonEditorState(profile.profile, profile.name),
    suggestionState: clearProfileSuggestionState(),
    lastNormalizationDisclosure: null as ProfileNormalizationDisclosure | null,
  };
}

export function resolveProfileSaveFeedback(mode: ProfileSaveMode, beginnerMode: boolean) {
  const fallbackMessage = mode === "create"
    ? "프로필 생성에 실패했습니다."
    : mode === "duplicate"
      ? "프로필 복제에 실패했습니다."
      : "프로필 수정에 실패했습니다.";
  const errorMessage = mode === "create"
    ? "프로필 생성 중 오류가 발생했습니다."
    : mode === "duplicate"
      ? "프로필 복제 중 오류가 발생했습니다."
      : "프로필 수정 중 오류가 발생했습니다.";
  const successMessage = mode === "create"
    ? beginnerMode
      ? "프로필 저장 완료. 다음 단계는 첫 실행·기록 저장이며, 완료 뒤 리포트를 확인할 수 있습니다."
      : "프로필을 저장했습니다."
    : mode === "duplicate"
      ? "프로필을 복제했습니다."
      : beginnerMode
        ? "프로필 저장 완료. 다음 단계는 첫 실행·기록 저장이며, 완료 뒤 리포트를 확인할 수 있습니다."
        : "프로필을 수정했습니다.";

  return {
    fallbackMessage,
    errorMessage,
    successMessage,
  };
}

export type ProfileSaveFollowUp = {
  nextSelectedId?: string;
  clearLocalEdits: boolean;
};

// Decided when the save response arrives. The follow-up list re-checks selection and
// edits again when it is applied, because the user can keep working while it loads.
export function resolveProfileSaveFollowUp(input: {
  mode: ProfileSaveMode;
  savedProfileId: string;
  selectionChanged: boolean;
  hasEditsSinceDispatch: boolean;
}): ProfileSaveFollowUp {
  const keepCurrentSelection = input.selectionChanged || (input.mode !== "update" && input.hasEditsSinceDispatch);
  return {
    nextSelectedId: keepCurrentSelection ? undefined : (input.savedProfileId || undefined),
    clearLocalEdits: !input.selectionChanged && !input.hasEditsSinceDispatch,
  };
}

// Decided after the follow-up list so the notice matches what the screen actually shows.
export function resolveProfileSaveCompletionNotice(input: {
  mode: ProfileSaveMode;
  beginnerMode: boolean;
  savedProfileName: string;
  savedProfileSelected: boolean;
  hasUnsavedEdits: boolean;
}): string {
  const savedLabel = input.mode === "create"
    ? "새 프로필을 저장했습니다"
    : input.mode === "duplicate"
      ? "프로필 복제본을 저장했습니다"
      : "프로필 수정 내용을 저장했습니다";
  const savedLine = `${savedLabel}: ${input.savedProfileName || "이름 없는 프로필"}`;
  const unsavedLine = "저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다.";
  const successMessage = resolveProfileSaveFeedback(input.mode, input.beginnerMode).successMessage;
  if (input.savedProfileSelected) {
    return input.hasUnsavedEdits
      ? `${successMessage}\n${unsavedLine} 반영하려면 저장을 한 번 더 누르세요.`
      : successMessage;
  }
  return input.hasUnsavedEdits
    ? `${savedLine}\n${unsavedLine} 현재 선택과 입력을 그대로 유지했습니다.`
    : `${savedLine}\n현재 선택한 프로필과 입력은 그대로 유지했습니다.`;
}

export function resolveProfileSavePayloadName(mode: ProfileSaveMode, profileName: string): string {
  return mode === "duplicate" ? `${profileName || "프로필"} (copy)` : profileName;
}

export function createProfileDeleteDialogState(
  selectedProfileId: string,
): WorkspaceProfileDeleteDialogState {
  const safeProfileId = selectedProfileId.trim();
  if (!safeProfileId) return null;
  const confirmInput = createManualConfirmInput("DELETE profile", safeProfileId);
  return {
    profileId: safeProfileId,
    ...confirmInput,
  };
}

export function isDeleteProfileConfirmMatched(
  dialog: WorkspaceProfileDeleteDialogState,
): boolean {
  if (!dialog) return false;
  return verifyConfirm(dialog.confirmText, dialog.expectedConfirm);
}

function beginnerGoalContext(form: ProfileFormModel): BeginnerGoalContext {
  return {
    monthlyExpenses: Math.max(0, form.monthlyEssentialExpenses + form.monthlyDiscretionaryExpenses),
    liquidAssets: Math.max(0, form.liquidAssets),
    investmentAssets: Math.max(0, form.investmentAssets),
  };
}

function goalMatchesKind(goal: ProfileFormGoal, kind: BeginnerGoalKind): boolean {
  const name = goal.name.toLowerCase();
  const id = goal.id.toLowerCase();
  if (kind === "emergency") {
    return id.includes("emergency") || name.includes("비상") || name.includes("emergency");
  }
  if (kind === "lumpSum") {
    return id.includes("lumpsum") || name.includes("목돈") || name.includes("lump");
  }
  return id.includes("retire") || name.includes("은퇴") || name.includes("retire");
}

function createBeginnerGoal(kind: BeginnerGoalKind, context: BeginnerGoalContext): ProfileFormGoal {
  if (kind === "emergency") {
    return {
      id: BEGINNER_GOAL_IDS.emergency,
      name: "비상금",
      targetAmount: Math.max(0, Math.round(context.monthlyExpenses * 6)),
      currentAmount: context.liquidAssets,
      targetMonth: 12,
      priority: 5,
      minimumMonthlyContribution: 0,
    };
  }
  if (kind === "lumpSum") {
    return {
      id: BEGINNER_GOAL_IDS.lumpSum,
      name: "목돈 목표",
      targetAmount: 30_000_000,
      currentAmount: 0,
      targetMonth: 60,
      priority: 4,
      minimumMonthlyContribution: 0,
    };
  }
  return {
    id: BEGINNER_GOAL_IDS.retirement,
    name: "은퇴 목표",
    targetAmount: 300_000_000,
    currentAmount: context.investmentAssets,
    targetMonth: 360,
    priority: 3,
    minimumMonthlyContribution: 0,
  };
}

export function ensureBeginnerGoals(goals: ProfileFormGoal[], context: BeginnerGoalContext): ProfileFormGoal[] {
  const next = [...goals];
  (Object.keys(BEGINNER_GOAL_IDS) as BeginnerGoalKind[]).forEach((kind) => {
    const exists = next.some((goal) => goal.id === BEGINNER_GOAL_IDS[kind] || goalMatchesKind(goal, kind));
    if (!exists) {
      next.push(createBeginnerGoal(kind, context));
    }
  });
  return next;
}

function findBeginnerGoal(goals: ProfileFormGoal[], kind: BeginnerGoalKind, context: BeginnerGoalContext): ProfileFormGoal {
  const found = goals.find((goal) => goal.id === BEGINNER_GOAL_IDS[kind] || goalMatchesKind(goal, kind));
  return found ?? createBeginnerGoal(kind, context);
}

export function updateBeginnerGoalList(
  goals: ProfileFormGoal[],
  kind: BeginnerGoalKind,
  context: BeginnerGoalContext,
  patch: Partial<ProfileFormGoal>,
): ProfileFormGoal[] {
  const ensured = ensureBeginnerGoals(goals, context);
  const index = ensured.findIndex((goal) => goal.id === BEGINNER_GOAL_IDS[kind] || goalMatchesKind(goal, kind));
  if (index < 0) return ensured;
  const current = ensured[index];
  const nextGoal: ProfileFormGoal = {
    ...current,
    ...patch,
    id: current.id || BEGINNER_GOAL_IDS[kind],
    name: current.name || createBeginnerGoal(kind, context).name,
    targetAmount: Math.max(0, Number(patch.targetAmount ?? current.targetAmount ?? 0)),
    currentAmount: Math.max(0, Number(patch.currentAmount ?? current.currentAmount ?? 0)),
    targetMonth: Math.max(1, Math.trunc(Number(patch.targetMonth ?? current.targetMonth ?? 12))),
    priority: Math.max(1, Math.trunc(Number(patch.priority ?? current.priority ?? 3))),
    minimumMonthlyContribution: Math.max(0, Number(patch.minimumMonthlyContribution ?? current.minimumMonthlyContribution ?? 0)),
  };
  return ensured.map((goal, goalIndex) => (goalIndex === index ? nextGoal : goal));
}

export function emergencyMonthsFromGoal(goal: ProfileFormGoal, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 6;
  const raw = goal.targetAmount / monthlyExpenses;
  if (!Number.isFinite(raw) || raw <= 0) return 6;
  return Math.max(1, Math.round(raw));
}

export function canAddProfileDebtRow(beginnerMode: boolean, debtCount: number): boolean {
  return !beginnerMode || debtCount < BEGINNER_MAX_DEBT_ROWS;
}

export function canRemoveProfileDebtRow(beginnerMode: boolean, debtCount: number): boolean {
  return !beginnerMode || debtCount > 1;
}

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

function nextRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function tryParseJsonText<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function rememberHydratedProfile(profile: PlanningProfileRecord): void {
  profileHydrationCache.set(profile.id, profile);
}

export function useWorkspaceProfileBundle({
  locale,
  initialSelectedProfileId,
  initialSelectedProfile = null,
  beginnerMode,
  isMountedRef,
  profileDeleteDialog,
  setProfileDeleteDialog,
  pushWorkspaceNotice,
  pushWorkspaceError,
}: WorkspaceProfileBundleInput) {
  const initialHydratedProfileId = normalizeProfileId(initialSelectedProfileId) || normalizeProfileId(initialSelectedProfile?.id);
  const lastHydratedProfileStampRef = useRef("");
  const initialProfileLoadSettledRef = useRef(false);
  const profileEditorHasLocalEditsRef = useRef(false);
  const profileEditorLocalEditVersionRef = useRef(0);
  const selectedProfileIdRef = useRef(initialHydratedProfileId);
  const selectionGenerationRef = useRef(0);
  const profileListRequestSequenceRef = useRef(0);
  const profileDataEpochRef = useRef(0);
  const profileEditorContentVersionRef = useRef(0);
  // Content version at the last selection change, when the previous selection's edits were dropped.
  const selectionContentVersionRef = useRef(0);
  const profileDetailRequestSequenceRef = useRef(0);
  const profileDetailInFlightKeyRef = useRef("");
  const cachedSelectedProfile = useMemo(() => {
    if (initialSelectedProfile) return initialSelectedProfile;
    const normalizedProfileId = normalizeProfileId(initialSelectedProfileId);
    return normalizedProfileId ? profileHydrationCache.get(normalizedProfileId) ?? null : null;
  }, [initialSelectedProfile, initialSelectedProfileId]);
  const initialProfileEditorState = useMemo(() => {
    if (cachedSelectedProfile) {
      return hydrateProfileJsonEditorState(cachedSelectedProfile.profile, cachedSelectedProfile.name);
    }
    const parsed = tryParseJsonText<ProfileV2>(DEFAULT_PROFILE_JSON);
    return parsed
      ? hydrateProfileJsonEditorState(parsed, "기본 프로필")
      : buildProfileJsonEditorState(createDefaultProfileFormModel(), "기본 프로필");
  }, [cachedSelectedProfile]);

  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>(() => (cachedSelectedProfile ? [cachedSelectedProfile] : []));
  const [selectedProfileId, setSelectedProfileId] = useState(initialHydratedProfileId);
  const [profileName, setProfileName] = useState(cachedSelectedProfile?.name || "기본 프로필");
  const [profileJson, setProfileJson] = useState(initialProfileEditorState.json);
  const [profileJsonDraft, setProfileJsonDraft] = useState(initialProfileEditorState.jsonDraft);
  const [profileJsonError, setProfileJsonError] = useState(initialProfileEditorState.jsonError);
  const [profileForm, setProfileForm] = useState<ProfileFormModel>(initialProfileEditorState.form);
  const [loadingProfiles, setLoadingProfiles] = useState(!cachedSelectedProfile);
  const [profilesLoadError, setProfilesLoadError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pendingProfileSave, setPendingProfileSave] = useState<{
    mode: ProfileSaveMode;
    profile: ProfileV2;
  } | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<NormalizationSuggestion[]>([]);
  const [acceptedSuggestionCodes, setAcceptedSuggestionCodes] = useState<string[]>([]);
  const [lastNormalizationDisclosure, setLastNormalizationDisclosure] = useState<ProfileNormalizationDisclosure | null>(null);

  const markProfileEditorLocalEdit = useCallback((): void => {
    profileEditorHasLocalEditsRef.current = true;
    profileEditorLocalEditVersionRef.current += 1;
  }, []);
  // Called synchronously from every content change, unlike focus which only marks a local edit.
  const markProfileEditorContentEdit = useCallback((): void => {
    markProfileEditorLocalEdit();
    profileEditorContentVersionRef.current += 1;
  }, [markProfileEditorLocalEdit]);
  const applyProfileEditorState = useCallback((
    nextState: ProfileJsonEditorState,
    nextProfileName?: string,
  ): void => {
    const resolvedProfileName = (nextProfileName ?? nextState.form.name ?? "기본 프로필") || "기본 프로필";
    setProfileName(resolvedProfileName);
    setProfileForm(nextState.form);
    setProfileJson(nextState.json);
    setProfileJsonDraft(nextState.jsonDraft);
    setProfileJsonError(nextState.jsonError);
  }, []);
  const applyHydratedProfileEditorState = useCallback((
    nextState: ProfileJsonEditorState,
    nextProfileName?: string,
  ): void => {
    const hydrationLocalEditVersion = profileEditorLocalEditVersionRef.current;
    const resolvedProfileName = (nextProfileName ?? nextState.form.name ?? "기본 프로필") || "기본 프로필";
    const shouldApply = () => shouldApplyProfileHydrationForEditVersion({
      currentLocalEditVersion: profileEditorLocalEditVersionRef.current,
      hydrationLocalEditVersion,
    });
    setProfileName((current) => (shouldApply() ? resolvedProfileName : current));
    setProfileForm((current) => (shouldApply() ? nextState.form : current));
    setProfileJson((current) => (shouldApply() ? nextState.json : current));
    setProfileJsonDraft((current) => (shouldApply() ? nextState.jsonDraft : current));
    setProfileJsonError((current) => (shouldApply() ? nextState.jsonError : current));
  }, []);
  const applyLocalProfileEditorState = useCallback((
    nextState: ProfileJsonEditorState,
    nextProfileName?: string,
  ): void => {
    markProfileEditorContentEdit();
    applyProfileEditorState(nextState, nextProfileName);
  }, [applyProfileEditorState, markProfileEditorContentEdit]);
  const setEditableProfileName = useCallback((nextProfileName: SetStateAction<string>): void => {
    markProfileEditorContentEdit();
    setProfileName(nextProfileName);
  }, [markProfileEditorContentEdit]);
  // The ref follows every selection synchronously so in-flight responses can compare against it.
  const commitSelectedProfileId = useCallback((nextProfileId: string): void => {
    if (selectedProfileIdRef.current !== nextProfileId) selectionGenerationRef.current += 1;
    selectedProfileIdRef.current = nextProfileId;
    setSelectedProfileId(nextProfileId);
  }, []);
  const selectProfileId = useCallback((nextProfileId: SetStateAction<string>): void => {
    const resolvedProfileId = typeof nextProfileId === "function"
      ? nextProfileId(selectedProfileIdRef.current)
      : nextProfileId;
    profileEditorHasLocalEditsRef.current = false;
    selectionContentVersionRef.current = profileEditorContentVersionRef.current;
    selectionGenerationRef.current += 1;
    selectedProfileIdRef.current = resolvedProfileId;
    setSelectedProfileId(resolvedProfileId);
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const benefitSigunguOptions = useMemo(() => {
    const selectedBenefitSidoCode = SIDO_ADMIN_2025.find((entry) => entry.name === (profileForm.sido ?? ""))?.code ?? "";
    return selectedBenefitSidoCode ? SIGUNGU_BY_SIDO_CODE_2025[selectedBenefitSidoCode] ?? [] : [];
  }, [profileForm.sido]);
  const liveSummary = useMemo(() => buildWorkspaceLiveSummary(profileForm), [profileForm]);
  const profileValidation = useMemo(() => validateProfileForm(profileForm), [profileForm]);
  const beginnerGoalsContext = useMemo(() => beginnerGoalContext(profileForm), [profileForm]);
  const beginnerGoals = useMemo(() => {
    const goals = ensureBeginnerGoals(profileForm.goals, beginnerGoalsContext);
    return {
      emergency: findBeginnerGoal(goals, "emergency", beginnerGoalsContext),
      lumpSum: findBeginnerGoal(goals, "lumpSum", beginnerGoalsContext),
      retirement: findBeginnerGoal(goals, "retirement", beginnerGoalsContext),
    };
  }, [beginnerGoalsContext, profileForm.goals]);
  const beginnerEmergencyMonths = emergencyMonthsFromGoal(beginnerGoals.emergency, beginnerGoalsContext.monthlyExpenses);

  const clearPendingSuggestions = useCallback((): void => {
    const cleared = clearProfileSuggestionState();
    setPendingProfileSave(cleared.pendingProfileSave);
    setPendingSuggestions(cleared.pendingSuggestions);
    setAcceptedSuggestionCodes(cleared.acceptedSuggestionCodes);
  }, []);

  const hydrateSelectedProfileIfNeeded = useCallback((
    profile: PlanningProfileRecord | null,
    requestContentVersion?: number,
  ): boolean => {
    const nextStamp = buildSelectedProfileHydrationStamp(profile);
    if (!profile) {
      lastHydratedProfileStampRef.current = "";
      return false;
    }
    if (!shouldHydrateSelectedProfile(nextStamp, lastHydratedProfileStampRef.current)) {
      return false;
    }
    // Content edits made after the read started win; leave stamp, cache and dirty state untouched.
    if (requestContentVersion !== undefined && hasProfileEditsSinceDispatch({
      dispatchContentVersion: requestContentVersion,
      currentContentVersion: profileEditorContentVersionRef.current,
    })) {
      return false;
    }
    if (shouldSkipSelectedProfileHydrationAfterLocalEdit({
      profileId: profile.id,
      selectedProfileId: selectedProfileIdRef.current,
      lastHydratedProfileStamp: lastHydratedProfileStampRef.current,
      hasLocalEdits: profileEditorHasLocalEditsRef.current,
    })) {
      return false;
    }
    const nextHydration = buildSelectedProfileHydration(profile);
    rememberHydratedProfile(profile);
    applyHydratedProfileEditorState(nextHydration.editorState, nextHydration.profileName);
    setLastNormalizationDisclosure(nextHydration.lastNormalizationDisclosure);
    clearPendingSuggestions();
    lastHydratedProfileStampRef.current = nextStamp;
    profileEditorHasLocalEditsRef.current = false;
    return true;
  }, [applyHydratedProfileEditorState, clearPendingSuggestions]);

  const loadSelectedProfileRecord = useCallback(async (profileId?: string): Promise<void> => {
    const normalizedProfileId = normalizeProfileId(profileId);
    if (!normalizedProfileId) return;
    const requestSelectionGeneration = selectionGenerationRef.current;
    const requestDataEpoch = profileDataEpochRef.current;
    const requestContentVersion = profileEditorContentVersionRef.current;
    // The mount effect and the initial timer can ask for the same selection; send it once.
    const requestKey = `${normalizedProfileId}:${requestSelectionGeneration}:${requestDataEpoch}`;
    if (profileDetailInFlightKeyRef.current === requestKey) return;
    profileDetailInFlightKeyRef.current = requestKey;
    profileDetailRequestSequenceRef.current += 1;
    const requestSequence = profileDetailRequestSequenceRef.current;
    try {
      const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(normalizedProfileId)}`, {
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
      if (!isMountedRef.current) return;
      if (requestSequence !== profileDetailRequestSequenceRef.current) return;
      if (!shouldApplyProfileDetailResponse({
        requestedProfileId: normalizedProfileId,
        currentSelectedProfileId: normalizeProfileId(selectedProfileIdRef.current),
        requestSelectionGeneration,
        currentSelectionGeneration: selectionGenerationRef.current,
        requestDataEpoch,
        currentDataEpoch: profileDataEpochRef.current,
      })) return;
      const parsedPayload = parseApiPayload(locale, res, payload, "프로필을 불러오지 못했습니다.");
      const record = (payload as ApiResponse<PlanningProfileRecord> | null)?.data;
      if (!parsedPayload.ok || !record || record.id !== normalizedProfileId) return;
      hydrateSelectedProfileIfNeeded(record, requestContentVersion);
    } catch {
      // ignore profile detail warmup failures; list refresh will surface blocking errors
    } finally {
      if (requestSequence === profileDetailRequestSequenceRef.current) profileDetailInFlightKeyRef.current = "";
    }
  }, [hydrateSelectedProfileIfNeeded, isMountedRef, locale]);

  const loadProfiles = useCallback(async (nextSelectedId?: string): Promise<void> => {
    profileListRequestSequenceRef.current += 1;
    const requestSequence = profileListRequestSequenceRef.current;
    const requestSelectionGeneration = selectionGenerationRef.current;
    const requestContentVersion = profileEditorContentVersionRef.current;
    // Superseded responses, including failures and finally, must not touch list, selection or loading.
    const isCurrentRequest = () => isMountedRef.current && isLatestProfileListResponse({
      requestSequence,
      latestSequence: profileListRequestSequenceRef.current,
    });
    setLoadingProfiles(true);
    setProfilesLoadError("");
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord[]> | null;
      if (!isCurrentRequest()) return;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setProfiles([]);
        commitSelectedProfileId("");
        setProfilesLoadError(resolveApiErrorMessage(locale, payload?.error, "프로필 목록을 불러오지 못했습니다."));
        return;
      }

      const currentSelectedProfileId = normalizeProfileId(selectedProfileIdRef.current);
      const requestedId = resolveProfileListSelectionRequest({
        nextSelectedId: normalizeProfileId(nextSelectedId),
        currentSelectedProfileId,
        requestSelectionGeneration,
        currentSelectionGeneration: selectionGenerationRef.current,
        editedSinceRequest: hasProfileEditsSinceDispatch({
          dispatchContentVersion: requestContentVersion,
          currentContentVersion: profileEditorContentVersionRef.current,
        }),
      });
      setProfiles(payload.data);
      const pickedId = selectLoadedProfileId(payload.data, requestedId);
      // Moving the selection here (no edits since the request, or the current one is gone)
      // behaves like a user selection: the new profile's stored values replace the editor.
      const selectionMoves = pickedId !== currentSelectedProfileId;
      if (selectionMoves) {
        profileEditorHasLocalEditsRef.current = false;
        selectionContentVersionRef.current = profileEditorContentVersionRef.current;
      }
      commitSelectedProfileId(pickedId);

      const picked = payload.data.find((item) => item.id === pickedId);
      if (picked) {
        hydrateSelectedProfileIfNeeded(picked, selectionMoves ? undefined : requestContentVersion);
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      setProfilesLoadError(error instanceof Error ? error.message : "프로필 목록 조회 중 오류가 발생했습니다.");
      setProfiles([]);
      commitSelectedProfileId("");
    } finally {
      if (isCurrentRequest()) setLoadingProfiles(false);
    }
  }, [commitSelectedProfileId, hydrateSelectedProfileIfNeeded, isMountedRef, locale]);

  useEffect(() => {
    initialProfileLoadSettledRef.current = false;
    const timeoutId = window.setTimeout(() => {
      let preferredProfileId = resolveInitialProfileRequestId(initialSelectedProfileId);
      if (!preferredProfileId) {
        try {
          preferredProfileId = resolveInitialProfileRequestId("", window.localStorage.getItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY));
        } catch {
          preferredProfileId = "";
        }
      }
      if (preferredProfileId) {
        commitSelectedProfileId(preferredProfileId);
        void loadSelectedProfileRecord(preferredProfileId);
      }
      void loadProfiles(preferredProfileId || undefined).finally(() => {
        initialProfileLoadSettledRef.current = true;
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [commitSelectedProfileId, initialSelectedProfileId, loadProfiles, loadSelectedProfileRecord]);

  useEffect(() => {
    if (!initialProfileLoadSettledRef.current) {
      return;
    }
    try {
      if (selectedProfileId) {
        window.localStorage.setItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY, selectedProfileId);
      } else {
        window.localStorage.removeItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [selectedProfileId]);

  useEffect(() => {
    void hydrateSelectedProfileIfNeeded(selectedProfile);
  }, [hydrateSelectedProfileIfNeeded, selectedProfile]);

  useEffect(() => {
    if (!selectedProfileId || selectedProfile) return;
    void loadSelectedProfileRecord(selectedProfileId);
  }, [loadSelectedProfileRecord, selectedProfile, selectedProfileId]);

  function toggleSuggestionCode(code: string, checked: boolean): void {
    setAcceptedSuggestionCodes((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((item) => item !== code);
    });
  }

  function syncProfileJsonFromForm(nextForm: ProfileFormModel): void {
    const nextState = buildProfileJsonEditorState(nextForm, profileName);
    if (profileJson !== nextState.json) {
      setProfileJson(nextState.json);
    }
    setProfileJsonDraft(nextState.jsonDraft);
    setProfileJsonError(nextState.jsonError);
  }

  function applyProfileForm(nextForm: ProfileFormModel): void {
    markProfileEditorContentEdit();
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  function replaceProfileFromJsonText(nextJson: string): void {
    markProfileEditorContentEdit();
    setProfileJsonDraft(nextJson);
    setProfileJsonError("");
  }

  function applyProfileJsonEditorAction(): void {
    const parsed = parseProfileJsonEditorDraft(profileJsonDraft, profileName);
    if (!parsed.ok) {
      setProfileJsonError(parsed.error);
      return;
    }
    applyLocalProfileEditorState(buildProfileJsonEditorState(parsed.form, profileName));
    setLastNormalizationDisclosure(parsed.normalization);
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  async function copyProfileJsonEditorAction(): Promise<void> {
    const result = await copyToClipboard(profileJsonDraft);
    if (!result.ok) {
      pushWorkspaceError(result.message ?? "프로필 JSON 복사에 실패했습니다.");
      return;
    }
    pushWorkspaceNotice("프로필 JSON을 클립보드에 복사했습니다.");
  }

  function updateProfileField<K extends keyof ProfileFormModel>(key: K, value: ProfileFormModel[K]): void {
    applyProfileForm({
      ...profileForm,
      [key]: value,
    });
  }

  function addDebtRow(): void {
    if (!canAddProfileDebtRow(beginnerMode, profileForm.debts.length)) return;
    applyProfileForm({
      ...profileForm,
      debts: [
        ...profileForm.debts,
        {
          id: nextRowId("debt"),
          name: `Debt ${profileForm.debts.length + 1}`,
          balance: 0,
          aprPct: 5,
          monthlyPayment: 0,
          remainingMonths: 36,
          repaymentType: "amortizing",
        },
      ],
    });
  }

  function removeDebtRow(index: number): void {
    if (!canRemoveProfileDebtRow(beginnerMode, profileForm.debts.length)) return;
    applyProfileForm({
      ...profileForm,
      debts: profileForm.debts.filter((_, debtIndex) => debtIndex !== index),
    });
  }

  function updateDebtRow(index: number, nextRow: ProfileFormDebt): void {
    applyProfileForm({
      ...profileForm,
      debts: profileForm.debts.map((row, debtIndex) => (debtIndex === index ? nextRow : row)),
    });
  }

  function addGoalRow(): void {
    applyProfileForm({
      ...profileForm,
      goals: [
        ...profileForm.goals,
        {
          id: nextRowId("goal"),
          name: `목표 ${profileForm.goals.length + 1}`,
          targetAmount: 0,
          currentAmount: 0,
          targetMonth: 24,
          priority: 3,
          minimumMonthlyContribution: 0,
        },
      ],
    });
  }

  function removeGoalRow(index: number): void {
    applyProfileForm({
      ...profileForm,
      goals: profileForm.goals.filter((_, goalIndex) => goalIndex !== index),
    });
  }

  function updateGoalRow(index: number, nextRow: ProfileFormGoal): void {
    applyProfileForm({
      ...profileForm,
      goals: profileForm.goals.map((row, goalIndex) => (goalIndex === index ? nextRow : row)),
    });
  }

  function updateBeginnerGoal(kind: BeginnerGoalKind, patch: Partial<ProfileFormGoal>): void {
    const context = beginnerGoalContext(profileForm);
    const nextGoals = updateBeginnerGoalList(profileForm.goals, kind, context, patch);
    applyProfileForm({
      ...profileForm,
      goals: nextGoals,
    });
  }

  function loadSampleProfileAction(): void {
    applyLocalProfileEditorState(hydrateProfileJsonEditorState(SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME), SAMPLE_PROFILE_V2_KO_NAME);
    clearPendingSuggestions();
    pushWorkspaceNotice("샘플 프로필을 편집 영역에 불러왔습니다. Save를 눌러야 실제 저장됩니다.");
  }

  async function performProfileSave(mode: ProfileSaveMode, profile: ProfileV2 | Record<string, unknown>): Promise<boolean> {
    if (mode === "update" && !selectedProfileId) {
      pushWorkspaceError("수정할 프로필을 먼저 선택하세요.");
      return false;
    }

    const feedback = resolveProfileSaveFeedback(mode, beginnerMode);
    const dispatchSelectionGeneration = selectionGenerationRef.current;
    const dispatchContentVersion = profileEditorContentVersionRef.current;
    const payloadName = resolveProfileSavePayloadName(mode, profileName);
    setSavingProfile(true);
    try {
      const method = mode === "update" ? "PATCH" : "POST";
      const endpoint = mode === "update"
        ? `/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`
        : "/api/planning/v2/profiles";
      const payloadProfile = normalizeDraftWithDisclosure(profile as unknown as FormDraft, profileName);

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          name: payloadName,
          profile: payloadProfile.profile,
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
      const parsedPayload = parseApiPayload(locale, res, payload, feedback.fallbackMessage);
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return false;
      }
      const savedRecord = (payload as ApiResponse<PlanningProfileRecord>).data;
      // Reads started before this write can no longer hydrate over it.
      profileDataEpochRef.current += 1;
      const savedProfileId = savedRecord?.id ?? "";
      const followUp = resolveProfileSaveFollowUp({
        mode,
        savedProfileId,
        selectionChanged: dispatchSelectionGeneration !== selectionGenerationRef.current,
        hasEditsSinceDispatch: hasProfileEditsSinceDispatch({
          dispatchContentVersion,
          currentContentVersion: profileEditorContentVersionRef.current,
        }),
      });

      if (followUp.nextSelectedId) {
        const normalizationFromResponse = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
        setLastNormalizationDisclosure(normalizationFromResponse ?? payloadProfile.normalization);
      }
      if (followUp.clearLocalEdits) profileEditorHasLocalEditsRef.current = false;
      await loadProfiles(followUp.nextSelectedId);
      pushWorkspaceNotice(resolveProfileSaveCompletionNotice({
        mode,
        beginnerMode,
        savedProfileName: savedRecord?.name ?? payloadName,
        savedProfileSelected: Boolean(savedProfileId) && normalizeProfileId(selectedProfileIdRef.current) === savedProfileId,
        hasUnsavedEdits: hasUnsavedProfileEditsAfterSave({
          dispatchContentVersion,
          selectionContentVersion: selectionContentVersionRef.current,
          currentContentVersion: profileEditorContentVersionRef.current,
        }),
      }));
      return true;
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : feedback.errorMessage);
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  function beginProfileSave(mode: ProfileSaveMode): void {
    if (profileValidation.errors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
      return;
    }

    const parsedProfile = toProfileJson(profileForm);
    const suggestions = suggestProfileNormalizations(parsedProfile);
    if (suggestions.length > 0) {
      setPendingProfileSave({ mode, profile: parsedProfile });
      setPendingSuggestions(suggestions);
      setAcceptedSuggestionCodes([]);
      return;
    }
    void performProfileSave(mode, parsedProfile);
  }

  async function applySuggestedProfileSaveAction(): Promise<void> {
    if (!pendingProfileSave) return;
    const normalized = applySuggestions(pendingProfileSave.profile, acceptedSuggestionCodes);
    const saved = await performProfileSave(pendingProfileSave.mode, normalized);
    if (saved) clearPendingSuggestions();
  }

  async function continueProfileSaveWithoutSuggestionsAction(): Promise<void> {
    if (!pendingProfileSave) return;
    const saved = await performProfileSave(pendingProfileSave.mode, pendingProfileSave.profile);
    if (saved) clearPendingSuggestions();
  }

  async function deleteProfileAction(): Promise<void> {
    const dialog = createProfileDeleteDialogState(selectedProfileId);
    if (!dialog) {
      pushWorkspaceError("삭제할 프로필을 먼저 선택하세요.");
      return;
    }
    setProfileDeleteDialog(dialog);
  }

  async function submitDeleteProfileAction(): Promise<void> {
    if (!profileDeleteDialog) return;
    if (!isDeleteProfileConfirmMatched(profileDeleteDialog)) {
      pushWorkspaceError(`삭제 확인 문구가 일치하지 않습니다. (${profileDeleteDialog.expectedConfirm})`);
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(profileDeleteDialog.profileId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ confirmText: profileDeleteDialog.confirmText.trim() })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      const parsedPayload = parseApiPayload(locale, res, payload, "프로필 삭제에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return;
      }

      profileDataEpochRef.current += 1;
      await loadProfiles();
      setProfileDeleteDialog(null);
      pushWorkspaceNotice("프로필을 휴지통으로 이동했습니다.");
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "프로필 삭제 중 오류가 발생했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }

  return {
    profiles,
    selectedProfileId,
    setSelectedProfileId: selectProfileId,
    selectedProfile,
    profileName,
    setProfileName: setEditableProfileName,
    profileJson,
    profileJsonDraft,
    profileJsonError,
    profileForm,
    loadingProfiles,
    profilesLoadError,
    savingProfile,
    pendingProfileSave,
    pendingSuggestions,
    acceptedSuggestionCodes,
    lastNormalizationDisclosure,
    setLastNormalizationDisclosure,
    profileValidation,
    benefitSigunguOptions,
    liveSummary,
    beginnerGoals,
    beginnerEmergencyMonths,
    applyHydratedProfileEditorState,
    applyLocalProfileEditorState,
    markProfileEditorLocalEdit,
    loadProfiles,
    updateProfileField,
    applyProfileForm,
    addDebtRow,
    removeDebtRow,
    updateDebtRow,
    addGoalRow,
    removeGoalRow,
    updateGoalRow,
    updateBeginnerGoal,
    replaceProfileFromJsonText,
    applyProfileJsonEditorAction,
    copyProfileJsonEditorAction,
    loadSampleProfileAction,
    beginProfileSave,
    applySuggestedProfileSaveAction,
    continueProfileSaveWithoutSuggestionsAction,
    deleteProfileAction,
    submitDeleteProfileAction,
    clearPendingSuggestions,
    toggleSuggestionCode,
    setPendingProfileSave,
    setPendingSuggestions,
    setAcceptedSuggestionCodes,
  };
}
