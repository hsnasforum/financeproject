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
  beginnerModeLoaded,
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
  const [profileName, setProfileName] = useState("기본 프로필");
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
    markProfileEditorLocalEdit();
    applyProfileEditorState(nextState, nextProfileName);
  }, [applyProfileEditorState, markProfileEditorLocalEdit]);
  const setEditableProfileName = useCallback((nextProfileName: SetStateAction<string>): void => {
    markProfileEditorLocalEdit();
    setProfileName(nextProfileName);
  }, [markProfileEditorLocalEdit]);
  const selectProfileId = useCallback((nextProfileId: SetStateAction<string>): void => {
    profileEditorHasLocalEditsRef.current = false;
    setSelectedProfileId(nextProfileId);
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);
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

  const hydrateSelectedProfileIfNeeded = useCallback((profile: PlanningProfileRecord | null): boolean => {
    const nextStamp = buildSelectedProfileHydrationStamp(profile);
    if (!profile) {
      lastHydratedProfileStampRef.current = "";
      return false;
    }
    if (!shouldHydrateSelectedProfile(nextStamp, lastHydratedProfileStampRef.current)) {
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
    try {
      const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(normalizedProfileId)}`, {
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
      if (!isMountedRef.current) return;
      const parsedPayload = parseApiPayload(locale, res, payload, "프로필을 불러오지 못했습니다.");
      if (!parsedPayload.ok || !(payload as ApiResponse<PlanningProfileRecord>)?.data) return;
      hydrateSelectedProfileIfNeeded((payload as ApiResponse<PlanningProfileRecord>).data ?? null);
    } catch {
      // ignore profile detail warmup failures; list refresh will surface blocking errors
    }
  }, [hydrateSelectedProfileIfNeeded, isMountedRef, locale]);

  const loadProfiles = useCallback(async (nextSelectedId?: string): Promise<void> => {
    setLoadingProfiles(true);
    setProfilesLoadError("");
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord[]> | null;
      if (!isMountedRef.current) return;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setProfiles([]);
        setSelectedProfileId("");
        setProfilesLoadError(resolveApiErrorMessage(locale, payload?.error, "프로필 목록을 불러오지 못했습니다."));
        return;
      }

      const requestedId = normalizeProfileId(nextSelectedId) || normalizeProfileId(selectedProfileIdRef.current);
      setProfiles(payload.data);
      const pickedId = selectLoadedProfileId(payload.data, requestedId);
      setSelectedProfileId(pickedId);

      const picked = payload.data.find((item) => item.id === pickedId);
      if (picked) {
        hydrateSelectedProfileIfNeeded(picked);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setProfilesLoadError(error instanceof Error ? error.message : "프로필 목록 조회 중 오류가 발생했습니다.");
      setProfiles([]);
      setSelectedProfileId("");
    } finally {
      if (!isMountedRef.current) return;
      setLoadingProfiles(false);
    }
  }, [hydrateSelectedProfileIfNeeded, isMountedRef, locale]);

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
        setSelectedProfileId(preferredProfileId);
        void loadSelectedProfileRecord(preferredProfileId);
      }
      void loadProfiles(preferredProfileId || undefined).finally(() => {
        initialProfileLoadSettledRef.current = true;
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialSelectedProfileId, loadProfiles, loadSelectedProfileRecord]);

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

  useEffect(() => {
    if (!beginnerModeLoaded || !beginnerMode) return;
    const context = beginnerGoalContext(profileForm);
    const nextGoals = ensureBeginnerGoals(profileForm.goals, context);
    if (nextGoals.length === profileForm.goals.length) return;

    const nextForm = {
      ...profileForm,
      goals: nextGoals,
    };
    const localEditVersion = profileEditorLocalEditVersionRef.current;
    const timeoutId = window.setTimeout(() => {
      if (profileEditorLocalEditVersionRef.current !== localEditVersion) return;
      applyLocalProfileEditorState(buildProfileJsonEditorState(nextForm, profileName));
      clearPendingSuggestions();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [applyLocalProfileEditorState, beginnerMode, beginnerModeLoaded, clearPendingSuggestions, profileForm, profileName]);

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
    markProfileEditorLocalEdit();
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  function replaceProfileFromJsonText(nextJson: string): void {
    markProfileEditorLocalEdit();
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
          name: resolveProfileSavePayloadName(mode, profileName),
          profile: payloadProfile.profile,
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
      const parsedPayload = parseApiPayload(locale, res, payload, feedback.fallbackMessage);
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return false;
      }
      const typedPayload = payload as ApiResponse<PlanningProfileRecord>;

      const normalizationFromResponse = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
      setLastNormalizationDisclosure(normalizationFromResponse ?? payloadProfile.normalization);

      profileEditorHasLocalEditsRef.current = false;
      await loadProfiles(typedPayload.data?.id);
      pushWorkspaceNotice(feedback.successMessage);
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
