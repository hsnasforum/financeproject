"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import PlanningMiniCharts from "@/app/planning/_components/PlanningMiniCharts";
import SnapshotPicker from "@/app/planning/_components/SnapshotPicker";
import {
  createInitialStepStatuses,
  type StepId,
  type StepStatus,
} from "@/app/planning/_lib/runPipeline";
import { type SnapshotSelection } from "@/app/planning/_lib/snapshotSelection";
import {
  buildProfileJsonEditorState,
  createDefaultProfileFormModel,
  estimateDebtMonthlyPaymentKrw,
  normalizeDraft,
  normalizeDraftWithDisclosure,
  type FormDraft,
  formToProfile,
  hydrateProfileJsonEditorState,
  parseProfileJsonEditorDraft,
  toProfileJson,
  validateDebtOfferLiabilityIds,
  validateProfileForm,
  type ProfileFormDebt,
  type ProfileFormGoal,
  type ProfileJsonEditorState,
  type ProfileFormModel,
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
  buildWorkspaceLiveSummary,
  buildWorkspaceQuickStartVm,
  isWorkspaceQuickStartProfileDone,
  resolveWorkspaceSelectedProfileSyncState,
  stableStringifyWorkspaceValue,
  type WorkspaceQuickStartProgressState,
} from "@/app/planning/_lib/workspaceQuickStart";
import {
  ASSUMPTIONS_FORM_DEFAULT,
  assumptionsFormToRecord,
  parseAssumptionsEditorJson,
  splitAssumptionsRecord,
  type AssumptionsFormModel,
} from "@/app/planning/_lib/workspaceAssumptionsEditor";
import {
  debtOfferRowsToPayload,
  parseDebtOffersEditorJson,
  parseDebtOffersFormRows,
  type DebtOfferFormRow,
} from "@/app/planning/_lib/workspaceDebtOffersEditor";
import {
  buildWorkspaceCompletedRunState,
  buildWorkspaceHealthGuardState,
  buildWorkspaceSnapshotState,
  buildStepStatusesFromRunStages,
  type WorkspaceRunMeta as PlanningMeta,
  type WorkspaceRunResult,
} from "@/app/planning/_lib/workspaceRunResult";
import { type SnapshotListItem } from "@/app/planning/_lib/snapshotList";
import {
  buildWorkspaceSnapshotItemsStateFromApi,
  isSameWorkspaceSnapshotSelection,
  normalizeWorkspaceSnapshotItemsState,
  normalizeWorkspaceSnapshotSelection,
  resolveInitialWorkspaceSnapshotSelection,
  resolveWorkspaceSelectedSnapshotItem,
  resolveWorkspaceSnapshotSelectionFallback,
  type SnapshotItemsState,
} from "@/app/planning/_lib/workspaceSnapshotSelection";
import {
  defaults as planningExecutionDefaults,
  getVisibleSections,
  type PlanningTabId,
} from "@/app/planning/_lib/workspaceUiState";
import {
  AdvancedJsonPanel,
  GoalsTable,
  ResultGuideCard,
  TimelineSummaryTable,
  WarningsTable,
} from "@/components/planning/ResultGuideSections";
import {
  BodyActionLink,
  BodyDialogSurface,
  BodyEmptyState,
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyChoiceRowClassName,
  bodyActionLinkClassName,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
  bodyDialogActionsClassName,
  bodyFieldClassName,
  bodyLabelClassName,
  bodyMetaChipClassName,
  bodyTextAreaClassName,
} from "@/components/ui/BodyTone";
import EvidencePanel from "@/components/planning/EvidencePanel";
import DisclosuresPanel from "@/components/planning/DisclosuresPanel";
import ProfileV2Form from "@/components/planning/ProfileV2Form";
import PlanningOnboardingWizard from "@/components/planning/PlanningOnboardingWizard";
import PlanningQuickStartGate from "@/components/planning/PlanningQuickStartGate";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import { buildMetricEvidence } from "@/app/planning/_lib/metricEvidence";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { withDevCsrf, writeDevCsrfToken } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { buildConfirmString } from "@/lib/ops/confirm";
import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";
import { type PlanningFeatureFlags } from "@/lib/planning/config";
import { formatDate, formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { t, type Locale } from "@/lib/planning/i18n";
import {
  appendProfileIdQuery,
  normalizeProfileId,
  PLANNING_SELECTED_PROFILE_STORAGE_KEY,
} from "@/lib/planning/profileScope";
import { LIMITS } from "@/lib/planning/v2/limits";
import { SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME } from "@/lib/planning/samples/profile.sample.ko";
import { type PlanningProfileRecord, type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  normalizePlanningResponse,
  type PlanningApiEngineEnvelope,
} from "@/lib/planning/api/contracts";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { applySuggestions } from "@/lib/planning/v2/applySuggestions";
import { preflightRun, type PreflightIssue } from "@/lib/planning/v2/preflight";
import { applyProfilePatch, type ScenarioPatch } from "@/lib/planning/v2/profilePatch";
import {
  suggestProfileNormalizations,
  type NormalizationSuggestion,
} from "@/lib/planning/v2/normalizeProfile";
import { type PlanningWizardOutput } from "@/app/planning/_lib/planningOnboardingWizard";
import {
  aggregateWarnings as aggregateGuideWarnings,
} from "@/lib/planning/v2/resultGuide";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import {
  mergeNormalizationReports,
  reportFromNormalizationDisclosure,
  type NormalizationReport,
} from "@/lib/planning/v2/normalizationReport";
import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "@/lib/regions/kr_admin_2025";

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

type ParsedRunInputs = {
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

type BaselineRunOption = {
  id: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
};

type RunInputScenario = NonNullable<PlanningRunRecord["input"]["scenario"]>;

const ALLOCATION_POLICIES: Array<{ id: AllocationPolicyId; label: string }> = [
  { id: "balanced", label: "균형형 (기본)" },
  { id: "safety", label: "안정형" },
  { id: "growth", label: "성장형" },
];

type PlanningWorkspaceClientProps = {
  featureFlags: PlanningFeatureFlags;
  locale: Locale;
  initialSelectedProfileId?: string;
  snapshotItems: {
    latest?: SnapshotListItem;
    history: SnapshotListItem[];
  };
  csrf?: string;
};

type ProfileSaveMode = "create" | "duplicate" | "update";

export type WorkspaceAdvancedExecutionOptions = {
  runScenariosEnabled: boolean;
  runMonteCarloEnabled: boolean;
  runActionsEnabled: boolean;
  runDebtEnabled: boolean;
  runOptimizeEnabled: boolean;
  includeProducts: boolean;
};

export function transitionWorkspaceExecutionOptionsForMode(input: {
  beginnerMode: boolean;
  wasBeginnerMode: boolean;
  current: WorkspaceAdvancedExecutionOptions;
  snapshot: WorkspaceAdvancedExecutionOptions | null;
}): {
  nextState?: WorkspaceAdvancedExecutionOptions;
  nextSnapshot: WorkspaceAdvancedExecutionOptions | null;
} {
  if (input.beginnerMode === input.wasBeginnerMode) {
    return {
      nextSnapshot: input.snapshot,
    };
  }

  if (input.beginnerMode) {
    return {
      nextState: {
        ...input.current,
        runScenariosEnabled: true,
        runMonteCarloEnabled: false,
        runActionsEnabled: true,
        runDebtEnabled: true,
        runOptimizeEnabled: false,
        includeProducts: false,
      },
      nextSnapshot: { ...input.current },
    };
  }

  return {
    ...(input.snapshot ? { nextState: { ...input.snapshot } } : {}),
    nextSnapshot: null,
  };
}

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

const DEFAULT_ASSUMPTIONS_OVERRIDE = `{
  "inflationPct": 2.0,
  "expectedReturnPct": 5.0
}`;

const DEFAULT_DEBT_OFFERS_JSON = `[
  { "liabilityId": "demo-loan-1", "newAprPct": 5.4, "feeKrw": 90000, "title": "Refi A" }
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

const PLANNING_BEGINNER_MODE_KEY = "planning:v2:beginnerMode";
const BEGINNER_MAX_DEBT_ROWS = 3;

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

function ensureBeginnerGoals(goals: ProfileFormGoal[], context: BeginnerGoalContext): ProfileFormGoal[] {
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

function updateBeginnerGoalList(
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

function emergencyMonthsFromGoal(goal: ProfileFormGoal, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 6;
  const raw = goal.targetAmount / monthlyExpenses;
  if (!Number.isFinite(raw) || raw <= 0) return 6;
  return Math.max(1, Math.round(raw));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseJsonText<T = unknown>(label: string, text: string): { value: T | null; error: string } {
  try {
    return { value: JSON.parse(text) as T, error: "" };
  } catch {
    return { value: null, error: `${label} JSON 파싱에 실패했습니다.` };
  }
}

function tryParseJsonText<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
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

function createScenarioPatchesFromTemplate(
  templateId: ScenarioTemplateId,
): ScenarioPatch[] {
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

function parseHorizonMonths(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1200) return null;
  return parsed;
}

function nextRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

function formatGroupedIntegerInput(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("ko-KR").format(Math.round(numeric));
}

function monthOffsetToInput(targetMonth: number): string {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = Math.max(1, Math.trunc(targetMonth || 1));
  const next = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function inputToMonthOffset(value: string): number {
  if (!/^\d{4}-\d{2}$/.test(value.trim())) return 1;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return 1;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const target = new Date(year, month - 1, 1);
  const diffMonths = (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth());
  return Math.max(1, diffMonths);
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

function formatRatioPct(locale: Locale, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function formatSeverityKo(value: unknown): string {
  const severity = String(value ?? "").trim();
  if (severity === "critical") return "치명";
  if (severity === "warn") return "경고";
  if (severity === "info") return "정보";
  return severity || "-";
}

function formatPreflightIssue(issue: PreflightIssue): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.message} (${issue.fixHint})`;
  }
  return issue.message;
}

function formatRunOverallStatusKo(status: PlanningRunRecord["overallStatus"] | undefined): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

function formatDisclosureValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("ko-KR");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return "-";
}

const STEP_LABELS: Record<StepId, string> = {
  simulate: "simulate",
  scenarios: "scenarios",
  monteCarlo: "monte carlo",
  actions: "actions",
  debtStrategy: "debt strategy",
};

const TAB_LABELS: Record<PlanningTabId, string> = {
  summary: "Summary",
  warningsGoals: "Warnings & Goals",
  actions: "Actions",
  scenarios: "Scenarios",
  monteCarlo: "Monte Carlo",
  debt: "Debt",
};

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: PlanningFeedbackCategory; label: string }> = [
  { value: "bug", label: "버그" },
  { value: "ux", label: "사용성" },
  { value: "data", label: "데이터" },
  { value: "other", label: "기타" },
];

type ScenarioTemplateId =
  | "NONE"
  | "REDUCE_DISCRETIONARY_10"
  | "REDUCE_DISCRETIONARY_20"
  | "INCOME_PLUS_5";

const SCENARIO_TEMPLATE_LABELS: Record<ScenarioTemplateId, string> = {
  NONE: "없음",
  REDUCE_DISCRETIONARY_10: "선택지출 -10%",
  REDUCE_DISCRETIONARY_20: "선택지출 -20%",
  INCOME_PLUS_5: "월수입 +5%",
};

function formatStepStateKo(state: StepStatus["state"]): string {
  if (state === "PENDING") return "대기";
  if (state === "RUNNING") return "진행중";
  if (state === "SUCCESS") return "성공";
  if (state === "FAILED") return "실패";
  return "생략";
}

