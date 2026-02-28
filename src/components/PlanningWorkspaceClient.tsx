"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import PlanningMiniCharts from "@/app/planning/_components/PlanningMiniCharts";
import { buildConfirmString } from "@/lib/ops/confirm";
import { type PlanningFeatureFlags } from "@/lib/planning/config";
import { formatDate, formatKrw } from "@/lib/planning/i18n/format";
import { t, type Locale } from "@/lib/planning/i18n";
import { SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME } from "@/lib/planning/samples/profile.sample.ko";
import { type PlanningProfileRecord, type PlanningRunRecord } from "@/lib/planning/store/types";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { buildPlanningChartPoints } from "@/lib/planning/v2/chartPoints";
import { applySuggestions } from "@/lib/planning/v2/applySuggestions";
import {
  suggestProfileNormalizations,
  type NormalizationSuggestion,
} from "@/lib/planning/v2/normalizeProfile";
import { type ProfileV2 } from "@/lib/planning/v2/types";

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

type HealthWarning = {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
  data?: Record<string, unknown>;
};

type HealthSummary = {
  warningsCount: number;
  criticalCount: number;
  warningCodes: string[];
  snapshotStaleDays?: number;
  flags?: {
    snapshotMissing?: boolean;
    snapshotStaleDays?: number;
    optimisticReturn?: boolean;
    riskMismatch?: boolean;
  };
};

type PlanningMeta = {
  generatedAt?: string;
  snapshot?: {
    id?: string;
    asOf?: string;
    fetchedAt?: string;
    missing?: boolean;
    warningsCount?: number;
    sourcesCount?: number;
  };
  health?: HealthSummary;
  cache?: {
    hit?: boolean;
    keyPrefix?: string;
  };
};

type CombinedRunResult = {
  meta?: PlanningMeta;
  simulate?: Record<string, unknown>;
  scenarios?: Record<string, unknown>;
  monteCarlo?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  debtStrategy?: Record<string, unknown>;
  partialErrors: string[];
  mcBudgetGuide?: string;
};

type TabId = "summary" | "simulate" | "scenarios" | "monteCarlo" | "actions" | "debt";

const ALLOCATION_POLICIES: Array<{ id: AllocationPolicyId; label: string }> = [
  { id: "balanced", label: "Balanced (기본)" },
  { id: "safety", label: "Safety-first" },
  { id: "growth", label: "Growth-first" },
];

type PlanningWorkspaceClientProps = {
  featureFlags: PlanningFeatureFlags;
  locale: Locale;
};

type ProfileSaveMode = "create" | "duplicate" | "update";

const DEFAULT_PROFILE_JSON = `{
  "monthlyIncomeNet": 4200000,
  "monthlyEssentialExpenses": 1600000,
  "monthlyDiscretionaryExpenses": 700000,
  "liquidAssets": 1200000,
  "investmentAssets": 3500000,
  "debts": [
    {
      "id": "loan-1",
      "name": "Loan 1",
      "balance": 12000000,
      "minimumPayment": 360000,
      "apr": 0.075,
      "remainingMonths": 48,
      "repaymentType": "amortizing"
    }
  ],
  "goals": []
}`;

const DEFAULT_ASSUMPTIONS_OVERRIDE = `{
  "inflation": 2.0,
  "expectedReturn": 5.0
}`;

const DEFAULT_DEBT_OFFERS_JSON = `[
  { "liabilityId": "loan-1", "newAprPct": 5.4, "feeKrw": 90000, "title": "Refi A" }
]`;

const DEFAULT_OPTIMIZER_CONSTRAINTS_JSON = `{
  "minEmergencyMonths": 3,
  "maxDebtServiceRatio": 0.6
}`;

const DEFAULT_OPTIMIZER_KNOBS_JSON = `{
  "maxMonthlyContributionKrw": 300000,
  "allowExtraDebtPayment": true,
  "allowInvestContribution": true
}`;

const DEFAULT_OPTIMIZER_SEARCH_JSON = `{
  "candidates": 20,
  "keepTop": 5,
  "seed": 12345
}`;

const PLANNING_ONBOARDING_DISMISSED_KEY = "planning:v2:onboarding:dismissed";

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

function parseJsonText<T = unknown>(label: string, text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    window.alert(`${label} JSON 파싱에 실패했습니다.`);
    return null;
  }
}

function formatDateTime(locale: Locale, value?: string): string {
  return formatDate(locale, value);
}

function formatNumber(locale: Locale, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

function parseHorizonMonths(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1200) {
    window.alert("horizonMonths는 1~1200 범위 숫자여야 합니다.");
    return null;
  }
  return parsed;
}

function parseApiPayload<T>(
  locale: Locale,
  res: Response,
  payload: ApiResponse<T> | null,
  fallbackMessage: string,
): payload is ApiResponse<T> {
  if (!payload || typeof payload !== "object") {
    window.alert(`${fallbackMessage}: 응답 파싱 실패`);
    return false;
  }
  if (!res.ok || !payload.ok) {
    window.alert(resolveApiErrorMessage(locale, payload.error, fallbackMessage));
    return false;
  }
  return true;
}

function pickTimelinePoints(rows: unknown): Array<{ monthIndex: number; row: Record<string, unknown> }> {
  const list = asArray(rows).map((item) => asRecord(item));
  if (list.length === 0) return [];
  const candidates = [0, 12, list.length - 1];
  const seen = new Set<number>();
  const out: Array<{ monthIndex: number; row: Record<string, unknown> }> = [];
  for (const index of candidates) {
    if (index < 0 || index >= list.length || seen.has(index)) continue;
    seen.add(index);
    out.push({ monthIndex: index, row: list[index] });
  }
  return out;
}