function stepStateClass(state: StepStatus["state"]): string {
  if (state === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (state === "SKIPPED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (state === "RUNNING") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function quickStartProgressToneClassName(state: WorkspaceQuickStartProgressState): string {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "current") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-white text-slate-600";
}

export function PlanningWorkspaceClient({
  featureFlags,
  locale,
  initialSelectedProfileId = "",
  snapshotItems,
  csrf = "",
}: PlanningWorkspaceClientProps) {
  const initialProfileEditorState = useMemo(() => {
    const parsed = tryParseJsonText<ProfileV2>(DEFAULT_PROFILE_JSON);
    return parsed
      ? hydrateProfileJsonEditorState(parsed, "기본 프로필")
      : buildProfileJsonEditorState(createDefaultProfileFormModel(), "기본 프로필");
  }, []);
  const initialAssumptionsSplit = useMemo(() => {
    const parsed = tryParseJsonText<Record<string, unknown>>(DEFAULT_ASSUMPTIONS_OVERRIDE) ?? {};
    return splitAssumptionsRecord(parsed);
  }, []);
  const initialAssumptionsJson = useMemo(
    () => pretty(assumptionsFormToRecord(initialAssumptionsSplit.form, initialAssumptionsSplit.extra)),
    [initialAssumptionsSplit],
  );
  const initialDebtOfferRows = useMemo(() => {
    const parsed = tryParseJsonText<unknown[]>(DEFAULT_DEBT_OFFERS_JSON) ?? [];
    return parseDebtOffersFormRows(parsed);
  }, []);
  const initialSnapshotItems = useMemo(
    () => normalizeWorkspaceSnapshotItemsState(snapshotItems),
    [snapshotItems],
  );
  const safeDefaults = useMemo(() => planningExecutionDefaults(true), []);

  useEffect(() => {
    writeDevCsrfToken(csrf);
  }, [csrf]);

  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileName, setProfileName] = useState("기본 프로필");
  const [profileJson, setProfileJson] = useState(initialProfileEditorState.json);
  const [profileJsonDraft, setProfileJsonDraft] = useState(initialProfileEditorState.jsonDraft);
  const [profileJsonError, setProfileJsonError] = useState(initialProfileEditorState.jsonError);
  const [profileForm, setProfileForm] = useState<ProfileFormModel>(initialProfileEditorState.form);

  const [availableSnapshotItems, setAvailableSnapshotItems] = useState<SnapshotItemsState>(initialSnapshotItems);
  const [snapshotItemsWarning, setSnapshotItemsWarning] = useState("");
  const [snapshotSelection, setSnapshotSelection] = useState<SnapshotSelection>(
    () => resolveInitialWorkspaceSnapshotSelection(initialSnapshotItems),
  );
  const [policyId, setPolicyId] = useState<AllocationPolicyId>("balanced");
  const [horizonMonths, setHorizonMonths] = useState(safeDefaults.horizonMonths);
  const [runTitle, setRunTitle] = useState("기본 실행");
  const [assumptionsOverrideJson, setAssumptionsOverrideJson] = useState(initialAssumptionsJson);
  const [assumptionsJsonError, setAssumptionsJsonError] = useState("");
  const [assumptionsForm, setAssumptionsForm] = useState<AssumptionsFormModel>(initialAssumptionsSplit.form);
  const [assumptionsExtraOverrides, setAssumptionsExtraOverrides] = useState<Record<string, unknown>>(initialAssumptionsSplit.extra);

  const [runScenariosEnabled, setRunScenariosEnabled] = useState(safeDefaults.runScenariosEnabled);
  const [runMonteCarloEnabled, setRunMonteCarloEnabled] = useState(safeDefaults.runMonteCarloEnabled);
  const [runActionsEnabled, setRunActionsEnabled] = useState(safeDefaults.runActionsEnabled);
  const [runDebtEnabled, setRunDebtEnabled] = useState(safeDefaults.runDebtEnabled);
  const [runOptimizeEnabled, setRunOptimizeEnabled] = useState(safeDefaults.runOptimizeEnabled);

  const [includeProducts, setIncludeProducts] = useState(safeDefaults.includeProducts);
  const [maxCandidatesPerAction, setMaxCandidatesPerAction] = useState("5");

  const [monteCarloPaths, setMonteCarloPaths] = useState(safeDefaults.monteCarloPaths);
  const [monteCarloSeed, setMonteCarloSeed] = useState(safeDefaults.monteCarloSeed);

  const [debtExtraPaymentKrw, setDebtExtraPaymentKrw] = useState(safeDefaults.debtExtraPaymentKrw);
  const [debtOffersJson, setDebtOffersJson] = useState(DEFAULT_DEBT_OFFERS_JSON);
  const [debtOffersJsonError, setDebtOffersJsonError] = useState("");
  const [debtOfferRows, setDebtOfferRows] = useState<DebtOfferFormRow[]>(initialDebtOfferRows);
  const [optimizerConstraintsJson, setOptimizerConstraintsJson] = useState(DEFAULT_OPTIMIZER_CONSTRAINTS_JSON);
  const [optimizerKnobsJson, setOptimizerKnobsJson] = useState(DEFAULT_OPTIMIZER_KNOBS_JSON);
  const [optimizerSearchJson, setOptimizerSearchJson] = useState(DEFAULT_OPTIMIZER_SEARCH_JSON);

  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profilesLoadError, setProfilesLoadError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
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
  const [currentProfileHashState, setCurrentProfileHashState] = useState<{ input: string; hash: string }>({
    input: "",
    hash: "",
  });
  const [baselineRuns, setBaselineRuns] = useState<BaselineRunOption[]>([]);
  const [loadingBaselineRuns, setLoadingBaselineRuns] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [scenarioTemplateId, setScenarioTemplateId] = useState<ScenarioTemplateId>("NONE");
  const [activeTab, setActiveTab] = useState<PlanningTabId>("summary");
  const [showAllActions, setShowAllActions] = useState(false);

  const [healthAck, setHealthAck] = useState(false);
  const [pendingProfileSave, setPendingProfileSave] = useState<{
    mode: ProfileSaveMode;
    profile: ProfileV2;
  } | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<NormalizationSuggestion[]>([]);
  const [acceptedSuggestionCodes, setAcceptedSuggestionCodes] = useState<string[]>([]);
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [beginnerModeLoaded, setBeginnerModeLoaded] = useState(false);
  const isMountedRef = useRef(true);
  const previousBeginnerModeRef = useRef(beginnerMode);
  const advancedExecutionOptionsRef = useRef<WorkspaceAdvancedExecutionOptions | null>(null);
  const [saveWarningConfirmed, setSaveWarningConfirmed] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<PlanningFeedbackCategory>("ux");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackToast, setFeedbackToast] = useState("");
  const [lastNormalizationDisclosure, setLastNormalizationDisclosure] = useState<ProfileNormalizationDisclosure | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [profileDeleteDialog, setProfileDeleteDialog] = useState<{
    profileId: string;
    expectedConfirm: string;
    confirmText: string;
  } | null>(null);

  function pushWorkspaceNotice(message: string): void {
    if (!isMountedRef.current) return;
    setWorkspaceNotice(message);
    setWorkspaceError("");
  }

  function pushWorkspaceError(message: string): void {
    if (!isMountedRef.current) return;
    setWorkspaceError(message);
    setWorkspaceNotice("");
  }

  const applyHydratedProfileEditorState = useCallback((
    nextState: ProfileJsonEditorState,
    nextProfileName = profileName,
  ): void => {
    setProfileName(nextProfileName);
    setProfileForm(nextState.form);
    setProfileJson(nextState.json);
    setProfileJsonDraft(nextState.jsonDraft);
    setProfileJsonError(nextState.jsonError);
  }, [profileName]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const runsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/runs", selectedProfileId),
    [selectedProfileId],
  );
  const runsLinkProfileState = useMemo(
    () => (loadingProfiles ? "loading" : selectedProfileId.trim().length > 0 ? "selected" : "empty"),
    [loadingProfiles, selectedProfileId],
  );
  const runsLinkReady = useMemo(
    () => runsPageHref.includes("/planning/runs"),
    [runsPageHref],
  );
  const selectedBenefitSidoCode = useMemo(
    () => SIDO_ADMIN_2025.find((entry) => entry.name === (profileForm.sido ?? ""))?.code ?? "",
    [profileForm.sido],
  );
  const benefitSigunguOptions = useMemo(
    () => (selectedBenefitSidoCode ? SIGUNGU_BY_SIDO_CODE_2025[selectedBenefitSidoCode] ?? [] : []),
    [selectedBenefitSidoCode],
  );
  const reportsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/reports", selectedProfileId),
    [selectedProfileId],
  );
  const liveSummary = useMemo(() => buildWorkspaceLiveSummary(profileForm), [profileForm]);
  const metricEvidenceItems = useMemo(() => {
    const profile = formToProfile(profileForm);
    return buildMetricEvidence({
      profile,
      policyId,
    });
  }, [policyId, profileForm]);
  const profileValidation = useMemo(() => validateProfileForm(profileForm), [profileForm]);
  const profileNormalizationReport = useMemo<NormalizationReport>(() => {
    try {
      return normalizeDraftWithDisclosure(profileForm as unknown as FormDraft, profileName, policyId).report;
    } catch {
      return { fixesApplied: [], defaultsApplied: [] };
    }
  }, [policyId, profileForm, profileName]);
  const runNormalizationDisclosure = useMemo<ProfileNormalizationDisclosure | null>(() => {
    return parseProfileNormalizationDisclosure(runResult?.meta?.normalization);
  }, [runResult?.meta?.normalization]);
  const lastNormalizationReport = useMemo<NormalizationReport>(
    () => reportFromNormalizationDisclosure(lastNormalizationDisclosure, "최근 적용 결과"),
    [lastNormalizationDisclosure],
  );
  const runNormalizationReport = useMemo<NormalizationReport>(
    () => reportFromNormalizationDisclosure(runNormalizationDisclosure, "최근 실행 결과"),
    [runNormalizationDisclosure],
  );
  const combinedNormalizationReport = useMemo<NormalizationReport>(
    () => mergeNormalizationReports([profileNormalizationReport, lastNormalizationReport, runNormalizationReport]),
    [profileNormalizationReport, lastNormalizationReport, runNormalizationReport],
  );
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
  const effectiveSnapshotSelection = useMemo(
    () => normalizeWorkspaceSnapshotSelection(availableSnapshotItems, snapshotSelection),
    [availableSnapshotItems, snapshotSelection],
  );
  const selectedSnapshotItem = useMemo(() => {
    return resolveWorkspaceSelectedSnapshotItem(availableSnapshotItems, effectiveSnapshotSelection);
  }, [availableSnapshotItems, effectiveSnapshotSelection]);
  const workspaceSnapshotState = useMemo(
    () => buildWorkspaceSnapshotState({
      runResult,
      selectedSnapshot: selectedSnapshotItem,
    }),
    [runResult, selectedSnapshotItem],
  );
  const selectedSnapshotId = effectiveSnapshotSelection.mode === "history"
    ? effectiveSnapshotSelection.id.trim() || undefined
    : undefined;
  const debtLiabilityOptions = useMemo(
    () => profileForm.debts.map((debt, index) => ({
      id: debt.id.trim(),
      label: debt.name.trim() || `부채 ${index + 1}`,
    })).filter((row) => row.id.length > 0),
    [profileForm.debts],
  );
  const debtOfferInvalidIds = useMemo(
    () => validateDebtOfferLiabilityIds(debtOfferRows, profileForm.debts),
    [debtOfferRows, profileForm.debts],
  );
  const availableBaselineRuns = useMemo(
    () => baselineRuns.filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS"),
    [baselineRuns],
  );
  const scenarioPatchesPreview = useMemo(
    () => createScenarioPatchesFromTemplate(scenarioTemplateId),
    [scenarioTemplateId],
  );

  const healthGuard = useMemo(
    () => buildWorkspaceHealthGuardState({
      runResult,
      healthAck,
    }),
    [healthAck, runResult],
  );
  const healthSummary = healthGuard.summary;
  const healthWarnings = healthGuard.warnings;
  const hasCriticalHealth = healthGuard.hasCriticalHealth;
  const saveBlockedByHealth = healthGuard.saveBlockedByHealth;
  const monteCarloServerDisabled = !featureFlags.monteCarloEnabled;
  const includeProductsServerDisabled = !featureFlags.includeProductsEnabled;
  const optimizerServerDisabled = !featureFlags.optimizerEnabled;
  const effectiveRunScenariosEnabled = beginnerMode ? true : runScenariosEnabled;
  const effectiveRunMonteCarloEnabled = beginnerMode
    ? false
    : (runMonteCarloEnabled && !saveBlockedByHealth && !monteCarloServerDisabled);
  const effectiveRunActionsEnabled = (beginnerMode ? true : runActionsEnabled) && !saveBlockedByHealth;
  const effectiveRunDebtEnabled = beginnerMode ? true : runDebtEnabled;
  const effectiveIncludeProducts = beginnerMode ? false : includeProducts;
  const assumptionsOverrideForPreflight = useMemo(
    () => assumptionsFormToRecord(assumptionsForm, assumptionsExtraOverrides),
    [assumptionsExtraOverrides, assumptionsForm],
  );
  const debtOffersForPreflight = useMemo(() => {
    if (!effectiveRunDebtEnabled || beginnerMode) return [];
    return debtOfferRowsToPayload(debtOfferRows).map((entry) => ({
      liabilityId: asString(asRecord(entry).liabilityId),
      newAprPct: Number(asRecord(entry).newAprPct ?? 0),
      ...(typeof asRecord(entry).feeKrw === "number" ? { feeKrw: Number(asRecord(entry).feeKrw) } : {}),
    }));
  }, [beginnerMode, debtOfferRows, effectiveRunDebtEnabled]);
  const preflightIssues = useMemo(
    () => preflightRun({
      profile: profileForm as unknown as Record<string, unknown>,
      selectedSnapshot: effectiveSnapshotSelection,
      debtOffers: debtOffersForPreflight,
      assumptionsOverride: assumptionsOverrideForPreflight,
      ...(effectiveRunMonteCarloEnabled ? {
        monteCarlo: {
          enabled: true,
          paths: Number.parseInt(monteCarloPaths, 10),
          horizonMonths: Number.parseInt(horizonMonths, 10),
        },
      } : {}),
    }),
    [
      debtOffersForPreflight,
      effectiveRunMonteCarloEnabled,
      horizonMonths,
      monteCarloPaths,
      profileForm,
      effectiveSnapshotSelection,
      assumptionsOverrideForPreflight,
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
  const saveNeedsWarningConfirmation = preflightWarnIssues.length > 0 && !saveWarningConfirmed;

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
      const stored = window.localStorage.getItem(PLANNING_BEGINNER_MODE_KEY);
      if (stored === "false") {
        setBeginnerMode(false);
      } else if (stored === "true") {
        setBeginnerMode(true);
      }
    } catch {
      // ignore storage failures
    } finally {
      setBeginnerModeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!beginnerModeLoaded) return;
    try {
      window.localStorage.setItem(PLANNING_BEGINNER_MODE_KEY, beginnerMode ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, [beginnerMode, beginnerModeLoaded]);

  useEffect(() => {
    const transition = transitionWorkspaceExecutionOptionsForMode({
      beginnerMode,
      wasBeginnerMode: previousBeginnerModeRef.current,
      current: {
        runScenariosEnabled,
        runMonteCarloEnabled,
        runActionsEnabled,
        runDebtEnabled,
        runOptimizeEnabled,
        includeProducts,
      },
      snapshot: advancedExecutionOptionsRef.current,
    });
    previousBeginnerModeRef.current = beginnerMode;
    advancedExecutionOptionsRef.current = transition.nextSnapshot;
    if (!transition.nextState) return;
    setRunScenariosEnabled(transition.nextState.runScenariosEnabled);
    setRunMonteCarloEnabled(transition.nextState.runMonteCarloEnabled);
    setRunActionsEnabled(transition.nextState.runActionsEnabled);
    setRunDebtEnabled(transition.nextState.runDebtEnabled);
    setRunOptimizeEnabled(transition.nextState.runOptimizeEnabled);
    setIncludeProducts(transition.nextState.includeProducts);
  }, [
    beginnerMode,
    includeProducts,
    runActionsEnabled,
    runDebtEnabled,
    runMonteCarloEnabled,
    runOptimizeEnabled,
    runScenariosEnabled,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadSnapshotsForSelection(): Promise<void> {
      try {
        const response = await fetch("/api/planning/v2/assumptions/snapshots?limit=30", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isRecord(payload) || payload.ok !== true) {
          throw new Error("snapshot list request failed");
        }

        const dataNode = isRecord(payload.data) ? payload.data : payload;
        if (cancelled) return;
        setAvailableSnapshotItems(buildWorkspaceSnapshotItemsStateFromApi(dataNode));
        setSnapshotItemsWarning("");
      } catch {
        if (cancelled) return;
        setSnapshotItemsWarning("스냅샷 목록 조회에 실패했습니다. latest 기준으로 계속 진행합니다.");
      }
    }

    void loadSnapshotsForSelection();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isSameWorkspaceSnapshotSelection(effectiveSnapshotSelection, snapshotSelection)) return;
    setSnapshotSelection(effectiveSnapshotSelection);
  }, [effectiveSnapshotSelection, snapshotSelection]);

  useEffect(() => {
    if (!beginnerMode) return;
    const context = beginnerGoalContext(profileForm);
    const nextGoals = ensureBeginnerGoals(profileForm.goals, context);
    if (nextGoals.length === profileForm.goals.length) return;

    const nextForm = {
      ...profileForm,
      goals: nextGoals,
    };
    applyHydratedProfileEditorState(buildProfileJsonEditorState(nextForm, profileName));
    clearPendingSuggestions();
  }, [applyHydratedProfileEditorState, beginnerMode, profileForm, profileName]);

  useEffect(() => {
    setSaveWarningConfirmed(false);
  }, [preflightWarnSignature, runResult?.meta?.generatedAt]);

  useEffect(() => {
    if (!feedbackToast) return;
    const timer = window.setTimeout(() => setFeedbackToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [feedbackToast]);

  useEffect(() => {
    if (!workspaceNotice) return;
    const timer = window.setTimeout(() => setWorkspaceNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [workspaceNotice]);

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

      setProfiles(payload.data);
      const fallbackId = payload.data[0]?.id ?? "";
      const pickedId = nextSelectedId && payload.data.some((item) => item.id === nextSelectedId)
        ? nextSelectedId
        : fallbackId;
      setSelectedProfileId(pickedId);

      const picked = payload.data.find((item) => item.id === pickedId);
      if (picked) {
        const nextProfileName = picked.name;
        applyHydratedProfileEditorState(hydrateProfileJsonEditorState(picked.profile, nextProfileName), nextProfileName);
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
  }, [applyHydratedProfileEditorState, locale]);

  async function loadBaselineRuns(profileId: string): Promise<void> {
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
      const preferred = rows.find((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")?.id ?? "";
      setBaselineRunId((prev) => {
        if (prev && rows.some((run) => run.id === prev)) return prev;
        return preferred;
      });
    } catch {
      if (!isMountedRef.current) return;
      setBaselineRuns([]);
      setBaselineRunId("");
    } finally {
      if (!isMountedRef.current) return;
      setLoadingBaselineRuns(false);
    }
  }

  useEffect(() => {
    let preferredProfileId = normalizeProfileId(initialSelectedProfileId);
    if (!preferredProfileId) {
      try {
        preferredProfileId = normalizeProfileId(window.localStorage.getItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY));
      } catch {
        preferredProfileId = "";
      }
    }
    void loadProfiles(preferredProfileId || undefined);
  }, [initialSelectedProfileId, loadProfiles]);

  useEffect(() => {
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
    if (!selectedProfileId) {
      setBaselineRuns([]);
      setBaselineRunId("");
      return;
    }
    void loadBaselineRuns(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfile) return;
    const nextProfileName = selectedProfile.name;
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(selectedProfile.profile, nextProfileName), nextProfileName);
    setLastNormalizationDisclosure(null);
    clearPendingSuggestions();
  }, [applyHydratedProfileEditorState, selectedProfile]);

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

  function syncProfileJsonFromForm(nextForm: ProfileFormModel): void {
    const nextState = buildProfileJsonEditorState(nextForm, profileName);
    if (profileJson !== nextState.json) {
      setProfileJson(nextState.json);
    }
    setProfileJsonDraft(nextState.jsonDraft);
    setProfileJsonError(nextState.jsonError);
  }

  function applyProfileForm(nextForm: ProfileFormModel): void {
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  function applyWizardOutputAction(output: PlanningWizardOutput): void {
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(output.profile, profileName));
    clearPendingSuggestions();
    pushWorkspaceNotice("위저드 결과를 적용했습니다. 필요 시 값을 조정한 뒤 저장하세요.");
  }

  function applyQuickStartAction(output: PlanningWizardOutput): void {
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(output.profile, profileName));
    clearPendingSuggestions();
    pushWorkspaceNotice(
      selectedProfileId
        ? "간단 시작 입력을 적용했습니다. 현재 프로필과 편집값이 달라졌을 수 있으니 저장 여부를 먼저 확인해 주세요."
        : "간단 시작 입력을 적용했습니다. 다음 단계는 프로필 저장이며, 아래 새로 만들기를 누르면 첫 실행 시작으로 이어집니다.",
    );
  }

  function replaceProfileFromJsonText(nextJson: string): void {
    setProfileJsonDraft(nextJson);
    setProfileJsonError("");
  }

  function applyProfileJsonEditorAction(): void {
    const parsed = parseProfileJsonEditorDraft(profileJsonDraft, profileName);
    if (!parsed.ok) {
      setProfileJsonError(parsed.error);
      return;
    }
    applyHydratedProfileEditorState(buildProfileJsonEditorState(parsed.form, profileName));
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

  function syncAssumptionsJsonFromForm(nextForm: AssumptionsFormModel, nextExtra: Record<string, unknown>): void {
    setAssumptionsOverrideJson(pretty(assumptionsFormToRecord(nextForm, nextExtra)));
    setAssumptionsJsonError("");
  }

  function applyAssumptionsForm(nextForm: AssumptionsFormModel): void {
    setAssumptionsForm(nextForm);
    syncAssumptionsJsonFromForm(nextForm, assumptionsExtraOverrides);
  }

  function replaceAssumptionsFromJsonText(nextJson: string): void {
    setAssumptionsOverrideJson(nextJson);
    const parsed = parseAssumptionsEditorJson(nextJson);
    if (!parsed.ok) {
      setAssumptionsJsonError(parsed.error);
      return;
    }
    setAssumptionsJsonError("");
    setAssumptionsForm(parsed.form);
    setAssumptionsExtraOverrides(parsed.extra);
  }

  function syncDebtOfferJsonFromRows(rows: DebtOfferFormRow[]): void {
    setDebtOffersJson(pretty(debtOfferRowsToPayload(rows)));
    setDebtOffersJsonError("");
  }

  function applyDebtOfferRows(rows: DebtOfferFormRow[]): void {
    setDebtOfferRows(rows);
    syncDebtOfferJsonFromRows(rows);
  }

  function replaceDebtOffersFromJsonText(nextJson: string): void {
    setDebtOffersJson(nextJson);
    const parsed = parseDebtOffersEditorJson(nextJson);
    if (!parsed.ok) {
      setDebtOffersJsonError(parsed.error);
      return;
    }
    setDebtOffersJsonError("");
    setDebtOfferRows(parsed.rows);
  }

  function updateProfileField<K extends keyof ProfileFormModel>(key: K, value: ProfileFormModel[K]): void {
    applyProfileForm({
      ...profileForm,
      [key]: value,
    });
  }

  function addDebtRow(): void {
    if (beginnerMode && profileForm.debts.length >= BEGINNER_MAX_DEBT_ROWS) return;
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
    if (beginnerMode && profileForm.debts.length <= 1) return;
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

  function updateAssumptionsField<K extends keyof AssumptionsFormModel>(key: K, value: AssumptionsFormModel[K]): void {
    const nextForm = {
      ...assumptionsForm,
      [key]: value,
    };
    applyAssumptionsForm(nextForm);
  }

  function addDebtOfferRow(): void {
    applyDebtOfferRows([
      ...debtOfferRows,
      {
        rowId: nextRowId("offer"),
        liabilityId: "",
        title: "",
        newAprPct: 0,
        feeKrw: 0,
      },
    ]);
  }

  function removeDebtOfferRow(index: number): void {
    applyDebtOfferRows(debtOfferRows.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateDebtOfferRow(index: number, nextRow: DebtOfferFormRow): void {
    applyDebtOfferRows(debtOfferRows.map((row, rowIndex) => (rowIndex === index ? nextRow : row)));
  }

  function loadSampleProfileAction(): void {
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME), SAMPLE_PROFILE_V2_KO_NAME);
    clearPendingSuggestions();
    pushWorkspaceNotice("샘플 프로필을 편집 영역에 불러왔습니다. Save를 눌러야 실제 저장됩니다.");
  }

  async function performProfileSave(mode: ProfileSaveMode, profile: ProfileV2 | Record<string, unknown>): Promise<boolean> {
    if (mode === "update" && !selectedProfileId) {
      pushWorkspaceError("수정할 프로필을 먼저 선택하세요.");
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
        ? beginnerMode
          ? "프로필 저장 완료. 다음 단계는 첫 실행 시작입니다."
          : "프로필을 저장했습니다."
        : mode === "duplicate"
          ? "프로필을 복제했습니다."
          : beginnerMode
            ? "프로필 저장 완료. 다음 단계는 첫 실행 시작입니다."
            : "프로필을 수정했습니다.";
      const payloadName = mode === "duplicate" ? `${profileName || "프로필"} (copy)` : profileName;
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
      const parsedPayload = parseApiPayload(locale, res, payload, fallbackMessage);
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return false;
      }
      const typedPayload = payload as ApiResponse<PlanningProfileRecord>;

      const normalizationFromResponse = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
      setLastNormalizationDisclosure(normalizationFromResponse ?? payloadProfile.normalization);

      await loadProfiles(typedPayload.data?.id);
      pushWorkspaceNotice(successMessage);
      return true;
    } catch (error) {
      const message = mode === "create"
        ? "프로필 생성 중 오류가 발생했습니다."
        : mode === "duplicate"
          ? "프로필 복제 중 오류가 발생했습니다."
          : "프로필 수정 중 오류가 발생했습니다.";
      pushWorkspaceError(error instanceof Error ? error.message : message);
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
    if (!selectedProfileId) {
      pushWorkspaceError("삭제할 프로필을 먼저 선택하세요.");
      return;
    }
    const expectedConfirm = buildConfirmString("DELETE profile", selectedProfileId);
    setProfileDeleteDialog({
      profileId: selectedProfileId,
      expectedConfirm,
      confirmText: expectedConfirm,
    });
  }

  async function submitDeleteProfileAction(): Promise<void> {
    if (!profileDeleteDialog) return;
    if (profileDeleteDialog.confirmText.trim() !== profileDeleteDialog.expectedConfirm) {
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

  function parseCoreInputs(): {
    profile: Record<string, unknown>;
    assumptions: Record<string, unknown>;
    horizon: number;
    policyId: AllocationPolicyId;
    snapshotId?: string;
  } | null {
    if (profileValidation.errors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
      return null;
    }
    let profile: Record<string, unknown>;
    try {
      profile = normalizeDraftWithDisclosure(profileForm as unknown as FormDraft, profileName).profile as unknown as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로필 정규화에 실패했습니다.";
      pushWorkspaceError(message);
      return null;
    }
    const assumptions = assumptionsFormToRecord(assumptionsForm, assumptionsExtraOverrides);

    const horizon = parseHorizonMonths(horizonMonths);
    if (!horizon) {
      pushWorkspaceError("horizonMonths는 1~1200 범위 숫자여야 합니다.");
      return null;
    }

    const snapshotId = selectedSnapshotId;

    return {
      profile,
      assumptions,
      horizon,
      policyId,
      ...(snapshotId ? { snapshotId } : {}),
    };
  }

  function parseRunInputs(): ParsedRunInputs | null {
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
  }

function handleSnapshotNotFoundCode(code: unknown): boolean {
    const fallbackSelection = resolveWorkspaceSnapshotSelectionFallback(code);
    if (!fallbackSelection) return false;
    setSnapshotSelection(fallbackSelection);
    pushWorkspaceError("선택한 스냅샷을 찾을 수 없습니다. 목록을 새로고침하거나 latest를 사용하세요.");
    return true;
  }

  function handleSnapshotNotFound(payload: ApiResponse<unknown> | null): boolean {
    return handleSnapshotNotFoundCode(payload?.error?.code);
  }

  async function copyStrategyAction(strategy: unknown): Promise<void> {
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
  }

  async function runOptimizeAction(): Promise<void> {
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

    setRunningOptimize(true);
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
      setOptimizeResult({
        meta: asRecord(typedPayload.meta) as PlanningMeta,
        engine: normalized.engine,
        engineSchemaVersion: normalized.engineSchemaVersion,
        candidates: rows,
      });
      pushWorkspaceNotice(`Optimizer 후보 ${rows.length}개를 생성했습니다.`);
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "Optimizer 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningOptimize(false);
    }
  }

  function isTerminalOverallStatus(status: PlanningRunRecord["overallStatus"]): boolean {
    return status === "SUCCESS" || status === "PARTIAL_SUCCESS" || status === "FAILED";
  }

  async function pollRunUntilTerminal(runId: string, seed?: PlanningRunRecord): Promise<PlanningRunRecord | null> {
    let latest = seed ?? null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (!isMountedRef.current) return latest;
      if (latest?.stages) {
        setPipelineStatuses(buildStepStatusesFromRunStages(latest.stages));
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
  }

  function buildRunInputScenarioFromSelection(): RunInputScenario | undefined {
    const patches = createScenarioPatchesFromTemplate(scenarioTemplateId);
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
      title: SCENARIO_TEMPLATE_LABELS[scenarioTemplateId],
      ...(baselineRunId ? { baseRunId: baselineRunId } : {}),
      patch: patches,
    };
  }

  async function runPlanAction(options?: { scenario?: RunInputScenario }): Promise<void> {
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

    setRunning(true);
    setPipelineStatuses(createInitialStepStatuses());
    setSavedRun(null);

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
          input: buildRunInput(parsed, options?.scenario),
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
      const typedPayload = payload as ApiResponse<PlanningRunRecord>;
      const normalizationFromRunMeta = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
      if (normalizationFromRunMeta) {
        setLastNormalizationDisclosure(normalizationFromRunMeta);
      }

      const created = typedPayload.data;
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
      setRunResult(completedRunState.runResult);
      setSavedRun(finalRun);
      setPipelineStatuses(completedRunState.stepStatuses);
      if (selectedProfileId) {
        void loadBaselineRuns(selectedProfileId);
      }
      setActiveTab("summary");
      setShowAllActions(false);

      const runCompletedNotice = beginnerMode
        ? "첫 실행을 완료했습니다. 이제 리포트나 실행 내역에서 비교를 이어가세요."
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
      setRunning(false);
    }
  }

  async function runScenarioAction(): Promise<void> {
    const scenario = buildRunInputScenarioFromSelection();
    if (!scenario) {
      pushWorkspaceError("시나리오 템플릿을 먼저 선택하세요.");
      return;
    }
    await runPlanAction({ scenario });
  }

  async function syncProfileIfNeeded(): Promise<boolean> {
    if (!selectedProfileId) {
      pushWorkspaceError("저장할 프로필을 먼저 선택하세요.");
      return false;
    }

    if (profileValidation.errors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
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
  }

  function buildRunInput(parsed: ParsedRunInputs, scenario?: RunInputScenario): Record<string, unknown> {
    return {
      horizonMonths: parsed.horizon,
      policyId: parsed.policyId,
      assumptionsOverride: parsed.assumptions,
      runScenarios: effectiveRunScenariosEnabled,
      getActions: effectiveRunActionsEnabled,
      analyzeDebt: effectiveRunDebtEnabled,
      includeProducts: effectiveRunActionsEnabled ? parsed.actions.includeProducts : false,
      ...(parsed.snapshotId ? { snapshotId: parsed.snapshotId } : {}),
      ...(effectiveRunMonteCarloEnabled ? { monteCarlo: parsed.monteCarlo } : {}),
      ...(effectiveRunDebtEnabled ? {
        debtStrategy: {
          offers: parsed.debt.offers,
          options: parsed.debt.options,
        },
      } : {}),
      ...(scenario ? { scenario } : {}),
    };
  }

  async function persistRunAction(
    parsed: ParsedRunInputs,
    options?: { silent?: boolean; bypassWarningConfirmation?: boolean; scenario?: RunInputScenario },
  ): Promise<PlanningRunRecord | null> {
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

    setSavingRun(true);
    try {
      const synced = await syncProfileIfNeeded();
      if (!synced) return null;

      const res = await fetch("/api/planning/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          title: options?.scenario?.title ? `${runTitle} [What-if: ${options.scenario.title}]` : runTitle,
          input: buildRunInput(parsed, options?.scenario),
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (handleSnapshotNotFound(payload)) return null;
      const parsedPayload = parseApiPayload(locale, res, payload, "실행 기록 저장에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return null;
      }
      const typedPayload = payload as ApiResponse<PlanningRunRecord>;

      const saved = typedPayload.data ?? null;
      setSavedRun(saved);
      if (!options?.silent) {
        pushWorkspaceNotice(
          beginnerMode
            ? "결과 저장을 완료했습니다. 이제 리포트와 실행 기록에서 비교할 수 있습니다."
            : "실행 기록 저장을 완료했습니다. /planning/runs에서 비교할 수 있습니다.",
        );
      }
      return saved;
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "실행 기록 저장 중 오류가 발생했습니다.");
      return null;
    } finally {
      setSavingRun(false);
    }
  }

  async function saveRunAction(): Promise<void> {
    if (!runResult?.hasSimulateResult) {
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
    if (saveNeedsWarningConfirmation) {
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
  }

  async function submitPlanningFeedbackAction(): Promise<void> {
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
            ...(savedRun?.id ? { runId: savedRun.id } : {}),
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
  }

  const resultDto = runResult?.resultDto ?? null;

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
  const visibleActionRows = showAllActions ? actionTableRows : actionTableRows.slice(0, LIMITS.actionsTop);
  const omittedActionRows = Math.max(0, actionTableRows.length - visibleActionRows.length);
  const actionsTopForInsight = actionsVm.topActionsForInsight;

  const debtVm = buildWorkspaceDebtVm(resultDto);
  const debtMeta = debtVm.meta;
  const debtSummaries = debtVm.summaries;
  const debtRefinance = debtVm.refinance;
  const debtWarnings = debtVm.warnings;
  const debtWhatIfSummary = debtVm.whatIfSummary;
  const optimizeCandidates = optimizeResult?.candidates ?? [];

  const healthDisabledReason = healthGuard.disabledReason;
  const saveButtonDescribedBy = [
    preflightHasBlockers ? "planning-preflight-block-reason" : "",
    saveBlockedByHealth ? "planning-save-disabled-reason" : "",
    preflightWarnIssues.length > 0 ? "planning-save-warning-confirm-hint" : "",
  ].filter((item) => item.length > 0).join(" ") || undefined;

  const currentStepStatuses = running ? pipelineStatuses : (runResult?.stepStatuses ?? pipelineStatuses);
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
    beginnerMode,
    aggregatedWarnings,
    goalTableRows,
    timelineSummaryRows,
    chartPoints,
  });
  const scenariosDebugSections = buildWorkspaceScenarioDebugSections({
    beginnerMode,
    baseSummary: scenariosBaseSummary,
    comparisonRows: scenarioComparisonRows,
    baseWarnings: scenariosBaseWarnings,
  });
  const monteCarloDebugSections = buildWorkspaceMonteCarloDebugSections({
    beginnerMode,
    probabilities: monteProbabilities,
    endNetWorthKrw: monteEndNetWorth,
    worstCashKrw: monteWorstCash,
    ...(typeof monteDepletionProb === "number" ? { depletionProbability: monteDepletionProb } : {}),
  });
  const actionsDebugSections = buildWorkspaceActionsDebugSections({
    beginnerMode,
    topActionTitles,
    actionRows: actionTableRows,
  });
  const debtDebugSections = buildWorkspaceDebtDebugSections({
    beginnerMode,
    debtMeta,
    debtSummaries,
    debtRefinance,
    debtWhatIfSummary,
    debtWarnings,
  });

  const visibleSections = getVisibleSections(beginnerMode, {
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
  const beginnerStepProfileDone = isWorkspaceQuickStartProfileDone(profileForm, profileValidation.errors.length);
  const profileSyncState = useMemo(() => resolveWorkspaceSelectedProfileSyncState({
    selectedProfileId,
    selectedProfile: selectedProfile
      ? {
        name: selectedProfile.name,
        profile: selectedProfile.profile as Record<string, unknown>,
      }
      : null,
    profileForm,
    profileName,
    pendingSuggestionsCount: pendingSuggestions.length,
  }), [pendingSuggestions.length, profileForm, profileName, selectedProfile, selectedProfileId]);
  const currentProfileHashInput = useMemo(() => {
    if (profileSyncState === "missing" || profileSyncState === "unknown") return "";
    try {
      return stableStringifyWorkspaceValue(normalizeDraftWithDisclosure(
        toProfileJson(profileForm) as FormDraft,
        profileName,
      ).profile);
    } catch {
      return "";
    }
  }, [profileForm, profileName, profileSyncState]);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    function commitHashState(nextState: { input: string; hash: string }): void {
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
  }, [currentProfileHashInput]);
  const currentProfileHash = currentProfileHashState.input === currentProfileHashInput
    ? currentProfileHashState.hash
    : "";
  const runStatusReviewRequired = useMemo(() => {
    if (profileSyncState !== "saved" || !savedRun?.id || !selectedProfileId) return false;
    if (savedRun.profileId !== selectedProfileId) return false;
    if (!savedRun.reproducibility?.profileHash) return true;
    if (!currentProfileHashInput) return true;
    if (currentProfileHashState.input !== currentProfileHashInput) return true;
    return !currentProfileHashState.hash;
  }, [
    currentProfileHashInput,
    currentProfileHashState.hash,
    currentProfileHashState.input,
    profileSyncState,
    savedRun,
    selectedProfileId,
  ]);
  const runMatchesCurrentProfile = useMemo(() => {
    if (runStatusReviewRequired) return false;
    if (profileSyncState !== "saved" || !savedRun?.id || !selectedProfileId || !currentProfileHash) return false;
    return savedRun.profileId === selectedProfileId
      && savedRun.reproducibility?.profileHash === currentProfileHash;
  }, [currentProfileHash, profileSyncState, runStatusReviewRequired, savedRun, selectedProfileId]);
  const beginnerStepRunDone = Boolean(runResult?.hasSimulateResult) && runMatchesCurrentProfile;
  const beginnerStepSaveDone = Boolean(savedRun?.id) && runMatchesCurrentProfile;
  const quickStartVm = useMemo(() => buildWorkspaceQuickStartVm({
    selectedProfileId,
    profileSyncState,
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    runStatusReviewRequired,
    savedRunId: savedRun?.id,
    savedRunOverallStatus: savedRun?.overallStatus,
    reportsPageHref,
    selectedProfileReportHref: (runId) => appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(runId)}`, selectedProfileId),
    formatRunOverallStatus: formatRunOverallStatusKo,
  }), [
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    profileSyncState,
    reportsPageHref,
    runStatusReviewRequired,
    savedRun?.id,
    savedRun?.overallStatus,
    selectedProfileId,
  ]);
  const quickStartNextStep = useMemo(() => {
    if (profileSyncState === "missing") {
      return {
        label: "먼저 프로필 저장",
        description: "아래 프로필 영역에서 새로 만들기를 누르면 저장 직후 첫 실행 시작으로 이어집니다.",
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
        description: "아래 간단 진행 카드의 첫 실행 시작을 누르면 요약, 액션, 경고를 한 번에 계산합니다.",
        targetId: "planning-quickstart-run-cta",
      };
    }
    if (!quickStartVm.beginnerStepSaveDone) {
      return {
        label: "이제 결과 저장",
        description: "첫 실행이 끝났습니다. 아래 결과 저장 버튼으로 현재 상태를 보관하면 비교와 리포트로 이어집니다.",
        targetId: "planning-quickstart-save-run-button",
      };
    }
    return {
      label: "리포트 보기",
      description: "저장까지 끝났습니다. 아래 리포트 버튼으로 결과와 비교 화면을 이어서 볼 수 있습니다.",
      targetId: "planning-quickstart-report-button",
    };
  }, [
    profileSyncState,
    quickStartVm.beginnerStepRunDone,
    quickStartVm.beginnerStepSaveDone,
    quickStartVm.runStatusReviewRequired,
  ]);

  useEffect(() => {
    if (visibleSections.includes(activeTab)) return;
    setActiveTab("summary");
  }, [activeTab, visibleSections]);

  return (
    <PageShell>
      <PageHeader
        title={t(locale, "PLANNING_TITLE")}
        description={t(locale, "PLANNING_DESC")}
        action={(
          <div className={bodyDenseActionRowClassName}>
            <label className={`flex items-center gap-2 text-xs ${bodyLabelClassName}`}>
              프로필
              <select
                className={bodyCompactFieldClassName}
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                {profiles.length === 0 ? <option value="">없음</option> : null}
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setFeedbackModalOpen(true)}
            >
              피드백 보내기
            </Button>
            <a
              className={bodyActionLinkClassName}
              data-profile-state={runsLinkProfileState}
              data-ready={runsLinkReady ? "true" : "false"}
              data-testid="planning-runs-link"
              href={runsPageHref}
              onClick={(event) => {
                if (event.defaultPrevented) return;
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                event.preventDefault();
                window.location.assign(runsPageHref);
              }}
            >
              실행 기록
            </a>
            <BodyActionLink href={reportsPageHref} prefetch={false}>리포트</BodyActionLink>
          </div>
        )}
      />

      {feedbackToast ? (
        <BodyStatusInset className="mb-4 py-3 text-sm font-semibold" tone="success">
          {feedbackToast}
        </BodyStatusInset>
      ) : null}
      {workspaceError ? (
        <BodyStatusInset className="mb-4 py-3 text-sm font-semibold whitespace-pre-line" tone="danger">
          {workspaceError}
        </BodyStatusInset>
      ) : null}
      {workspaceNotice ? (
        <BodyStatusInset className="mb-4 py-3 text-sm font-semibold whitespace-pre-line" tone="default">
          {workspaceNotice}
        </BodyStatusInset>
      ) : null}

      <BodyStatusInset className="mb-6" tone="warning">
        <p className="text-sm font-semibold text-amber-900">{t(locale, "DISCLAIMER_TITLE")}</p>
        <p className="mt-1 text-xs text-amber-800">{t(locale, "DISCLAIMER_BODY")}</p>
      </BodyStatusInset>

      {beginnerMode ? (
        <PlanningQuickStartGate
          disabled={savingProfile || running || savingRun}
          nextStepDescription={quickStartNextStep.description}
          nextStepLabel={quickStartNextStep.label}
          nextStepTargetId={quickStartNextStep.targetId}
          profileSyncState={profileSyncState}
          runStatusReviewRequired={quickStartVm.runStatusReviewRequired}
          runDone={quickStartVm.beginnerStepRunDone}
          saveDone={quickStartVm.beginnerStepSaveDone}
          onApply={applyQuickStartAction}
        />
      ) : null}

      <Card className={`mb-6 border ${quickStartVm.tone}`} data-testid="planning-workspace-quickstart-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">간단 진행</p>
            <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950">{quickStartVm.title}</h2>
            <p className="mt-2 text-sm text-slate-700">{quickStartVm.description}</p>
            <div className={`mt-3 text-xs text-slate-600 ${bodyDenseActionRowClassName}`}>
              <span className={bodyMetaChipClassName}>
                프로필 {selectedProfile ? selectedProfile.name : "미선택"}
              </span>
              <span className={bodyMetaChipClassName}>
                스냅샷 {selectedSnapshotItem?.id ?? "latest"}
              </span>
              <span className={bodyMetaChipClassName}>
                사전 점검 {preflightHasBlockers ? `차단 ${preflightBlockIssues.length}` : preflightWarnIssues.length > 0 ? `경고 ${preflightWarnIssues.length}` : "정상"}
              </span>
              <span className={bodyMetaChipClassName}>
                최근 저장 {savedRun ? formatRunOverallStatusKo(savedRun.overallStatus) : "없음"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {profiles.length < 1 ? (
              <Button disabled={savingProfile || running || savingRun} onClick={loadSampleProfileAction} variant="primary">
                샘플 프로필 불러오기
              </Button>
            ) : null}
            {selectedProfileId && !quickStartVm.beginnerStepRunDone && !quickStartVm.runStatusReviewRequired ? (
              <Button
                data-testid="planning-quickstart-run-cta"
                disabled={running || preflightHasBlockers}
                id="planning-quickstart-run-cta"
                onClick={() => void runPlanAction()}
                variant="primary"
              >
                {running ? "실행 중..." : "첫 실행 시작"}
              </Button>
            ) : null}
            {selectedProfileId && quickStartVm.beginnerStepRunDone && !quickStartVm.beginnerStepSaveDone ? (
              <Button
                aria-describedby={saveButtonDescribedBy}
                data-testid="planning-quickstart-save-run-button"
                disabled={savingRun || saveBlockedByHealth || preflightHasBlockers || saveNeedsWarningConfirmation}
                id="planning-quickstart-save-run-button"
                onClick={() => void saveRunAction()}
                variant="primary"
              >
                {savingRun ? "저장 중..." : "결과 저장"}
              </Button>
            ) : null}
            <Link href={runsPageHref}>
              <Button
                data-testid="planning-quickstart-runs-link"
                id="planning-quickstart-runs-link"
                variant={quickStartVm.runStatusReviewRequired ? "primary" : "outline"}
              >
                실행 내역
              </Button>
            </Link>
            {quickStartVm.beginnerStepSaveDone ? (
              <Link href={quickStartVm.selectedRunReportHref}>
                <Button data-testid="planning-quickstart-report-button" id="planning-quickstart-report-button" variant="outline">리포트</Button>
              </Link>
            ) : (
              <Button disabled title="실행 결과를 저장하면 리포트를 열 수 있습니다." variant="outline">리포트는 저장 후</Button>
            )}
          </div>
        </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <BodyInset className="bg-white/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">월 잉여금</p>
              <p className="mt-1 text-base font-black text-slate-950">{formatKrw(locale, liveSummary.monthlySurplus)}</p>
              <p className="mt-1 text-xs text-slate-600">실수령에서 필수/선택지출을 뺀 값</p>
            </BodyInset>
            <BodyInset className="bg-white/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">비상금 버팀력</p>
              <p className="mt-1 text-base font-black text-slate-950">{beginnerEmergencyMonths}개월</p>
              <p className="mt-1 text-xs text-slate-600">6개월 목표 대비 부족액 {formatKrw(locale, liveSummary.emergencyGapKrw)}</p>
            </BodyInset>
            <BodyInset className="bg-white/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">부채 부담</p>
              <p className="mt-1 text-base font-black text-slate-950">{profileForm.debts.length}건</p>
              <p className="mt-1 text-xs text-slate-600">월 상환 {formatKrw(locale, liveSummary.totalMonthlyDebtPayment)} · DSR {formatPct(locale, liveSummary.dsrPct)}</p>
            </BodyInset>
            <BodyInset className="bg-white/90 px-4 py-3" data-testid="planning-workspace-quickstart-status">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">완료 상태</p>
              <p className="mt-1 text-base font-black text-slate-950">{quickStartVm.completedSummary}</p>
              <p className="mt-2 text-xs font-semibold text-slate-600">다음 단계 · {quickStartVm.nextStepSummary}</p>
            </BodyInset>
          </div>
      </Card>

      <Card className="mb-6">
        <label className={bodyChoiceRowClassName}>
          <input
            checked={beginnerMode}
            onChange={(event) => setBeginnerMode(event.target.checked)}
            type="checkbox"
          />
          초보자 모드
        </label>
      </Card>
      {beginnerMode ? (
        <BodyInset className="mb-6">
          <p className="text-xs font-semibold text-slate-800">5분 진행 안내</p>
          <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
            {quickStartVm.progressItems.map((item) => (
              <p key={item.label} className={`rounded-lg border px-3 py-2 ${quickStartProgressToneClassName(item.state)}`}>
                {item.label} · {item.stateLabel}
              </p>
            ))}
          </div>
        </BodyInset>
      ) : null}

      {beginnerMode ? (
        <PlanningOnboardingWizard
          disabled={savingProfile || running || savingRun}
          onApply={applyWizardOutputAction}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileV2Form modeLabel={beginnerMode ? "초보자 모드" : "고급 모드"}>

          {loadingProfiles && profiles.length < 1 ? (
            <LoadingState
              title="프로필 목록을 불러오는 중입니다"
              description="저장된 프로필을 확인하고 있습니다."
              testId="planning-profiles-loading-state"
            />
          ) : null}
          {profilesLoadError ? (
            <ErrorState
              message={profilesLoadError}
              retryLabel="다시 불러오기"
              onRetry={() => {
                void loadProfiles(selectedProfileId);
              }}
              testId="planning-profiles-error-state"
            />
          ) : null}
          {!loadingProfiles && !profilesLoadError && profiles.length < 1 ? (
            <EmptyState
              actionLabel="샘플 프로필 불러오기"
              description="저장된 프로필이 없습니다. 샘플을 불러온 뒤 저장해서 시작할 수 있습니다."
              icon="data"
              onAction={loadSampleProfileAction}
              title="저장된 프로필이 없습니다"
            />
          ) : null}

          <label className={`block text-xs ${bodyLabelClassName}`}>
            프로필 선택
            <select
              className={bodyFieldClassName}
              aria-label="프로필 선택"
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              {profiles.length === 0 ? <option value="">저장된 프로필 없음</option> : null}
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>

          <label className={`block text-xs ${bodyLabelClassName}`}>
            프로필 이름
            <input
              className={bodyFieldClassName}
              value={profileName}
              onChange={(event) => {
                setProfileName(event.target.value);
                updateProfileField("name", event.target.value);
              }}
            />
          </label>

          <BodyInset className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-700">혜택 추천용 기본 조건</p>
              <p className="mt-1 text-[11px] text-slate-500">출생연도, 성별, 지역을 입력하면 보조금24 추천 범위를 더 좁힐 수 있습니다.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                출생연도
                <input
                  className={bodyFieldClassName}
                  inputMode="numeric"
                  placeholder="예: 1994"
                  type="text"
                  value={profileForm.birthYear ? String(profileForm.birthYear) : ""}
                  onChange={(event) => {
                    const raw = normalizeLooseNumberText(event.target.value).replace(/\D/g, "");
                    updateProfileField("birthYear", raw ? Math.trunc(Number(raw)) : undefined);
                  }}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                성별
                <select
                  className={bodyFieldClassName}
                  value={profileForm.gender ?? ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    updateProfileField("gender", next === "" ? undefined : next as "M" | "F");
                  }}
                >
                  <option value="">선택 안 함</option>
                  <option value="F">여성</option>
                  <option value="M">남성</option>
                </select>
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                시/도
                <select
                  className={bodyFieldClassName}
                  value={profileForm.sido ?? ""}
                  onChange={(event) => {
                    const nextSido = event.target.value;
                    applyProfileForm({
                      ...profileForm,
                      sido: nextSido || "",
                      sigungu: "",
                    });
                  }}
                >
                  <option value="">선택 안 함</option>
                  {SIDO_ADMIN_2025.map((entry) => (
                    <option key={entry.code} value={entry.name}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                시/군/구
                <select
                  className={bodyFieldClassName}
                  disabled={!profileForm.sido}
                  value={profileForm.sigungu ?? ""}
                  onChange={(event) => updateProfileField("sigungu", event.target.value || "")}
                >
                  <option value="">선택 안 함</option>
                  {benefitSigunguOptions.map((entry) => (
                    <option key={entry.code} value={entry.name}>{entry.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </BodyInset>

          <BodyInset className="space-y-4">
            <p className="text-xs font-semibold text-slate-700">월 현금흐름</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                월 실수령
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={bodyFieldClassName.replace("mt-1 ", "")}
                    inputMode="numeric"
                    type="text"
                    placeholder="예: 5,100,000"
                    value={formatGroupedIntegerInput(profileForm.monthlyIncomeNet)}
                    onChange={(event) => updateProfileField("monthlyIncomeNet", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                필수지출
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={bodyFieldClassName.replace("mt-1 ", "")}
                    inputMode="numeric"
                    type="text"
                    placeholder="예: 2,200,000"
                    value={formatGroupedIntegerInput(profileForm.monthlyEssentialExpenses)}
                    onChange={(event) => updateProfileField("monthlyEssentialExpenses", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                선택지출
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={bodyFieldClassName.replace("mt-1 ", "")}
                    inputMode="numeric"
                    type="text"
                    placeholder="예: 900,000"
                    value={formatGroupedIntegerInput(profileForm.monthlyDiscretionaryExpenses)}
                    onChange={(event) => updateProfileField("monthlyDiscretionaryExpenses", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
            </div>
          </BodyInset>

          <BodyInset className="space-y-4">
            <p className="text-xs font-semibold text-slate-700">자산</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                현금(예금)
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={bodyFieldClassName.replace("mt-1 ", "")}
                    inputMode="numeric"
                    type="text"
                    placeholder="예: 12,000,000"
                    value={formatGroupedIntegerInput(profileForm.liquidAssets)}
                    onChange={(event) => updateProfileField("liquidAssets", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                투자자산
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={bodyFieldClassName.replace("mt-1 ", "")}
                    inputMode="numeric"
                    type="text"
                    placeholder="예: 18,000,000"
                    value={formatGroupedIntegerInput(profileForm.investmentAssets)}
                    onChange={(event) => updateProfileField("investmentAssets", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
            </div>
          </BodyInset>

          <BodyInset className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">부채 리스트</p>
              <Button
                disabled={beginnerMode && profileForm.debts.length >= BEGINNER_MAX_DEBT_ROWS}
                onClick={addDebtRow}
                size="sm"
                variant="outline"
              >
                부채 추가
              </Button>
            </div>
            {beginnerMode ? (
              <p className="text-xs text-slate-500">초보자 모드는 부채 1~3개 입력을 권장합니다.</p>
            ) : null}
            {profileForm.debts.length === 0 ? (
              <BodyEmptyState
                description="부채가 없다면 비워두고 진행해도 됩니다. 주택담보대출, 신용대출, 카드론처럼 월 상환이 있는 항목만 추가하세요."
                title="등록된 부채가 없습니다."
              />
            ) : (
              <div className="space-y-3">
                {profileForm.debts.map((debt, index) => {
                  const estimated = estimateDebtMonthlyPaymentKrw(debt);
                  return (
                    <BodyInset className="bg-white" key={debt.id || `debt-${index}`}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={`block text-xs ${bodyLabelClassName}`}>
                          부채 ID
                          <input
                            className={bodyFieldClassName}
                            value={debt.id}
                            onChange={(event) => updateDebtRow(index, { ...debt, id: event.target.value })}
                          />
                        </label>
                        <label className={`block text-xs ${bodyLabelClassName}`}>
                          이름
                          <input
                            className={bodyFieldClassName}
                            value={debt.name}
                            onChange={(event) => updateDebtRow(index, { ...debt, name: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <label className={`block text-xs ${bodyLabelClassName}`}>
                          대출 잔액
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className={bodyCompactFieldClassName}
                              inputMode="numeric"
                              type="text"
                              placeholder="예: 25,000,000"
                              value={formatGroupedIntegerInput(debt.balance)}
                              onChange={(event) => updateDebtRow(index, { ...debt, balance: toFiniteNumber(event.target.value) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(원)</span>
                          </div>
                        </label>
                        <label className={`block text-xs ${bodyLabelClassName}`}>
                          금리
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className={bodyCompactFieldClassName}
                              type="number"
                              placeholder="예: 4.8"
                              value={debt.aprPct}
                              onChange={(event) => updateDebtRow(index, { ...debt, aprPct: toFiniteNumber(event.target.value) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(%)</span>
                          </div>
                        </label>
                        <label className={`block text-xs ${bodyLabelClassName}`}>
                          최소 상환액
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className={bodyCompactFieldClassName}
                              inputMode="numeric"
                              type="text"
                              min={0}
                              placeholder="예: 650,000"
                              value={formatGroupedIntegerInput(debt.monthlyPayment)}
                              onChange={(event) => updateDebtRow(index, { ...debt, monthlyPayment: Math.max(0, toFiniteNumber(event.target.value)) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(원)</span>
                          </div>
                        </label>
                      </div>
                      <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">상환 조건(고급)</summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <label className={`block text-xs ${bodyLabelClassName}`}>
                            상환 방식
                            <select
                              className={bodyFieldClassName}
                              value={debt.repaymentType}
                              onChange={(event) => updateDebtRow(index, {
                                ...debt,
                                repaymentType: event.target.value === "interestOnly" ? "interestOnly" : "amortizing",
                              })}
                            >
                              <option value="amortizing">원리금 분할상환</option>
                              <option value="interestOnly">이자만 상환</option>
                            </select>
                          </label>
                          <label className={`block text-xs ${bodyLabelClassName}`}>
                            남은 개월
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                className={bodyCompactFieldClassName}
                                type="number"
                                min={1}
                                placeholder="예: 60"
                                value={debt.remainingMonths}
                                onChange={(event) => updateDebtRow(index, { ...debt, remainingMonths: Math.max(1, Math.trunc(toFiniteNumber(event.target.value, 1))) })}
                              />
                              <span className="text-[11px] font-medium text-slate-500">(개월)</span>
                            </div>
                          </label>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                          <p>추정 월상환액(참고): <span className="font-semibold">{formatKrw(locale, estimated)}</span></p>
                          <Button
                            aria-label={`부채 ${index + 1} 추정 월상환액 적용`}
                            onClick={() => updateDebtRow(index, { ...debt, monthlyPayment: estimated })}
                            size="sm"
                            variant="outline"
                          >
                            추정치 적용
                          </Button>
                        </div>
                      </details>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-slate-600">입력 월상환액: <span className="font-semibold">{formatKrw(locale, debt.monthlyPayment)}</span></p>
                        <Button
                          aria-label={`부채 ${index + 1} 삭제`}
                          disabled={beginnerMode && profileForm.debts.length <= 1}
                          onClick={() => removeDebtRow(index)}
                          size="sm"
                          variant="ghost"
                        >
                          삭제
                        </Button>
                      </div>
                    </BodyInset>
                  );
                })}
              </div>
            )}
          </BodyInset>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">목표</p>
            {beginnerMode ? (
              <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <label className="block text-xs font-semibold text-slate-600">
                  비상금 목표(개월)
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                    min={1}
                    type="number"
                    value={beginnerEmergencyMonths}
                    onChange={(event) => {
                      const months = Math.max(1, Math.trunc(toFiniteNumber(event.target.value, beginnerEmergencyMonths)));
                      const monthlyExpenses = Math.max(0, profileForm.monthlyEssentialExpenses + profileForm.monthlyDiscretionaryExpenses);
                      updateBeginnerGoal("emergency", {
                        targetAmount: Math.round(monthlyExpenses * months),
                      });
                    }}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    목돈 목표 금액(KRW)
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                      min={0}
                      inputMode="numeric"
                      type="text"
                      value={formatGroupedIntegerInput(beginnerGoals.lumpSum.targetAmount)}
                      onChange={(event) => updateBeginnerGoal("lumpSum", { targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    목돈 목표 시점
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                      type="month"
                      value={monthOffsetToInput(beginnerGoals.lumpSum.targetMonth)}
                      onChange={(event) => updateBeginnerGoal("lumpSum", { targetMonth: inputToMonthOffset(event.target.value) })}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    은퇴 목표 금액(KRW)
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                      min={0}
                      inputMode="numeric"
                      type="text"
                      value={formatGroupedIntegerInput(beginnerGoals.retirement.targetAmount)}
                      onChange={(event) => updateBeginnerGoal("retirement", { targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    은퇴 목표 시점
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                      type="month"
                      value={monthOffsetToInput(beginnerGoals.retirement.targetMonth)}
                      onChange={(event) => updateBeginnerGoal("retirement", { targetMonth: inputToMonthOffset(event.target.value) })}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <BodyInset className="space-y-2 rounded-lg border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">목표 목록</p>
                  <Button onClick={addGoalRow} size="sm" variant="outline">목표 추가</Button>
                </div>
                {profileForm.goals.length === 0 ? (
                  <BodyEmptyState
                    description="비상금 외에 목돈 마련이나 은퇴 목표가 있다면 추가해 두면 결과 화면에서 달성 가능성을 함께 비교할 수 있습니다."
                    title="등록된 목표가 없습니다."
                  />
                ) : (
                  <div className="space-y-2">
                    {profileForm.goals.map((goal, index) => (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1fr_1fr_1fr_0.8fr_1fr_auto]" key={goal.id || `goal-${index}`}>
                          <input
                            aria-label={`목표 ${index + 1} ID`}
                            className={bodyCompactFieldClassName}
                            value={goal.id}
                            onChange={(event) => updateGoalRow(index, { ...goal, id: event.target.value })}
                            placeholder="goal-id"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 이름`}
                            className={bodyCompactFieldClassName}
                            value={goal.name}
                            onChange={(event) => updateGoalRow(index, { ...goal, name: event.target.value })}
                            placeholder="목표 이름"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 목표 금액`}
                            className={bodyCompactFieldClassName}
                            inputMode="numeric"
                            type="text"
                            value={formatGroupedIntegerInput(goal.targetAmount)}
                            onChange={(event) => updateGoalRow(index, { ...goal, targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="목표 금액"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 현재 금액`}
                            className={bodyCompactFieldClassName}
                            inputMode="numeric"
                            type="text"
                            value={formatGroupedIntegerInput(goal.currentAmount)}
                            onChange={(event) => updateGoalRow(index, { ...goal, currentAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="현재 금액"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 목표 시점`}
                            className={bodyCompactFieldClassName}
                            type="month"
                            value={monthOffsetToInput(goal.targetMonth)}
                            onChange={(event) => updateGoalRow(index, { ...goal, targetMonth: inputToMonthOffset(event.target.value) })}
                          />
                          <input
                            aria-label={`목표 ${index + 1} 우선순위`}
                            className={bodyCompactFieldClassName}
                            type="number"
                            min={1}
                            value={goal.priority}
                            onChange={(event) => updateGoalRow(index, { ...goal, priority: Math.max(1, Math.trunc(toFiniteNumber(event.target.value, 1))) })}
                            placeholder="우선순위(1~10)"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 최소 월 납입`}
                            className={bodyCompactFieldClassName}
                            inputMode="numeric"
                            type="text"
                            min={0}
                            value={formatGroupedIntegerInput(goal.minimumMonthlyContribution)}
                            onChange={(event) => updateGoalRow(index, { ...goal, minimumMonthlyContribution: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="최소 월 납입"
                          />
                          <Button aria-label={`목표 ${index + 1} 삭제`} onClick={() => removeGoalRow(index)} size="sm" variant="ghost">삭제</Button>
                        </div>
                      ))}
                    </div>
                )}
              </BodyInset>
            )}
          </div>

          <BodyStatusInset className="grid gap-2 text-xs" tone="success">
            <p>월 잉여: <span className="font-semibold">{formatKrw(locale, liveSummary.monthlySurplus)}</span></p>
            <p>DSR(월부채상환/수입): <span className="font-semibold">{formatPct(locale, liveSummary.dsrPct)}</span></p>
            <p>총 월상환액: <span className="font-semibold">{formatKrw(locale, liveSummary.totalMonthlyDebtPayment)}</span></p>
            <p>비상금 목표액(6개월): <span className="font-semibold">{formatKrw(locale, liveSummary.emergencyTargetKrw)}</span></p>
            <p>비상금 부족분: <span className="font-semibold">{formatKrw(locale, liveSummary.emergencyGapKrw)}</span></p>
          </BodyStatusInset>

          {profileValidation.errors.length > 0 ? (
            <BodyStatusInset tone="danger">
              <p className="font-semibold">입력 오류 ({profileValidation.errors.length})</p>
              {profileValidation.errors.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </BodyStatusInset>
          ) : null}

          {profileValidation.warnings.length > 0 ? (
            <BodyStatusInset tone="warning">
              <p className="font-semibold">입력 경고 ({profileValidation.warnings.length})</p>
              {profileValidation.warnings.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </BodyStatusInset>
          ) : null}

          <details className="rounded-xl border border-slate-200 p-3" data-testid="planning-advanced-panel">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700" data-testid="planning-advanced-toggle">고급(개발자): Profile JSON</summary>
            <label className={`mt-3 block text-xs ${bodyLabelClassName}`}>
              편집 (JSON)
              <textarea
                className={bodyTextAreaClassName}
                data-testid="planning-json-editor"
                value={profileJsonDraft}
                onChange={(event) => replaceProfileFromJsonText(event.target.value)}
              />
              {profileJsonError ? <p className="mt-2 text-xs text-rose-700">{profileJsonError}</p> : null}
            </label>
            <div className={`mt-3 ${bodyDenseActionRowClassName}`}>
              <Button onClick={() => applyProfileJsonEditorAction()} size="sm" variant="outline">Apply JSON</Button>
              <Button onClick={() => void copyProfileJsonEditorAction()} size="sm" variant="ghost">Copy</Button>
            </div>
          </details>

          {pendingSuggestions.length > 0 ? (
            <BodyStatusInset className="space-y-3 text-xs" tone="warning">
              <p className="font-semibold">입력 정규화 제안 ({pendingSuggestions.length})</p>
              <p className="text-amber-800">선택한 항목만 반영해 저장합니다. 선택하지 않으면 원본 그대로 저장됩니다.</p>
              <div className="space-y-2">
                {pendingSuggestions.map((suggestion) => (
                  <label className={bodyChoiceRowClassName} key={suggestion.code}>
                    <input
                      checked={acceptedSuggestionCodes.includes(suggestion.code)}
                      onChange={(event) => toggleSuggestionCode(suggestion.code, event.target.checked)}
                      type="checkbox"
                    />
                    <span>[{formatSeverityKo(suggestion.severity)}] {suggestion.message}</span>
                  </label>
                ))}
              </div>
              <div className={bodyDenseActionRowClassName}>
                <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void applySuggestedProfileSaveAction()} size="sm" variant="primary">선택 적용 후 저장</Button>
                <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void continueProfileSaveWithoutSuggestionsAction()} size="sm" variant="outline">변경 없이 저장</Button>
                <Button disabled={savingProfile} onClick={() => clearPendingSuggestions()} size="sm" variant="ghost">취소</Button>
              </div>
            </BodyStatusInset>
          ) : null}

          <div className={bodyDenseActionRowClassName}>
            <Button data-testid="planning-profile-create-button" disabled={savingProfile} id="planning-profile-create-button" onClick={() => beginProfileSave("create")} variant="primary">새로 만들기</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("duplicate")} variant="outline">복제</Button>
            <Button data-testid="planning-profile-update-button" disabled={savingProfile || !selectedProfileId} id="planning-profile-update-button" onClick={() => beginProfileSave("update")} variant="outline">저장</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => void deleteProfileAction()} variant="ghost">삭제</Button>
            <Button data-testid="planning-profile-refresh-button" disabled={loadingProfiles} id="planning-profile-refresh-button" onClick={() => void loadProfiles(selectedProfileId)} variant="ghost">목록 새로고침</Button>
            <Button disabled={savingProfile} onClick={loadSampleProfileAction} variant="ghost">샘플 프로필 불러오기</Button>
          </div>
        </ProfileV2Form>

        <Card className="space-y-4">
          <BodySectionHeading
            description="기본값만으로도 실행 가능합니다."
            title="실행 옵션"
          />

          <SnapshotPicker
            advancedEnabled={!beginnerMode}
            items={availableSnapshotItems}
            value={effectiveSnapshotSelection}
            onChange={(next) => setSnapshotSelection(next)}
          />
          {snapshotItemsWarning ? (
            <p className="text-xs text-amber-700">{snapshotItemsWarning}</p>
          ) : null}

          <label className={`block text-xs ${bodyLabelClassName}`}>
            분배 정책
            <select
              className={bodyFieldClassName}
              value={policyId}
              onChange={(event) => setPolicyId(event.target.value as AllocationPolicyId)}
            >
              {ALLOCATION_POLICIES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className={`block text-xs ${bodyLabelClassName}`}>
            실행 제목
            <input
              className={bodyFieldClassName}
              value={runTitle}
              onChange={(event) => setRunTitle(event.target.value)}
            />
          </label>

          <label className={`block text-xs ${bodyLabelClassName}`}>
            기간 (개월)
            {beginnerMode ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={horizonMonths === "120" ? "primary" : "outline"}
                  onClick={() => setHorizonMonths("120")}
                >
                  10년 (120)
                </Button>
                <Button
                  size="sm"
                  variant={horizonMonths === "360" ? "primary" : "outline"}
                  onClick={() => setHorizonMonths("360")}
                >
                  30년 (360)
                </Button>
              </div>
            ) : (
              <input
                className={bodyFieldClassName}
                value={horizonMonths}
                onChange={(event) => setHorizonMonths(event.target.value)}
              />
            )}
          </label>

          {!beginnerMode ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setHorizonMonths("120")}>120</Button>
              <Button size="sm" variant="outline" onClick={() => setHorizonMonths("360")}>360</Button>
            </div>
          ) : null}

          {!beginnerMode ? (
            <BodyInset className="space-y-3">
              <p className="text-xs font-semibold text-slate-700">가정(Assumptions) override</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  인플레이션(%)
                  <input
                    className={bodyFieldClassName}
                    type="number"
                    value={assumptionsForm.inflationPct}
                    onChange={(event) => updateAssumptionsField("inflationPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.inflationPct))}
                  />
                </label>
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  기대수익률(%)
                  <input
                    className={bodyFieldClassName}
                    type="number"
                    value={assumptionsForm.expectedReturnPct}
                    onChange={(event) => updateAssumptionsField("expectedReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct))}
                  />
                </label>
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  현금수익률(%)
                  <input
                    className={bodyFieldClassName}
                    type="number"
                    value={assumptionsForm.cashReturnPct}
                    onChange={(event) => updateAssumptionsField("cashReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.cashReturnPct))}
                  />
                </label>
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  인출률(%)
                  <input
                    className={bodyFieldClassName}
                    type="number"
                    value={assumptionsForm.withdrawalRatePct}
                    onChange={(event) => updateAssumptionsField("withdrawalRatePct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct))}
                  />
                </label>
              </div>
            </BodyInset>
          ) : null}

          {beginnerMode ? (
            <BodyInset className="text-xs text-slate-700">
              <p>시나리오: ON</p>
              <p>Monte Carlo: OFF</p>
              <p>Actions: ON (상품 후보 OFF)</p>
              <p>Debt 분석: ON</p>
            </BodyInset>
          ) : (
            <div className="grid gap-2 text-sm">
              <label className={bodyChoiceRowClassName}>
                <input checked={runScenariosEnabled} onChange={(event) => setRunScenariosEnabled(event.target.checked)} type="checkbox" />
                시나리오 실행
              </label>
              {!monteCarloServerDisabled ? (
                <label className={bodyChoiceRowClassName}>
                  <input checked={runMonteCarloEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunMonteCarloEnabled(event.target.checked)} type="checkbox" />
                  몬테카를로 실행
                </label>
              ) : null}
              <label className={bodyChoiceRowClassName}>
                <input checked={runActionsEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunActionsEnabled(event.target.checked)} type="checkbox" />
                실행 계획 생성
              </label>
              <label className={bodyChoiceRowClassName}>
                <input checked={runDebtEnabled} onChange={(event) => setRunDebtEnabled(event.target.checked)} type="checkbox" />
                부채 분석
              </label>
              {!optimizerServerDisabled ? (
                <label className={bodyChoiceRowClassName}>
                  <input checked={runOptimizeEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunOptimizeEnabled(event.target.checked)} type="checkbox" />
                  실험용 최적화
                </label>
              ) : null}
            </div>
          )}

          {!beginnerMode && monteCarloServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 비활성화됨: Monte Carlo</p>
          ) : null}
          {!beginnerMode && includeProductsServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 비활성화됨: 상품 후보 포함</p>
          ) : null}
          {!beginnerMode && optimizerServerDisabled ? (
            <p className="text-xs text-amber-700">서버 설정으로 비활성화됨: Optimizer</p>
          ) : null}

          {!beginnerMode && runMonteCarloEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                몬테카를로 paths
                <input className={bodyFieldClassName} value={monteCarloPaths} onChange={(event) => setMonteCarloPaths(event.target.value)} />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                몬테카를로 seed
                <input className={bodyFieldClassName} value={monteCarloSeed} onChange={(event) => setMonteCarloSeed(event.target.value)} />
              </label>
            </div>
          ) : null}

          {!beginnerMode && runActionsEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              {!includeProductsServerDisabled ? (
                <label className={bodyChoiceRowClassName}>
                  <input checked={includeProducts} disabled={saveBlockedByHealth} onChange={(event) => setIncludeProducts(event.target.checked)} type="checkbox" />
                  상품 후보 포함
                </label>
              ) : <div />}
              <label className={`block text-xs ${bodyLabelClassName}`}>
                후보 최대 개수
                <input className={bodyFieldClassName} value={maxCandidatesPerAction} onChange={(event) => setMaxCandidatesPerAction(event.target.value)} />
              </label>
            </div>
          ) : null}

          {effectiveRunDebtEnabled ? (
            <BodyInset className="space-y-3">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                부채 추가상환 금액(KRW)
                <input
                  className={bodyFieldClassName}
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(toFiniteNumber(debtExtraPaymentKrw, 0))}
                  onChange={(event) => setDebtExtraPaymentKrw(event.target.value)}
                />
              </label>
              {!beginnerMode ? (
                <BodyInset className="space-y-2 rounded-lg border-slate-100 bg-white">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">리파이낸스 제안</p>
                    <Button onClick={addDebtOfferRow} size="sm" variant="outline">제안 추가</Button>
                  </div>
                  {debtOfferRows.length === 0 ? (
                    <BodyEmptyState
                      description="현재 부채를 다른 조건으로 갈아탈 가능성이 있을 때만 입력하세요. 없으면 비워두고 계산해도 됩니다."
                      title="리파이낸스 제안을 입력하지 않았습니다."
                    />
                  ) : (
                    <div className="space-y-2">
                      {debtOfferRows.map((row, index) => (
                        <div className="grid gap-2 sm:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_auto]" key={row.rowId}>
                          <select
                            className={bodyCompactFieldClassName}
                            value={row.liabilityId}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, liabilityId: event.target.value })}
                          >
                            <option value="">부채 선택</option>
                            {debtLiabilityOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.id} ({option.label})</option>
                            ))}
                          </select>
                          <input
                            className={bodyCompactFieldClassName}
                            value={row.title}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, title: event.target.value })}
                            placeholder="제안 제목(선택)"
                          />
                          <input
                            className={bodyCompactFieldClassName}
                            type="number"
                            value={row.newAprPct}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, newAprPct: toFiniteNumber(event.target.value) })}
                            placeholder="신규 금리(%)"
                          />
                          <input
                            className={bodyCompactFieldClassName}
                            inputMode="numeric"
                            type="text"
                            value={formatGroupedIntegerInput(row.feeKrw)}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, feeKrw: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="수수료(KRW)"
                          />
                          <Button aria-label={`리파이낸스 제안 ${index + 1} 삭제`} onClick={() => removeDebtOfferRow(index)} size="sm" variant="ghost">삭제</Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {debtOfferInvalidIds.length > 0 ? (
                    <BodyStatusInset className="text-xs" tone="warning">
                      <p className="font-semibold">DEBT_OFFER_LIABILITY_NOT_FOUND</p>
                      <p className="mt-1">다음 liabilityId가 현재 프로필 부채 목록에 없습니다: {debtOfferInvalidIds.join(", ")}</p>
                    </BodyStatusInset>
                  ) : null}
                </BodyInset>
              ) : null}
            </BodyInset>
          ) : null}

          {!beginnerMode && runOptimizeEnabled ? (
            <BodyInset className="space-y-3 border-indigo-200 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-900">실험용 최적화기</p>
              <p className="text-xs text-indigo-800">후보 전략 2~5개를 비교만 제공합니다. 자동 적용은 하지 않습니다.</p>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                Optimizer 제약 JSON
                <textarea
                  className={`${bodyTextAreaClassName} min-h-[90px]`}
                  value={optimizerConstraintsJson}
                  onChange={(event) => setOptimizerConstraintsJson(event.target.value)}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                Optimizer 파라미터 JSON
                <textarea
                  className={`${bodyTextAreaClassName} min-h-[90px]`}
                  value={optimizerKnobsJson}
                  onChange={(event) => setOptimizerKnobsJson(event.target.value)}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                Optimizer 탐색 JSON
                <textarea
                  className={`${bodyTextAreaClassName} min-h-[90px]`}
                  value={optimizerSearchJson}
                  onChange={(event) => setOptimizerSearchJson(event.target.value)}
                />
              </label>
              <Button disabled={runningOptimize || optimizerServerDisabled || saveBlockedByHealth} onClick={() => void runOptimizeAction()} size="sm" variant="outline">
                {runningOptimize ? "최적화 실행 중..." : "최적화 실행"}
              </Button>
            </BodyInset>
          ) : null}

          {!beginnerMode ? (
            <details className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">고급(개발자): JSON 편집기</summary>
              <div className="mt-3 space-y-3">
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  가정 Override JSON
                  <textarea
                    className={`${bodyTextAreaClassName} min-h-[120px]`}
                    value={assumptionsOverrideJson}
                    onChange={(event) => replaceAssumptionsFromJsonText(event.target.value)}
                  />
                  {assumptionsJsonError ? <p className="mt-2 text-xs text-rose-700">{assumptionsJsonError}</p> : null}
                </label>
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  리파이낸스 제안 JSON
                  <textarea
                    className={`${bodyTextAreaClassName} min-h-[100px]`}
                    value={debtOffersJson}
                    onChange={(event) => replaceDebtOffersFromJsonText(event.target.value)}
                  />
                  {debtOffersJsonError ? <p className="mt-2 text-xs text-rose-700">{debtOffersJsonError}</p> : null}
                </label>
              </div>
            </details>
          ) : null}

          {healthWarnings.length > 0 ? (
            <BodyStatusInset className="text-xs" tone="warning">
              <p className="font-semibold">가정 건강도 경고 ({healthWarnings.length})</p>
              <div className="mt-2 space-y-1">
                {healthWarnings.map((warning) => (
                  <p key={`${warning.code}:${warning.severity}`}>[{formatSeverityKo(warning.severity)}] {warning.code} - {warning.message}</p>
                ))}
              </div>
              {healthWarnings.some((warning) => warning.code === "SNAPSHOT_STALE" || warning.code === "SNAPSHOT_VERY_STALE" || warning.code === "SNAPSHOT_MISSING") ? (
                <div className="mt-2">
                  <BodyActionLink href="/ops/assumptions">/ops/assumptions로 이동해 스냅샷 동기화</BodyActionLink>
                </div>
              ) : null}
            </BodyStatusInset>
          ) : null}

          {preflightHasBlockers ? (
            <BodyStatusInset className="text-xs" id="planning-preflight-block-reason" tone="danger">
              <p className="font-semibold">사전 점검 차단 ({preflightBlockIssues.length})</p>
              <div className="mt-2 space-y-1">
                {preflightBlockIssues.map((issue, index) => (
                  <p key={`${issue.code}-${index}`}>[{issue.code}] {formatPreflightIssue(issue)}</p>
                ))}
              </div>
            </BodyStatusInset>
          ) : null}
          {preflightWarnIssues.length > 0 ? (
            <p className="text-xs text-amber-700">
              사전 점검 경고: {preflightWarnSummary}
              {preflightWarnIssues.length > 1 ? ` 외 ${preflightWarnIssues.length - 1}건` : ""}
            </p>
          ) : null}

          {hasCriticalHealth ? (
            <BodyStatusInset className="text-xs" tone="danger">
              <label className={bodyChoiceRowClassName}>
                <input checked={healthAck} onChange={(event) => setHealthAck(event.target.checked)} type="checkbox" />
                <span>위 경고를 확인했고, 이 가정으로 계산 결과가 왜곡될 수 있음을 이해했습니다.</span>
              </label>
            </BodyStatusInset>
          ) : null}

          {healthDisabledReason ? (
            <p className="text-xs text-slate-500" id="planning-save-disabled-reason">{healthDisabledReason}</p>
          ) : null}
          {monteCarloBudgetSkipped ? (
            <p className="text-xs text-amber-700">Monte Carlo는 예산 초과로 생략되었습니다.</p>
          ) : null}

          <BodyInset className="space-y-3">
            <BodySectionHeading
              description="추천이 아닌 기준 대비 비교 실행"
              title="What-if 시나리오"
            />
            <label className={`block text-xs ${bodyLabelClassName}`}>
              기준 실행(Baseline)
              <select
                className={bodyFieldClassName}
                value={baselineRunId}
                onChange={(event) => setBaselineRunId(event.target.value)}
              >
                <option value="">선택 안 함</option>
                {availableBaselineRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.title ? `${run.title} · ` : ""}{run.id.slice(0, 8)} · {formatDateTime(locale, run.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            {loadingBaselineRuns ? <p className="text-[11px] text-slate-500">기준 실행 목록을 불러오는 중입니다...</p> : null}
            <label className={`block text-xs ${bodyLabelClassName}`}>
              시나리오 템플릿
              <select
                className={bodyFieldClassName}
                value={scenarioTemplateId}
                onChange={(event) => setScenarioTemplateId(event.target.value as ScenarioTemplateId)}
              >
                {(Object.keys(SCENARIO_TEMPLATE_LABELS) as ScenarioTemplateId[]).map((templateId) => (
                  <option key={templateId} value={templateId}>
                    {SCENARIO_TEMPLATE_LABELS[templateId]}
                  </option>
                ))}
              </select>
            </label>
            <BodyInset className="rounded-lg border-slate-100 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-700">적용 patch</p>
              {scenarioPatchesPreview.length < 1 ? (
                <BodyEmptyState
                  className="mt-2 border-none bg-transparent px-0 py-2 text-left"
                  description="선택한 템플릿이 현재 입력값에서 바꾸는 항목이 있으면 여기 표시됩니다."
                  title="적용할 patch가 없습니다."
                />
              ) : (
                <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                  {scenarioPatchesPreview.map((patch, index) => (
                    <li key={`${patch.op}:${index}`}>
                      {"field" in patch
                        ? `${patch.field} · ${patch.op} · ${patch.value}`
                        : `debt(${patch.debtId}) · ${patch.op} · ${patch.value}`}
                    </li>
                  ))}
                </ul>
              )}
            </BodyInset>
          </BodyInset>

          <BodyInset data-testid="run-stages-timeline">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Pipeline</p>
              <p className="text-xs text-slate-500">{running ? "단계 실행 중" : "최근 실행 기준"}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {currentStepStatuses.map((step) => (
                <BodyInset className="rounded-lg bg-white px-3 py-2 text-xs" data-testid={`stage-${step.id}`} key={step.id}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{STEP_LABELS[step.id]}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${stepStateClass(step.state)}`}
                      data-testid={step.id === "simulate" ? "stage-simulate-pill" : `stage-${step.id}-status`}
                    >
                      <span
                        data-stage-state={step.state}
                        data-testid={step.id === "simulate" ? "stage-simulate-status" : undefined}
                      >
                        {formatStepStateKo(step.state)}
                      </span>
                    </span>
                  </div>
                  {step.message ? <p className="mt-1 text-slate-600">{step.message}</p> : null}
                </BodyInset>
              ))}
            </div>
          </BodyInset>

          {preflightWarnIssues.length > 0 ? (
            <label className={bodyChoiceRowClassName} id="planning-save-warning-confirm-hint">
              <input
                checked={saveWarningConfirmed}
                disabled={savingRun || preflightHasBlockers}
                onChange={(event) => setSaveWarningConfirmed(event.target.checked)}
                type="checkbox"
              />
              사전 점검 경고를 확인했고, 이 상태로 저장합니다.
            </label>
          ) : null}

          <label className={bodyChoiceRowClassName}>
            <input
              checked={autoSaveRunAfterSuccess}
              disabled={running || savingRun || saveBlockedByHealth || preflightHasBlockers || preflightWarnIssues.length > 0}
              onChange={(event) => setAutoSaveRunAfterSuccess(event.target.checked)}
              type="checkbox"
            />
            실행 성공 시 실행 기록 자동 저장
          </label>

          <div className={bodyDenseActionRowClassName}>
            <Button
              aria-describedby={preflightHasBlockers ? "planning-preflight-block-reason" : undefined}
              data-testid="run-button"
              disabled={running || !selectedProfileId || preflightHasBlockers}
              onClick={() => void runPlanAction()}
              variant="primary"
            >
              {running ? "실행 중..." : "실행"}
            </Button>
            <Button
              disabled={running || !selectedProfileId || preflightHasBlockers || scenarioPatchesPreview.length < 1}
              onClick={() => void runScenarioAction()}
              variant="outline"
            >
              {running ? "실행 중..." : "What-if 실행"}
            </Button>
            <Button
              aria-describedby={saveButtonDescribedBy}
              disabled={savingRun || !selectedProfileId || !runResult?.hasSimulateResult || saveBlockedByHealth || preflightHasBlockers || saveNeedsWarningConfirmation}
              onClick={() => void saveRunAction()}
              variant="outline"
            >
              {savingRun ? "저장 중..." : "실행 기록 저장"}
            </Button>
          </div>
        </Card>
      </div>

      {optimizeCandidates.length > 0 ? (
        <Card className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">실험용 최적화 후보</h2>
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
                  <p className="mt-1">목표 달성 수: {formatNumber(locale, score.goalsAchieved)} / 최저 현금: {formatKrw(locale, Number(score.worstCashKrw ?? 0))} / 말기 순자산: {formatKrw(locale, Number(score.endNetWorthKrw ?? 0))}</p>
                  <p className="mt-1">총이자: {formatKrw(locale, Number(score.totalInterestKrw ?? summary.totalInterestKrw ?? 0))}</p>
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
          <div className="sticky top-3 z-20">
            <ResultGuideCard
              locale={locale}
              status={guideBadge.status}
              reason={guideBadge.reason}
              minCashKrw={guideBadge.minCashKrw}
              achievedGoals={achievedGoalCount}
              totalGoals={goalTableRows.length}
              maxDsr={guideBadge.maxDsr}
              topActions={topActionTitles}
            />
          </div>

          <BodyInset className="text-xs text-slate-700">
            <details>
              <summary className="cursor-pointer font-semibold text-slate-900">결과 해석 가이드</summary>
              <div className="mt-3 space-y-2">
                <p><span className="font-semibold">NEGATIVE_CASHFLOW</span>: 월 적자 상태입니다. 지출 절감 또는 부채/적립 조정을 먼저 점검하세요.</p>
                <p><span className="font-semibold">HIGH_DEBT_SERVICE</span>: DSR이 높습니다. 상환 기간/금리/추가상환 시나리오를 비교하세요.</p>
                <p><span className="font-semibold">SNAPSHOT_STALE</span>: 가정 최신성이 낮습니다. `/ops/assumptions` 동기화 후 재실행을 권장합니다.</p>
                <p><span className="font-semibold">Monte Carlo 확률</span>: 통계 기반 참고값이며 보장값이 아닙니다.</p>
                <p><span className="font-semibold">실행 계획 후보</span>: 실행 비교용 제안 목록입니다. 특정 상품 가입 권유가 아닙니다.</p>
              </div>
            </details>
          </BodyInset>

          <Card>
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
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
                <InterpretabilityGuideCard
                  summaryMetrics={{
                    ...(typeof summaryMonthlySurplusKrw === "number" ? { monthlySurplusKrw: summaryMonthlySurplusKrw } : {}),
                    ...(typeof summaryEmergencyFundMonths === "number" ? { emergencyFundMonths: summaryEmergencyFundMonths } : {}),
                    endNetWorthKrw: summaryEndNetWorthKrw,
                    worstCashKrw: summaryWorstCashKrw,
                    worstCashMonthIndex: summaryWorstCashMonth,
                    ...(typeof summaryDsr === "number" ? { dsrPct: summaryDsr } : {}),
                    ...(summaryGoalsText !== "-" ? { goalsAchievedText: summaryGoalsText } : {}),
                  }}
                  summaryEvidence={summaryEvidence}
                  aggregatedWarnings={aggregatedWarningsForInsight.map((warning) => ({
                    code: warning.code,
                    severity: warning.severity,
                    count: warning.count,
                    ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
                    ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
                    ...(typeof warning.sampleMessage === "string" ? { sampleMessage: warning.sampleMessage } : {}),
                  }))}
                  goals={goalsForInsight}
                  outcomes={{
                    ...(actionsTopForInsight.length > 0 ? { actionsTop: actionsTopForInsight } : {}),
                    snapshotMeta: workspaceSnapshotState.outcomesMeta,
                    monteCarlo: {
                      retirementDepletionBeforeEnd: monteDepletionProb,
                    },
                    ...(savedRun?.id ? { runId: savedRun.id } : {}),
                  }}
                />

                <BodyInset data-testid="planning-metric-evidence">
                  <p className="text-xs font-semibold text-slate-900">계산 근거</p>
                  <p className="mt-1 text-[11px] text-slate-600">현재 입력값과 선택한 정책 기준으로 계산합니다.</p>
                  <div className="mt-2 space-y-2">
                    <EvidencePanel
                      items={metricEvidenceItems}
                      locale={locale}
                      formatNumber={(value) => formatNumber(locale, value)}
                    />
                  </div>
                </BodyInset>

                <DisclosuresPanel report={combinedNormalizationReport} />

                <div className="grid gap-2 md:grid-cols-5">
                  <BodyInset>
                    말기 순자산: <span className="font-semibold">{formatKrw(locale, summaryEndNetWorthKrw)}</span>
                  </BodyInset>
                  <BodyInset>
                    최저 현금(월): <span className="font-semibold">{formatKrw(locale, summaryWorstCashKrw)} (M{summaryWorstCashMonth + 1})</span>
                  </BodyInset>
                  <BodyInset>
                    목표 달성: <span className="font-semibold">{summaryGoalsText}</span>
                  </BodyInset>
                  <BodyInset>
                    DSR: <span className="font-semibold">{typeof summaryDsr === "number" ? formatRatioPct(locale, summaryDsr) : "-"}</span>
                  </BodyInset>
                  <BodyInset>
                    치명 경고: <span className="font-semibold">{summaryCriticalWarnings}</span>
                  </BodyInset>
                </div>

                {Object.keys(summaryEvidence).length > 0 ? (
                  <details className="text-xs text-slate-700" data-testid="planning-summary-evidence">
                    <summary className="cursor-pointer font-semibold text-slate-900">요약 지표 계산 근거</summary>
                    <BodyInset className="mt-2">
                      <div className="space-y-2">
                        {Object.entries(summaryEvidence).map(([metric, evidence]) => (
                          evidence ? (
                            <BodyInset className="bg-white" key={metric}>
                              <p className="font-semibold text-slate-900">{metric}</p>
                              <p className="mt-1 text-[11px] text-slate-600">공식: {evidence.formula}</p>
                              <p className="mt-1 text-[11px] text-slate-600">입력:</p>
                              <ul className="list-disc pl-4">
                                {Object.entries(evidence.inputs).map(([key, value]) => (
                                  <li key={`${metric}:${key}`}>{key}: {formatDisclosureValue(value)}</li>
                                ))}
                              </ul>
                              <p className="mt-1 text-[11px] text-slate-600">가정:</p>
                              <ul className="list-disc pl-4">
                                {evidence.assumptions.map((assumption, index) => (
                                  <li key={`${metric}:assumption:${index}`}>{assumption}</li>
                                ))}
                              </ul>
                            </BodyInset>
                          ) : null
                        ))}
                      </div>
                    </BodyInset>
                  </details>
                ) : null}

                <BodyInset>
                  <p className="font-semibold text-slate-900">Key Findings</p>
                  <div className="mt-1 space-y-1">
                    {keyFindings.slice(0, 3).map((line, index) => (
                      <p key={`finding-${index}`}>- {line}</p>
                    ))}
                  </div>
                </BodyInset>

                <BodyInset>
                  <p className="font-semibold text-slate-900">Warnings Summary (Top 5)</p>
                  {warningsSummaryTop5.length === 0 ? (
                    <p className="mt-1">경고가 없습니다.</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {warningsSummaryTop5.map((warning) => (
                        <p key={`${warning.code}:${warning.severity}`}>
                          [{formatSeverityKo(warning.severity)}] {warning.code} · {warning.count}회
                        </p>
                      ))}
                    </div>
                  )}
                </BodyInset>

                <div className="grid gap-2 md:grid-cols-2">
                  <BodyInset>{t(locale, "SUMMARY_LABEL_GENERATED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.generatedAt)}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_ID")}: <span className="font-semibold">{resultDto?.meta.snapshot.id ?? "latest"}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_AS_OF")}: <span className="font-semibold">{resultDto?.meta.snapshot.asOf ?? "-"}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_FETCHED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.snapshot.fetchedAt)}</span></BodyInset>
                  <BodyInset>snapshot staleDays: <span className="font-semibold">{formatNumber(locale, resultDto?.meta.health?.snapshotStaleDays)}</span></BodyInset>
                  <BodyInset>snapshot missing: <span className="font-semibold">{resultDto?.meta.snapshot.missing ? "true" : "false"}</span></BodyInset>
                </div>

                {currentStepStatuses.some((step) => step.state === "FAILED") ? (
                  <BodyStatusInset tone="warning">
                    부분 실패 단계: {currentStepStatuses.filter((step) => step.state === "FAILED").map((step) => STEP_LABELS[step.id]).join(", ")}
                  </BodyStatusInset>
                ) : null}
                {savedRun ? (
                  <BodyStatusInset tone="success">
                    저장된 실행 기록: {savedRun.id}
                    {" · "}
                    <BodyActionLink href={runsPageHref}>/planning/runs로 이동</BodyActionLink>
                    {" · "}
                    <BodyActionLink
                      href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(savedRun.id)}`, selectedProfileId)}
                    >
                      리포트 보기
                    </BodyActionLink>
                  </BodyStatusInset>
                ) : null}
              </div>
            ) : null}

            {activeTab === "warningsGoals" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <h3 className="font-semibold text-slate-900">{t(locale, "CHARTS_HEADER")}</h3>
                {chartMode === "none" ? (
                  <BodyEmptyState title={t(locale, "CHART_NOT_AVAILABLE")} />
                ) : (
                  <PlanningMiniCharts locale={locale} mode={chartMode} points={chartPoints} />
                )}

                <BodyInset>
                  해석: 상태 배지와 아래 표를 함께 보면 반복 경고, 목표 부족액, 현금흐름 악화 구간을 빠르게 확인할 수 있습니다.
                </BodyInset>

                <WarningsTable warnings={aggregatedWarnings} />
                <GoalsTable locale={locale} goals={goalTableRows} />
                <TimelineSummaryTable locale={locale} rows={timelineSummaryRows} />
                {warningsGoalsDebugSections.length > 0 ? (
                  <AdvancedJsonPanel
                    sections={warningsGoalsDebugSections}
                    title="고급 보기 (canonical 요약)"
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "scenarios" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {scenariosStatus.state === "FAILED" ? (
                  <BodyStatusInset tone="danger">
                    시나리오 단계 실패: {scenariosStatus.message ?? "시나리오 계산에 실패했습니다."}
                  </BodyStatusInset>
                ) : !hasScenariosData ? (
                  <BodyEmptyState title="시나리오 결과가 없습니다" />
                ) : (
                  <>
                    <BodyInset>
                      해석: 기준 대비 순자산 변화와 목표 달성 변화를 함께 보면 어떤 가정이 결과를 악화시키는지 빠르게 파악할 수 있습니다.
                    </BodyInset>

                    <div className="grid gap-2 md:grid-cols-4">
                      <BodyInset>
                        기준 말기 순자산: <span className="font-semibold">{formatKrw(locale, Number(scenariosBaseSummary.endNetWorthKrw ?? 0))}</span>
                      </BodyInset>
                      <BodyInset>
                        기준 최저 현금: <span className="font-semibold">{formatKrw(locale, Number(scenariosBaseSummary.worstCashKrw ?? 0))}</span>
                      </BodyInset>
                      <BodyInset>
                        기준 목표 달성: <span className="font-semibold">{formatNumber(locale, scenariosBaseSummary.goalsAchieved)}</span>
                      </BodyInset>
                      <BodyInset>
                        기준 경고 수: <span className="font-semibold">{formatNumber(locale, scenariosBaseSummary.warningsCount)}</span>
                      </BodyInset>
                    </div>

                    <WarningsTable warnings={aggregateGuideWarnings(scenariosBaseWarnings)} />

                    <h3 className="font-semibold text-slate-900">시나리오 비교 표</h3>
                    {scenarioComparisonRows.length === 0 ? (
                      <BodyEmptyState title="시나리오 결과가 없습니다" />
                    ) : (
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">시나리오</th>
                              <th className="px-3 py-2 text-right">말기 순자산</th>
                              <th className="px-3 py-2 text-right">기준 대비</th>
                              <th className="px-3 py-2 text-right">목표 달성</th>
                              <th className="px-3 py-2 text-right">달성 변화</th>
                              <th className="px-3 py-2 text-right">경고 수</th>
                              <th className="px-3 py-2 text-left">해석</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {scenarioComparisonRows.map((row) => (
                              <tr key={row.id || row.title}>
                                <td className="px-3 py-2 font-semibold text-slate-900">{row.title}</td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, row.endNetWorthKrw)}</td>
                                <td className={`px-3 py-2 text-right ${row.endNetWorthDeltaKrw < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                  {formatKrw(locale, row.endNetWorthDeltaKrw)}
                                </td>
                                <td className="px-3 py-2 text-right">{row.goalsAchieved}</td>
                                <td className={`px-3 py-2 text-right ${row.goalsAchievedDelta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                  {row.goalsAchievedDelta >= 0 ? "+" : ""}{row.goalsAchievedDelta}
                                </td>
                                <td className="px-3 py-2 text-right">{row.warningsCount}</td>
                                <td className="px-3 py-2">{row.shortWhy[0] ?? "핵심 지표 변화를 먼저 확인하세요."}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    )}

                    {scenariosDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={scenariosDebugSections}
                        title="고급 보기 (scenario summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "monteCarlo" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {monteCarloStatus.state === "FAILED" ? (
                  <BodyStatusInset tone="danger">
                    몬테카를로 단계 실패: {monteCarloStatus.message ?? "몬테카를로 계산에 실패했습니다."}
                  </BodyStatusInset>
                ) : monteCarloStatus.state === "SKIPPED" ? (
                  <BodyStatusInset tone="warning">
                    몬테카를로 단계 생략: {monteCarloStatus.message ?? "실행 조건에 의해 생략되었습니다."}
                  </BodyStatusInset>
                ) : !hasMonteCarloData || Object.keys(monteData).length === 0 ? (
                  <BodyEmptyState title="몬테카를로 결과가 없습니다" />
                ) : (
                  <>
                    <BodyInset>
                      {typeof monteDepletionProb === "number"
                        ? `은퇴 자산 고갈 확률: ${formatPct(locale, monteDepletionProb * 100)} (모델 기반, 보장 아님)`
                        : "고갈 확률 지표가 제공되지 않았습니다."}
                    </BodyInset>
                    <BodyTableFrame>
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">지표</th>
                            <th className="px-3 py-2 text-right">P10</th>
                            <th className="px-3 py-2 text-right">P50</th>
                            <th className="px-3 py-2 text-right">P90</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr>
                            <td className="px-3 py-2 font-semibold text-slate-900">말기 순자산</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteEndNetWorth.p10 ?? 0))}</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteEndNetWorth.p50 ?? 0))}</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteEndNetWorth.p90 ?? 0))}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-semibold text-slate-900">최저 현금</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteWorstCash.p10 ?? 0))}</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteWorstCash.p50 ?? 0))}</td>
                            <td className="px-3 py-2 text-right">{formatKrw(locale, Number(monteWorstCash.p90 ?? 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </BodyTableFrame>
                  </>
                )}
                {monteCarloDebugSections.length > 0 ? (
                  <AdvancedJsonPanel
                    sections={monteCarloDebugSections}
                    title="고급 보기 (monte carlo summary)"
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "actions" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {actionsStatus.state === "FAILED" ? (
                  <BodyStatusInset tone="danger">
                    실행 계획 단계 실패: {actionsStatus.message ?? "실행 계획 생성에 실패했습니다."}
                  </BodyStatusInset>
                ) : (
                  <>
                    <BodyInset>
                      해석: 심각도(치명/경고/정보) 순서대로 우선 처리하면 경고를 가장 빠르게 줄일 수 있습니다.
                    </BodyInset>

                    {actionTableRows.length === 0 ? (
                      <BodyEmptyState title="실행 계획이 없습니다" />
                    ) : (
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">심각도</th>
                              <th className="px-3 py-2 text-left">코드</th>
                              <th className="px-3 py-2 text-left">액션</th>
                              <th className="px-3 py-2 text-left">요약</th>
                              <th className="px-3 py-2 text-right">근거수</th>
                              <th className="px-3 py-2 text-right">실행단계수</th>
                              <th className="px-3 py-2 text-right">주의사항수</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {visibleActionRows.map((row) => (
                              <tr key={`${row.code}-${row.title}`}>
                                <td className={`px-3 py-2 font-semibold ${
                                  row.severity === "critical" ? "text-rose-700" : row.severity === "warn" ? "text-amber-700" : "text-slate-700"
                                }`}
                                >
                                  {row.severity === "critical" ? "치명" : row.severity === "warn" ? "경고" : "정보"}
                                </td>
                                <td className="px-3 py-2 font-semibold text-slate-900">{row.code}</td>
                                <td className="px-3 py-2">{row.title}</td>
                                <td className="px-3 py-2">{row.summary || "요약 없음"}</td>
                                <td className="px-3 py-2 text-right">{row.whyCount}</td>
                                <td className="px-3 py-2 text-right">{row.steps.length}</td>
                                <td className="px-3 py-2 text-right">{row.cautions.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    )}
                    {actionTableRows.length > LIMITS.actionsTop ? (
                      <BodyInset className="flex items-center justify-between">
                        <span>{showAllActions ? `전체 ${actionTableRows.length}개 액션 표시 중` : `추가 ${omittedActionRows}개 액션이 생략되었습니다.`}</span>
                        <button
                          className="font-semibold text-emerald-700"
                          onClick={() => setShowAllActions((prev) => !prev)}
                          type="button"
                        >
                          {showAllActions ? "접기" : "더 보기"}
                        </button>
                      </BodyInset>
                    ) : null}

                    {actionTableRows.length > 0 ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {actionTableRows.slice(0, 3).map((row) => (
                          <BodyInset key={`detail-${row.code}-${row.title}`}>
                            <p className="font-semibold text-slate-900">{row.title}</p>
                            <p className="mt-1">{row.summary || "핵심 문제를 줄이기 위한 조치입니다."}</p>
                            <p className="mt-2 font-semibold text-slate-900">권장 단계</p>
                            {row.steps.length === 0 ? (
                              <p className="mt-1">세부 단계는 고급 보기를 참고하세요.</p>
                            ) : (
                              <ol className="mt-1 space-y-1">
                                {row.steps.slice(0, 3).map((step, index) => (
                                  <li key={`${row.code}-step-${index}`}>{index + 1}. {step}</li>
                                ))}
                              </ol>
                            )}
                            {row.cautions.length > 0 ? (
                              <p className="mt-2 text-amber-800">주의: {row.cautions[0]}</p>
                            ) : null}
                          </BodyInset>
                        ))}
                      </div>
                    ) : null}

                    {actionsDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={actionsDebugSections}
                        title="고급 보기 (actions summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "debt" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {debtStatus.state === "FAILED" ? (
                  <BodyStatusInset tone="danger">
                    부채 분석 단계 실패: {debtStatus.message ?? "부채 분석에 실패했습니다."}
                  </BodyStatusInset>
                ) : !hasDebtData ? (
                  <BodyEmptyState title="부채 분석 결과가 없습니다" />
                ) : (
                  <>
                    <BodyInset>
                      해석: 부채 탭은 현재 상환부담(DSR), 이자비용, 리파이낸스 효과를 함께 보고 우선순위를 정하는 용도입니다.
                    </BodyInset>

                    <div className="grid gap-2 md:grid-cols-2">
                      <BodyInset>
                        현재 DSR: <span className="font-semibold">{formatRatioPct(locale, debtMeta.debtServiceRatio)}</span>
                      </BodyInset>
                      <BodyInset>
                        월 총상환액: <span className="font-semibold">{formatKrw(locale, Number(debtMeta.totalMonthlyPaymentKrw ?? 0))}</span>
                      </BodyInset>
                    </div>

                    <WarningsTable warnings={debtWarnings} />

                    <h3 className="font-semibold text-slate-900">부채별 상환 요약</h3>
                    {debtSummaries.length === 0 ? (
                      <BodyEmptyState title="부채 요약 데이터가 없습니다" />
                    ) : (
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">부채명</th>
                              <th className="px-3 py-2 text-right">원금</th>
                              <th className="px-3 py-2 text-right">금리(APR)</th>
                              <th className="px-3 py-2 text-right">월 상환액</th>
                              <th className="px-3 py-2 text-right">월 이자</th>
                              <th className="px-3 py-2 text-right">잔여 총이자</th>
                              <th className="px-3 py-2 text-right">예상 상환완료월</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {debtSummaries.map((row, index) => (
                              <tr key={`${String(row.liabilityId ?? index)}-${String(row.name ?? "")}`}>
                                <td className="px-3 py-2 font-semibold text-slate-900">{String(row.name ?? row.liabilityId ?? "부채")}</td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, Number(row.principalKrw ?? 0))}</td>
                                <td className="px-3 py-2 text-right">{typeof row.aprPct === "number" ? formatPct(locale, row.aprPct) : "-"}</td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, Number(row.monthlyPaymentKrw ?? 0))}</td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, Number(row.monthlyInterestKrw ?? 0))}</td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, Number(row.totalInterestRemainingKrw ?? 0))}</td>
                                <td className="px-3 py-2 text-right">M{Number(row.payoffMonthIndex ?? 0) + 1}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    )}

                    <h3 className="font-semibold text-slate-900">리파이낸스 비교</h3>
                    {debtRefinance.length === 0 ? (
                      <BodyInset>
                        적용 가능한 리파이낸스 제안이 없습니다. 현재 조건 유지 또는 추가상환을 먼저 검토하세요.
                      </BodyInset>
                    ) : (
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">부채</th>
                              <th className="px-3 py-2 text-left">제안</th>
                              <th className="px-3 py-2 text-right">신규금리</th>
                              <th className="px-3 py-2 text-right">월상환 변화</th>
                              <th className="px-3 py-2 text-right">예상이자절감</th>
                              <th className="px-3 py-2 text-right">손익분기(월)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {debtRefinance.map((row, index) => (
                              <tr key={`${String(row.liabilityId ?? index)}-${String(row.offerTitle ?? "")}`}>
                                <td className="px-3 py-2 font-semibold text-slate-900">{String(row.liabilityId ?? "부채")}</td>
                                <td className="px-3 py-2">{String(row.offerTitle ?? "리파이낸스")}</td>
                                <td className="px-3 py-2 text-right">{typeof row.newAprPct === "number" ? formatPct(locale, row.newAprPct) : "-"}</td>
                                <td className={`px-3 py-2 text-right ${Number(row.monthlyPaymentDeltaKrw ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                  {formatKrw(locale, Number(row.monthlyPaymentDeltaKrw ?? 0))}
                                </td>
                                <td className="px-3 py-2 text-right">{formatKrw(locale, Number(row.interestSavingsKrw ?? 0))}</td>
                                <td className="px-3 py-2 text-right">{typeof row.breakEvenMonths === "number" ? row.breakEvenMonths : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    )}

                    <h3 className="font-semibold text-slate-900">What-if 요약</h3>
                    <BodyTableFrame>
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">전략</th>
                            <th className="px-3 py-2 text-right">제안 수</th>
                            <th className="px-3 py-2 text-left">해석</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {debtWhatIfSummary.map((row) => (
                            <tr key={row.title}>
                              <td className="px-3 py-2 font-semibold text-slate-900">{row.title}</td>
                              <td className="px-3 py-2 text-right">{row.count}</td>
                              <td className="px-3 py-2">{row.interpretation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </BodyTableFrame>

                    {debtDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={debtDebugSections}
                        title="고급 보기 (debt summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {profileDeleteDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="planning-profile-delete-title">
          <BodyDialogSurface className="max-w-lg">
            <h2 id="planning-profile-delete-title" className="text-base font-bold text-slate-900">프로필 삭제 확인</h2>
            <p className="mt-1 text-xs text-slate-600">아래 확인 문구를 정확히 입력해야 삭제가 진행됩니다.</p>
            <BodyInset className="mt-3 px-3 py-2 font-mono text-xs text-slate-700">{profileDeleteDialog.expectedConfirm}</BodyInset>
            <input
              className={bodyFieldClassName}
              value={profileDeleteDialog.confirmText}
              onChange={(event) => {
                const nextValue = event.target.value;
                setProfileDeleteDialog((prev) => (prev ? { ...prev, confirmText: nextValue } : prev));
              }}
              disabled={savingProfile}
            />
            <div className={bodyDialogActionsClassName}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (savingProfile) return;
                  setProfileDeleteDialog(null);
                }}
                disabled={savingProfile}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void submitDeleteProfileAction()}
                disabled={savingProfile || profileDeleteDialog.confirmText.trim() !== profileDeleteDialog.expectedConfirm}
              >
                {savingProfile ? "삭제 중..." : "삭제 진행"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}

      {feedbackModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="planning-feedback-title">
          <BodyDialogSurface className="max-w-xl">
            <h2 id="planning-feedback-title" className="text-base font-bold text-slate-900">피드백 보내기</h2>
            <p className="mt-1 text-xs text-slate-600">/planning 사용 중 불편/버그를 로컬에 저장합니다.</p>

            <div className="mt-4 space-y-3">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                분류
                <select
                  className={bodyFieldClassName}
                  value={feedbackCategory}
                  onChange={(event) => setFeedbackCategory(event.target.value as PlanningFeedbackCategory)}
                  disabled={feedbackSubmitting}
                >
                  {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className={`block text-xs ${bodyLabelClassName}`}>
                제목
                <input
                  className={bodyFieldClassName}
                  placeholder="예: 실행 결과 탭 전환이 헷갈려요"
                  value={feedbackTitle}
                  onChange={(event) => setFeedbackTitle(event.target.value)}
                  maxLength={160}
                  disabled={feedbackSubmitting}
                />
              </label>

              <label className={`block text-xs ${bodyLabelClassName}`}>
                내용
                <textarea
                  className={`${bodyTextAreaClassName} min-h-28`}
                  placeholder="재현 단계/기대 결과/실제 결과를 간단히 적어주세요."
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  maxLength={5000}
                  disabled={feedbackSubmitting}
                />
              </label>
            </div>

            <BodyInset className="mt-4 px-3 py-2 text-xs text-slate-700">
              <p>snapshot: {workspaceSnapshotState.displayId || "-"}</p>
              <p>runId: {savedRun?.id ?? "-"}</p>
              <p>health: critical={healthSummary?.criticalCount ?? "-"}, warnings={healthSummary?.warningCodes?.slice(0, 10).join(", ") || "-"}</p>
            </BodyInset>

            <div className={bodyDialogActionsClassName}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (feedbackSubmitting) return;
                  setFeedbackModalOpen(false);
                }}
                disabled={feedbackSubmitting}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void submitPlanningFeedbackAction()}
                disabled={feedbackSubmitting}
              >
                {feedbackSubmitting ? "저장 중..." : "저장"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}
    </PageShell>
  );
}

export default PlanningWorkspaceClient;