export function PlanningWorkspaceClient({ featureFlags, locale }: PlanningWorkspaceClientProps) {
  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileName, setProfileName] = useState("기본 프로필");
  const [profileJson, setProfileJson] = useState(DEFAULT_PROFILE_JSON);

  const [snapshotIdInput, setSnapshotIdInput] = useState("");
  const [policyId, setPolicyId] = useState<AllocationPolicyId>("balanced");
  const [horizonMonths, setHorizonMonths] = useState("360");
  const [runTitle, setRunTitle] = useState("기본 실행");
  const [assumptionsOverrideJson, setAssumptionsOverrideJson] = useState(DEFAULT_ASSUMPTIONS_OVERRIDE);

  const [runScenariosEnabled, setRunScenariosEnabled] = useState(true);
  const [runMonteCarloEnabled, setRunMonteCarloEnabled] = useState(false);
  const [runActionsEnabled, setRunActionsEnabled] = useState(true);
  const [runDebtEnabled, setRunDebtEnabled] = useState(true);
  const [runOptimizeEnabled, setRunOptimizeEnabled] = useState(false);

  const [includeProducts, setIncludeProducts] = useState(false);
  const [maxCandidatesPerAction, setMaxCandidatesPerAction] = useState("5");

  const [monteCarloPaths, setMonteCarloPaths] = useState("2000");
  const [monteCarloSeed, setMonteCarloSeed] = useState("12345");

  const [debtExtraPaymentKrw, setDebtExtraPaymentKrw] = useState("0");
  const [debtOffersJson, setDebtOffersJson] = useState(DEFAULT_DEBT_OFFERS_JSON);
  const [optimizerConstraintsJson, setOptimizerConstraintsJson] = useState(DEFAULT_OPTIMIZER_CONSTRAINTS_JSON);
  const [optimizerKnobsJson, setOptimizerKnobsJson] = useState(DEFAULT_OPTIMIZER_KNOBS_JSON);
  const [optimizerSearchJson, setOptimizerSearchJson] = useState(DEFAULT_OPTIMIZER_SEARCH_JSON);

  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runningOptimize, setRunningOptimize] = useState(false);

  const [runResult, setRunResult] = useState<CombinedRunResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<{
    meta?: PlanningMeta;
    candidates: Record<string, unknown>[];
  } | null>(null);
  const [savedRun, setSavedRun] = useState<PlanningRunRecord | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const [healthAck, setHealthAck] = useState(false);
  const [pendingProfileSave, setPendingProfileSave] = useState<{
    mode: ProfileSaveMode;
    profile: ProfileV2;
  } | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<NormalizationSuggestion[]>([]);
  const [acceptedSuggestionCodes, setAcceptedSuggestionCodes] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDismissChecked, setOnboardingDismissChecked] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const healthSummary = useMemo(() => {
    return runResult?.meta?.health ?? null;
  }, [runResult?.meta?.health]);

  const healthWarnings = useMemo(() => {
    return asArray(runResult?.simulate && asRecord(runResult.simulate).healthWarnings)
      .map((entry) => asRecord(entry) as HealthWarning);
  }, [runResult?.simulate]);

  const hasCriticalHealth = (healthSummary?.criticalCount ?? 0) > 0;
  const saveBlockedByHealth = hasCriticalHealth && !healthAck;
  const monteCarloServerDisabled = !featureFlags.monteCarloEnabled;
  const includeProductsServerDisabled = !featureFlags.includeProductsEnabled;
  const optimizerServerDisabled = !featureFlags.optimizerEnabled;

  useEffect(() => {
    if (!hasCriticalHealth) {
      setHealthAck(false);
    }
  }, [hasCriticalHealth]);

  useEffect(() => {
    if (saveBlockedByHealth) {
      setRunMonteCarloEnabled(false);
      setRunActionsEnabled(false);
    }
  }, [saveBlockedByHealth]);

  useEffect(() => {
    if (monteCarloServerDisabled) {
      setRunMonteCarloEnabled(false);
    }
  }, [monteCarloServerDisabled]);

  useEffect(() => {
    if (includeProductsServerDisabled) {
      setIncludeProducts(false);
    }
  }, [includeProductsServerDisabled]);

  useEffect(() => {
    if (optimizerServerDisabled) {
      setRunOptimizeEnabled(false);
    }
  }, [optimizerServerDisabled]);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(PLANNING_ONBOARDING_DISMISSED_KEY) === "1";
      setShowOnboarding(!dismissed);
    } catch {
      setShowOnboarding(true);
    }
  }, []);

  async function loadProfiles(nextSelectedId?: string): Promise<void> {
    setLoadingProfiles(true);
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setProfiles([]);
        setSelectedProfileId("");
        return;
      }

      setProfiles(payload.data);
      const fallbackId = payload.data[0]?.id ?? "";
      const pickedId = nextSelectedId && payload.data.some((item) => item.id === nextSelectedId)
        ? nextSelectedId
        : fallbackId;
      setSelectedProfileId(pickedId);

      const picked = payload.data.find((item) => item.id === pickedId);
      if (picked) {
        setProfileName(picked.name);
        setProfileJson(pretty(picked.profile));
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "프로필 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  useEffect(() => {
    if (!selectedProfile) return;
    setProfileName(selectedProfile.name);
    setProfileJson(pretty(selectedProfile.profile));
    clearPendingSuggestions();
  }, [selectedProfile]);

  function clearPendingSuggestions(): void {
    setPendingProfileSave(null);
    setPendingSuggestions([]);
    setAcceptedSuggestionCodes([]);
  }

  function toggleSuggestionCode(code: string, checked: boolean): void {
    setAcceptedSuggestionCodes((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((item) => item !== code);
    });
  }

  function closeOnboardingCard(): void {
    if (onboardingDismissChecked) {
      try {
        window.localStorage.setItem(PLANNING_ONBOARDING_DISMISSED_KEY, "1");
      } catch {
        // ignore localStorage failures in restricted environments
      }
    }
    setShowOnboarding(false);
  }

  function loadSampleProfileAction(): void {
    setProfileName(SAMPLE_PROFILE_V2_KO_NAME);
    setProfileJson(pretty(SAMPLE_PROFILE_V2_KO));
    clearPendingSuggestions();
    window.alert("샘플 프로필을 편집 영역에 불러왔습니다. Save를 눌러야 실제 저장됩니다.");
  }

  async function performProfileSave(mode: ProfileSaveMode, profile: ProfileV2): Promise<boolean> {
    if (mode === "update" && !selectedProfileId) {
      window.alert("수정할 프로필을 먼저 선택하세요.");
      return false;
    }

    setSavingProfile(true);
    try {
      const method = mode === "update" ? "PATCH" : "POST";
      const endpoint = mode === "update"
        ? `/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`
        : "/api/planning/v2/profiles";
      const fallbackMessage = mode === "create"
        ? "프로필 생성에 실패했습니다."
        : mode === "duplicate"
          ? "프로필 복제에 실패했습니다."
          : "프로필 수정에 실패했습니다.";
      const successMessage = mode === "create"
        ? "프로필을 저장했습니다."
        : mode === "duplicate"
          ? "프로필을 복제했습니다."
          : "프로필을 수정했습니다.";
      const payloadName = mode === "duplicate" ? `${profileName || "프로필"} (copy)` : profileName;

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: payloadName,
          profile,
        }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
      if (!parseApiPayload(locale, res, payload, fallbackMessage)) return false;

      await loadProfiles(payload.data?.id);
      window.alert(successMessage);
      return true;
    } catch (error) {
      const message = mode === "create"
        ? "프로필 생성 중 오류가 발생했습니다."
        : mode === "duplicate"
          ? "프로필 복제 중 오류가 발생했습니다."
          : "프로필 수정 중 오류가 발생했습니다.";
      window.alert(error instanceof Error ? error.message : message);
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  function beginProfileSave(mode: ProfileSaveMode): void {
    const parsedProfile = parseJsonText<ProfileV2>("프로필", profileJson);
    if (!parsedProfile) return;

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
    if (!selectedProfileId) {
      window.alert("삭제할 프로필을 먼저 선택하세요.");
      return;
    }
    const expectedConfirm = buildConfirmString("DELETE profile", selectedProfileId);
    const confirmText = window.prompt(
      `삭제 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    setSavingProfile(true);
    try {
      const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmText }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!parseApiPayload(locale, res, payload, "프로필 삭제에 실패했습니다.")) return;

      await loadProfiles();
      window.alert("프로필을 휴지통으로 이동했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "프로필 삭제 중 오류가 발생했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }

  function parseCoreInputs(): {
    profile: Record<string, unknown>;
    assumptions: Record<string, unknown>;
    horizon: number;
    policyId: AllocationPolicyId;
    snapshotId?: string;
  } | null {
    const profile = parseJsonText<Record<string, unknown>>("프로필", profileJson);
    if (!profile) return null;
    const assumptions = parseJsonText<Record<string, unknown>>("가정 override", assumptionsOverrideJson);
    if (!assumptions) return null;

    const horizon = parseHorizonMonths(horizonMonths);
    if (!horizon) return null;

    const snapshotId = snapshotIdInput.trim() || undefined;

    return {
      profile,
      assumptions,
      horizon,
      policyId,
      ...(snapshotId ? { snapshotId } : {}),
    };
  }

  function parseRunInputs(): {
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
  } | null {
    const core = parseCoreInputs();
    if (!core) return null;

    if (runMonteCarloEnabled && monteCarloServerDisabled) {
      window.alert("서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.");
      return null;
    }
    if (runActionsEnabled && includeProducts && includeProductsServerDisabled) {
      window.alert("서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.");
      return null;
    }

    const paths = Number.parseInt(monteCarloPaths, 10);
    const seed = Number.parseInt(monteCarloSeed, 10);
    if (!Number.isFinite(paths) || paths < 1 || paths > 20000) {
      window.alert("Monte Carlo paths는 1~20000 범위여야 합니다.");
      return null;
    }
    if (!Number.isFinite(seed)) {
      window.alert("Monte Carlo seed는 숫자여야 합니다.");
      return null;
    }

    const maxCandidates = Number.parseInt(maxCandidatesPerAction, 10);
    if (!Number.isFinite(maxCandidates) || maxCandidates < 1 || maxCandidates > 20) {
      window.alert("maxCandidatesPerAction은 1~20 범위여야 합니다.");
      return null;
    }

    const extraPayment = Number.parseInt(debtExtraPaymentKrw, 10);
    if (!Number.isFinite(extraPayment) || extraPayment < 0) {
      window.alert("debt extraPaymentKrw는 0 이상의 숫자여야 합니다.");
      return null;
    }

    const offers = parseJsonText<unknown[]>("Debt offers", debtOffersJson);
    if (!offers) return null;

    return {
      ...core,
      monteCarlo: { paths, seed },
      actions: {
        includeProducts,
        maxCandidatesPerAction: maxCandidates,
      },
      debt: {
        offers,
        options: {
          ...(extraPayment > 0 ? { extraPaymentKrw: extraPayment } : {}),
        },
      },
    };
  }

  async function copyStrategyAction(strategy: unknown): Promise<void> {
    try {
      if (!navigator?.clipboard?.writeText) {
        window.alert("클립보드 복사를 지원하지 않는 환경입니다.");
        return;
      }
      await navigator.clipboard.writeText(pretty(strategy));
      window.alert("후보 전략 값을 클립보드에 복사했습니다.");
    } catch {
      window.alert("전략 값 복사에 실패했습니다.");
    }
  }

  async function runOptimizeAction(): Promise<void> {
    const core = parseCoreInputs();
    if (!core) return;
    if (optimizerServerDisabled) {
      window.alert("서버 설정으로 Optimizer 기능이 비활성화되어 있습니다.");
      return;
    }

    const constraints = parseJsonText<Record<string, unknown>>("Optimizer constraints", optimizerConstraintsJson);
    if (!constraints) return;
    const knobs = parseJsonText<Record<string, unknown>>("Optimizer knobs", optimizerKnobsJson);
    if (!knobs) return;
    const search = parseJsonText<Record<string, unknown>>("Optimizer search", optimizerSearchJson);
    if (!search) return;

    setRunningOptimize(true);
    try {
      const res = await fetch("/api/planning/v2/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: core.profile,
          horizonMonths: core.horizon,
          assumptions: core.assumptions,
          ...(core.snapshotId ? { snapshotId: core.snapshotId } : {}),
          constraints,
          knobs,
          search,
        }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
      if (!parseApiPayload(locale, res, payload, "Optimizer 실행에 실패했습니다.")) return;

      const rows = asArray(asRecord(payload.data).candidates).map((entry) => asRecord(entry));
      setOptimizeResult({
        meta: asRecord(payload.meta) as PlanningMeta,
        candidates: rows,
      });
      window.alert(`Optimizer 후보 ${rows.length}개를 생성했습니다.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Optimizer 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningOptimize(false);
    }
  }

  async function runPlanAction(): Promise<void> {
    const parsed = parseRunInputs();
    if (!parsed) return;

    setRunning(true);
    const nextErrors: string[] = [];
    const nextResult: CombinedRunResult = {
      ...runResult,
      partialErrors: [],
      mcBudgetGuide: undefined,
    };

    try {
      const basePayload: Record<string, unknown> = {
        profile: parsed.profile,
        horizonMonths: parsed.horizon,
        assumptions: parsed.assumptions,
        policyId: parsed.policyId,
        ...(parsed.snapshotId ? { snapshotId: parsed.snapshotId } : {}),
      };

      const simulateRes = await fetch("/api/planning/v2/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload),
      });
      const simulatePayload = (await simulateRes.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
      if (!parseApiPayload(locale, simulateRes, simulatePayload, "simulate 실행에 실패했습니다.")) return;

      nextResult.meta = asRecord(simulatePayload.meta) as PlanningMeta;
      nextResult.simulate = asRecord(simulatePayload.data);

      const runHeavyBlocked = ((asRecord(simulatePayload.meta).health as HealthSummary | undefined)?.criticalCount ?? 0) > 0 && !healthAck;
      if (runHeavyBlocked) {
        window.alert("치명 경고(critical) 확인 전에는 Actions/Monte Carlo를 실행하지 않습니다.");
      }

      if (runScenariosEnabled) {
        const scenariosRes = await fetch("/api/planning/v2/scenarios", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(basePayload),
        });
        const scenariosPayload = (await scenariosRes.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
        if (!scenariosRes.ok || !scenariosPayload?.ok) {
          const reason = resolveApiErrorMessage(locale, scenariosPayload?.error, "시나리오 계산 중 오류가 발생했습니다.");
          const msg = `시나리오 계산 실패(원인: ${reason}). 기본 결과는 유지됩니다.`;
          nextErrors.push(msg);
          window.alert(msg);
        } else {
          nextResult.scenarios = asRecord(scenariosPayload.data);
        }
      } else {
        nextResult.scenarios = undefined;
      }

      if (runMonteCarloEnabled && !runHeavyBlocked) {
        const monteRes = await fetch("/api/planning/v2/monte-carlo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            monteCarlo: parsed.monteCarlo,
          }),
        });
        const montePayload = (await monteRes.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
        if (!monteRes.ok || !montePayload?.ok) {
          if (montePayload?.error?.code === "BUDGET_EXCEEDED") {
            nextResult.mcBudgetGuide = "요청 계산량이 예산을 초과했습니다. paths 또는 horizonMonths를 낮춰 다시 시도하세요.";
          }
          const reason = resolveApiErrorMessage(locale, montePayload?.error, "Monte Carlo 계산 중 오류가 발생했습니다.");
          const msg = `Monte Carlo 계산 실패(원인: ${reason}). 기본 결과는 유지됩니다.`;
          nextErrors.push(msg);
          window.alert(msg);
        } else {
          nextResult.monteCarlo = asRecord(montePayload.data);
        }
      } else if (!runMonteCarloEnabled) {
        nextResult.monteCarlo = undefined;
      }

      if (runActionsEnabled && !runHeavyBlocked) {
        const actionsRes = await fetch("/api/planning/v2/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            includeProducts: parsed.actions.includeProducts,
            maxCandidatesPerAction: parsed.actions.maxCandidatesPerAction,
          }),
        });
        const actionsPayload = (await actionsRes.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
        if (!actionsRes.ok || !actionsPayload?.ok) {
          const reason = resolveApiErrorMessage(locale, actionsPayload?.error, "Action 생성 중 오류가 발생했습니다.");
          const msg = `Action 생성 실패(원인: ${reason}). 기본 결과는 유지됩니다.`;
          nextErrors.push(msg);
          window.alert(msg);
        } else {
          nextResult.actions = asRecord(actionsPayload.data);
        }
      } else if (!runActionsEnabled) {
        nextResult.actions = undefined;
      }

      if (runDebtEnabled) {
        const debtRes = await fetch("/api/planning/v2/debt-strategy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: parsed.profile,
            offers: parsed.debt.offers,
            options: parsed.debt.options,
          }),
        });
        const debtPayload = (await debtRes.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
        if (!debtRes.ok || !debtPayload?.ok) {
          const reason = resolveApiErrorMessage(locale, debtPayload?.error, "부채 전략 계산 중 오류가 발생했습니다.");
          const msg = `부채 전략 계산 실패(원인: ${reason}). 기본 결과는 유지됩니다.`;
          nextErrors.push(msg);
          window.alert(msg);
        } else {
          nextResult.debtStrategy = asRecord(debtPayload.data);
        }
      } else {
        nextResult.debtStrategy = undefined;
      }

      nextResult.partialErrors = nextErrors;
      setRunResult(nextResult);
      setActiveTab("summary");
      window.alert(nextErrors.length > 0 ? "일부 단계가 실패했지만 실행 결과를 업데이트했습니다." : "Run plan 실행을 완료했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Run plan 실행 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function syncProfileIfNeeded(): Promise<boolean> {
    if (!selectedProfileId) {
      window.alert("저장할 프로필을 먼저 선택하세요.");
      return false;
    }

    const parsedProfile = parseJsonText<ProfileV2>("프로필", profileJson);
    if (!parsedProfile) return false;

    const suggestions = suggestProfileNormalizations(parsedProfile);
    if (suggestions.length > 0) {
      setPendingProfileSave({ mode: "update", profile: parsedProfile });
      setPendingSuggestions(suggestions);
      setAcceptedSuggestionCodes([]);
      window.alert("프로필 저장 전 정규화 제안을 먼저 확인해주세요.");
      return false;
    }

    const before = pretty(selectedProfile?.profile ?? {});
    const after = pretty(parsedProfile);
    const dirty = before !== after || (selectedProfile?.name ?? "") !== profileName;
    if (!dirty) return true;

    const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: profileName,
        profile: parsedProfile,
      }),
    });
    const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
    if (!parseApiPayload(locale, res, payload, "Run 저장 전 프로필 동기화에 실패했습니다.")) {
      return false;
    }

    await loadProfiles(selectedProfileId);
    return true;
  }

  async function saveRunAction(): Promise<void> {
    if (!runResult?.simulate) {
      window.alert("먼저 Run plan을 실행하세요.");
      return;
    }
    if (saveBlockedByHealth) {
      window.alert("치명 경고(critical) 확인 체크 후 저장할 수 있습니다.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;

    setSavingRun(true);
    try {
      const synced = await syncProfileIfNeeded();
      if (!synced) return;

      const runInput: Record<string, unknown> = {
        horizonMonths: parsed.horizon,
        policyId: parsed.policyId,
        assumptionsOverride: parsed.assumptions,
        runScenarios: runScenariosEnabled,
        getActions: runActionsEnabled,
        analyzeDebt: runDebtEnabled,
        includeProducts: runActionsEnabled ? parsed.actions.includeProducts : false,
        ...(parsed.snapshotId ? { snapshotId: parsed.snapshotId } : {}),
        ...(runMonteCarloEnabled ? { monteCarlo: parsed.monteCarlo } : {}),
        ...(runDebtEnabled ? {
          debtStrategy: {
            offers: parsed.debt.offers,
            options: parsed.debt.options,
          },
        } : {}),
      };

      const res = await fetch("/api/planning/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfileId,
          title: runTitle,
          input: runInput,
        }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!parseApiPayload(locale, res, payload, "run 저장에 실패했습니다.")) return;

      setSavedRun(payload.data ?? null);
      window.alert("run 저장을 완료했습니다. /planning/runs에서 비교할 수 있습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "run 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingRun(false);
    }
  }

  const simulateRow = asRecord(runResult?.simulate);
  const simulateTimeline = asArray(simulateRow.timeline);
  const keyTimelinePoints = asArray(simulateRow.keyTimelinePoints).length > 0
    ? asArray(simulateRow.keyTimelinePoints).map((entry) => {
      const row = asRecord(entry);
      const monthIndex = typeof row.monthIndex === "number" && Number.isFinite(row.monthIndex)
        ? row.monthIndex
        : 0;
      return {
        monthIndex,
        row: asRecord(row.row),
      };
    })
    : pickTimelinePoints(simulateTimeline);
  const chartPoints = buildPlanningChartPoints({
    timeline: simulateTimeline,
    keyTimelinePoints,
  });
  const chartMode: "full" | "key" | "none" = simulateTimeline.length > 3
    ? "full"
    : chartPoints.length > 0
      ? "key"
      : "none";
  const simulateWarnings = asArray(simulateRow.warnings);
  const simulateGoals = asArray(simulateRow.goalStatus);

  const scenariosRow = asRecord(runResult?.scenarios);
  const scenariosBase = asRecord(asRecord(scenariosRow.data).base);
  const scenariosList = asArray(asRecord(scenariosRow.data).scenarios);

  const monteRow = asRecord(runResult?.monteCarlo);
  const actionsRow = asRecord(runResult?.actions);
  const actionsList = asArray(asRecord(actionsRow).actions);

  const debtRow = asRecord(runResult?.debtStrategy);
  const debtData = asRecord(debtRow);
  const optimizeCandidates = optimizeResult?.candidates ?? [];

  const disabledReason = saveBlockedByHealth
    ? (
      healthWarnings.some((warning) => warning.code === "SNAPSHOT_VERY_STALE")
        ? "치명 경고(critical) 확인이 필요합니다. 스냅샷이 매우 오래되었습니다. /ops/assumptions에서 동기화를 권장합니다."
        : "치명 경고(critical) 확인이 필요합니다. 확인 전에는 Save run 및 고비용 액션이 제한됩니다."
    )
    : "";

  const tabs: Array<{ id: TabId; label: string; visible: boolean }> = [
    { id: "summary", label: "Summary", visible: true },
    { id: "simulate", label: "Simulate", visible: Boolean(runResult?.simulate) },
    { id: "scenarios", label: "Scenarios", visible: Boolean(runResult?.scenarios) },
    { id: "monteCarlo", label: "Monte Carlo", visible: Boolean(runResult?.monteCarlo) },
    { id: "actions", label: "Actions", visible: Boolean(runResult?.actions) },
    { id: "debt", label: "Debt", visible: Boolean(runResult?.debtStrategy) },
  ];

  return (
    <PageShell>
      <PageHeader
        title={t(locale, "PLANNING_TITLE")}
        description={t(locale, "PLANNING_DESC")}
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href="/planning/trash">휴지통</Link>
            <Link className="font-semibold text-emerald-700" href="/planning/runs">실행 이력 보기</Link>
          </div>
        )}
      />

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">{t(locale, "DISCLAIMER_TITLE")}</p>
        <p className="mt-1 text-xs text-amber-800">{t(locale, "DISCLAIMER_BODY")}</p>
      </Card>

      {showOnboarding ? (
        <Card className="mb-6 border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">
          <h2 className="text-sm font-semibold">처음 시작 튜토리얼 (3단계)</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>프로필을 입력합니다: 자산/부채/지출 기본값부터 채우세요.</li>
            <li>스냅샷 최신성을 확인합니다: 필요하면 `/ops/assumptions`에서 동기화하세요.</li>
            <li>`Run plan` 실행 후 `Save run`으로 저장하고 `/planning/runs`에서 비교하세요.</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                checked={onboardingDismissChecked}
                onChange={(event) => setOnboardingDismissChecked(event.target.checked)}
                type="checkbox"
              />
              <span>다시 보지 않기</span>
            </label>
            <Button onClick={closeOnboardingCard} size="sm" variant="outline">닫기</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Profile Picker</h2>

          <label className="block text-xs font-semibold text-slate-600">
            프로필 선택
            <select
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              {profiles.length === 0 ? <option value="">저장된 프로필 없음</option> : null}
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            프로필 이름
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            프로필 JSON (Advanced)
            <textarea
              className="mt-1 min-h-[260px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
              value={profileJson}
              onChange={(event) => {
                setProfileJson(event.target.value);
                if (pendingSuggestions.length > 0) clearPendingSuggestions();
              }}
            />
          </label>

          {pendingSuggestions.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">입력 정규화 제안 ({pendingSuggestions.length})</p>
              <p className="text-amber-800">선택한 항목만 반영해 저장합니다. 선택하지 않으면 원본 그대로 저장됩니다.</p>
              <div className="space-y-2">
                {pendingSuggestions.map((suggestion) => (
                  <label className="flex items-start gap-2" key={suggestion.code}>
                    <input
                      checked={acceptedSuggestionCodes.includes(suggestion.code)}
                      onChange={(event) => toggleSuggestionCode(suggestion.code, event.target.checked)}
                      type="checkbox"
                    />
                    <span>[{suggestion.severity}] {suggestion.message}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void applySuggestedProfileSaveAction()} size="sm" variant="primary">선택 적용 후 저장</Button>
                <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void continueProfileSaveWithoutSuggestionsAction()} size="sm" variant="outline">변경 없이 저장</Button>
                <Button disabled={savingProfile} onClick={() => clearPendingSuggestions()} size="sm" variant="ghost">취소</Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={savingProfile} onClick={() => beginProfileSave("create")} variant="primary">New</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("duplicate")} variant="outline">Duplicate</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("update")} variant="outline">Save</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => void deleteProfileAction()} variant="ghost">Delete</Button>
            <Button disabled={loadingProfiles} onClick={() => void loadProfiles(selectedProfileId)} variant="ghost">목록 새로고침</Button>
            <Button disabled={savingProfile} onClick={loadSampleProfileAction} variant="ghost">Load sample profile</Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Run Options</h2>

          <label className="block text-xs font-semibold text-slate-600">
            Snapshot ID (빈 값이면 latest)
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={snapshotIdInput}
              onChange={(event) => setSnapshotIdInput(event.target.value)}
              placeholder="ex) 2026-02-28_2026-02-28-12-00-00"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Allocation Policy
            <select
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={policyId}
              onChange={(event) => setPolicyId(event.target.value as AllocationPolicyId)}
            >
              {ALLOCATION_POLICIES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Run 제목
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={runTitle}
              onChange={(event) => setRunTitle(event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Horizon (months)
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={horizonMonths}
              onChange={(event) => setHorizonMonths(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setHorizonMonths("120")}>120</Button>
            <Button size="sm" variant="outline" onClick={() => setHorizonMonths("360")}>360</Button>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            Assumptions Override JSON
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
              value={assumptionsOverrideJson}
              onChange={(event) => setAssumptionsOverrideJson(event.target.value)}
            />
          </label>

          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2 text-slate-700">
              <input checked={runScenariosEnabled} onChange={(event) => setRunScenariosEnabled(event.target.checked)} type="checkbox" />
              Run scenarios
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input checked={runMonteCarloEnabled} disabled={saveBlockedByHealth || monteCarloServerDisabled} onChange={(event) => setRunMonteCarloEnabled(event.target.checked)} type="checkbox" />
              Run Monte Carlo
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input checked={runActionsEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunActionsEnabled(event.target.checked)} type="checkbox" />
              Get actions
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input checked={runDebtEnabled} onChange={(event) => setRunDebtEnabled(event.target.checked)} type="checkbox" />
              Analyze debt
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input checked={runOptimizeEnabled} disabled={optimizerServerDisabled || saveBlockedByHealth} onChange={(event) => setRunOptimizeEnabled(event.target.checked)} type="checkbox" />
              Experimental: Optimize
            </label>
          </div>

          {monteCarloServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.</p>
          ) : null}

          {runMonteCarloEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                Monte Carlo paths
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={monteCarloPaths} onChange={(event) => setMonteCarloPaths(event.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Monte Carlo seed
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={monteCarloSeed} onChange={(event) => setMonteCarloSeed(event.target.value)} />
              </label>
            </div>
          ) : null}

          {runActionsEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input checked={includeProducts} disabled={saveBlockedByHealth || includeProductsServerDisabled} onChange={(event) => setIncludeProducts(event.target.checked)} type="checkbox" />
                includeProducts
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                maxCandidates
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={maxCandidatesPerAction} onChange={(event) => setMaxCandidatesPerAction(event.target.value)} />
              </label>
            </div>
          ) : null}

          {runActionsEnabled && includeProductsServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.</p>
          ) : null}

          {optimizerServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 Optimizer 기능이 비활성화되어 있습니다.</p>
          ) : null}

          {runDebtEnabled ? (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Debt extraPaymentKrw
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={debtExtraPaymentKrw} onChange={(event) => setDebtExtraPaymentKrw(event.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Debt offers JSON
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={debtOffersJson}
                  onChange={(event) => setDebtOffersJson(event.target.value)}
                />
              </label>
            </>
          ) : null}

          {runOptimizeEnabled ? (
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-semibold text-indigo-900">Experimental Optimizer</p>
              <p className="text-xs text-indigo-800">후보 전략 2~5개를 비교만 제공합니다. 자동 적용은 하지 않습니다.</p>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer constraints JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerConstraintsJson}
                  onChange={(event) => setOptimizerConstraintsJson(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer knobs JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerKnobsJson}
                  onChange={(event) => setOptimizerKnobsJson(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer search JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerSearchJson}
                  onChange={(event) => setOptimizerSearchJson(event.target.value)}
                />
              </label>
              <Button disabled={runningOptimize || optimizerServerDisabled || saveBlockedByHealth} onClick={() => void runOptimizeAction()} size="sm" variant="outline">
                {runningOptimize ? "Optimizer 실행 중..." : "Run optimizer"}
              </Button>
            </div>
          ) : null}

          {healthWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Assumptions Health 경고 ({healthWarnings.length})</p>
              <div className="mt-2 space-y-1">
                {healthWarnings.map((warning) => (
                  <p key={`${warning.code}:${warning.severity}`}>[{warning.severity}] {warning.code} - {warning.message}</p>
                ))}
              </div>
              {healthWarnings.some((warning) => warning.code === "SNAPSHOT_STALE" || warning.code === "SNAPSHOT_VERY_STALE" || warning.code === "SNAPSHOT_MISSING") ? (
                <div className="mt-2">
                  <Link className="font-semibold text-emerald-700 underline" href="/ops/assumptions">/ops/assumptions로 이동해 스냅샷 동기화</Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasCriticalHealth ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <label className="flex items-start gap-2">
                <input checked={healthAck} onChange={(event) => setHealthAck(event.target.checked)} type="checkbox" />
                <span>위 경고를 확인했고, 이 가정으로 계산 결과가 왜곡될 수 있음을 이해했습니다.</span>
              </label>
            </div>
          ) : null}

          <p className="text-xs text-slate-500" id="planning-save-disabled-reason">
            {disabledReason || "Run plan은 실행 가능하며 Save run은 실행 결과가 있을 때 활성화됩니다."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button disabled={running || !selectedProfileId} onClick={() => void runPlanAction()} variant="primary">
              {running ? "실행 중..." : "Run plan"}
            </Button>
            <Button
              aria-describedby={saveBlockedByHealth ? "planning-save-disabled-reason" : undefined}
              disabled={savingRun || !selectedProfileId || !runResult?.simulate || saveBlockedByHealth}
              onClick={() => void saveRunAction()}
              variant="outline"
            >
              {savingRun ? "저장 중..." : "Save run"}
            </Button>
          </div>
        </Card>
      </div>

      {optimizeCandidates.length > 0 ? (
        <Card className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Experimental Optimize Candidates</h2>
            <p className="text-xs text-slate-500">
              snapshot: {optimizeResult?.meta?.snapshot?.id ?? "latest"} / {optimizeCandidates.length}개
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {optimizeCandidates.map((candidate, index) => {
              const strategy = asRecord(candidate.strategy);
              const score = asRecord(candidate.score);
              const why = asArray(candidate.why).map((item) => String(item));
              const cautions = asArray(candidate.cautions).map((item) => String(item));
              const summary = asRecord(asRecord(candidate.result).summary);
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" key={`${String(candidate.id ?? index)}`}>
                  <p className="font-semibold text-slate-900">{String(candidate.title ?? `Candidate ${index + 1}`)}</p>
                  <p className="mt-1">goals: {formatNumber(locale, score.goalsAchieved)} / worstCash: {formatKrw(locale, Number(score.worstCashKrw ?? 0))} / endNetWorth: {formatKrw(locale, Number(score.endNetWorthKrw ?? 0))}</p>
                  <p className="mt-1">totalInterest: {formatKrw(locale, Number(score.totalInterestKrw ?? summary.totalInterestKrw ?? 0))}</p>
                  <div className="mt-2 space-y-1">
                    {why.map((line, whyIndex) => (
                      <p key={`${String(candidate.id ?? index)}-why-${whyIndex}`}>- {line}</p>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1 text-amber-800">
                    {cautions.map((line, cautionIndex) => (
                      <p key={`${String(candidate.id ?? index)}-caution-${cautionIndex}`}>* {line}</p>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={() => void copyStrategyAction(strategy)} size="sm" variant="outline">전략 값 복사</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {runResult ? (
        <div className="mt-6 space-y-6">
          <Card className="text-xs text-slate-700">
            <details>
              <summary className="cursor-pointer font-semibold text-slate-900">How to read this (경고/지표 해석 가이드)</summary>
              <div className="mt-3 space-y-2">
                <p><span className="font-semibold">NEGATIVE_CASHFLOW</span>: 월 적자 상태입니다. 지출 절감 또는 부채/적립 조정을 먼저 점검하세요.</p>
                <p><span className="font-semibold">HIGH_DEBT_SERVICE</span>: DSR이 높습니다. 상환 기간/금리/추가상환 시나리오를 비교하세요.</p>
                <p><span className="font-semibold">SNAPSHOT_STALE</span>: 가정 최신성이 낮습니다. `/ops/assumptions` 동기화 후 재실행을 권장합니다.</p>
                <p><span className="font-semibold">Monte Carlo 확률</span>: 통계 기반 참고값이며 보장값이 아닙니다.</p>
                <p><span className="font-semibold">Actions 후보</span>: 실행 비교용 제안 목록입니다. 특정 상품 가입 권유가 아닙니다.</p>
              </div>
            </details>
          </Card>

          <Card>
            <div className="flex flex-wrap gap-2">
              {tabs.filter((tab) => tab.visible).map((tab) => (
                <Button
                  key={tab.id}
                  size="sm"
                  variant={activeTab === tab.id ? "primary" : "outline"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {activeTab === "summary" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_GENERATED_AT")}: <span className="font-semibold">{formatDateTime(locale, runResult.meta?.generatedAt)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_ID")}: <span className="font-semibold">{runResult.meta?.snapshot?.id ?? "latest"}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_AS_OF")}: <span className="font-semibold">{runResult.meta?.snapshot?.asOf ?? "-"}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_FETCHED_AT")}: <span className="font-semibold">{formatDateTime(locale, runResult.meta?.snapshot?.fetchedAt)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_HEALTH_WARNINGS")}: <span className="font-semibold">{formatNumber(locale, runResult.meta?.health?.warningsCount)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_HEALTH_CRITICAL")}: <span className="font-semibold">{formatNumber(locale, runResult.meta?.health?.criticalCount)}</span></div>
                </div>

                {runResult.partialErrors.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    부분 실패: {runResult.partialErrors.join(" | ")}
                  </div>
                ) : null}
                {runResult.mcBudgetGuide ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">{runResult.mcBudgetGuide}</div>
                ) : null}
                {savedRun ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                    저장된 run: {savedRun.id} · <Link className="underline" href="/planning/runs">/planning/runs로 이동</Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "simulate" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <h3 className="font-semibold text-slate-900">{t(locale, "CHARTS_HEADER")}</h3>
                {chartMode === "none" ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    {t(locale, "CHART_NOT_AVAILABLE")}
                  </p>
                ) : (
                  <PlanningMiniCharts locale={locale} mode={chartMode} points={chartPoints} />
                )}

                <h3 className="font-semibold text-slate-900">Warnings</h3>
                <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(simulateWarnings)}</pre>

                <h3 className="font-semibold text-slate-900">Goals Status</h3>
                <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(simulateGoals)}</pre>

                <h3 className="font-semibold text-slate-900">Key Timeline Points (0/12/last)</h3>
                <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(keyTimelinePoints)}</pre>
              </div>
            ) : null}

            {activeTab === "scenarios" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <h3 className="font-semibold text-slate-900">Base</h3>
                <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(scenariosBase)}</pre>
                <h3 className="font-semibold text-slate-900">Scenarios</h3>
                <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(scenariosList)}</pre>
              </div>
            ) : null}

            {activeTab === "monteCarlo" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(monteRow)}</pre>
              </div>
            ) : null}

            {activeTab === "actions" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(actionsList)}</pre>
              </div>
            ) : null}

            {activeTab === "debt" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <h3 className="font-semibold text-slate-900">Debt Summary</h3>
                <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty(debtData.meta ?? {})}</pre>
                <h3 className="font-semibold text-slate-900">Summaries / Refinance / What-if</h3>
                <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">{pretty({
                  summaries: debtData.summaries ?? [],
                  refinance: debtData.refinance ?? [],
                  whatIf: debtData.whatIf ?? {},
                  warnings: debtData.warnings ?? [],
                })}</pre>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}

export default PlanningWorkspaceClient;
