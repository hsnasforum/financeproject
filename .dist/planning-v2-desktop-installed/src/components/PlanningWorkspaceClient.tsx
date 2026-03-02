"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import PlanningMiniCharts from "@/app/planning/_components/PlanningMiniCharts";
import SnapshotPicker, { type SnapshotSelection } from "@/app/planning/_components/SnapshotPicker";
import {
  createInitialStepStatuses,
  type StepId,
  type StepStatus,
} from "@/app/planning/_lib/runPipeline";
import {
  createDefaultProfileFormModel,
  deriveSummary,
  estimateDebtMonthlyPaymentKrw,
  normalizeDraft,
  type FormDraft,
  fromProfileJson,
  toProfileJson,
  validateProfile,
  validateDebtOfferLiabilityIds,
  validateProfileForm,
  type ProfileFormDebt,
  type ProfileFormGoal,
  type ProfileFormModel,
} from "@/app/planning/_lib/profileFormModel";
import { type SnapshotListItem } from "@/app/planning/_lib/snapshotList";
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
import PlanningOnboardingWizard from "@/components/planning/PlanningOnboardingWizard";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
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
import { type ActionItemV2 } from "@/lib/planning/v2/actions/types";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { buildResultDtoV1, isResultDtoV1, type ResultDtoV1 } from "@/lib/planning/v2/resultDto";
import { buildPlanningChartPoints } from "@/lib/planning/v2/chartPoints";
import { applySuggestions } from "@/lib/planning/v2/applySuggestions";
import { preflightRun, type PreflightIssue } from "@/lib/planning/v2/preflight";
import { type ScenarioMeta, type ScenarioPatch, validateScenario } from "@/lib/planning/v2/scenario";
import {
  suggestProfileNormalizations,
  type NormalizationSuggestion,
} from "@/lib/planning/v2/normalizeProfile";
import { type PlanningWizardOutput } from "@/app/planning/_lib/planningOnboardingWizard";
import {
  aggregateWarnings as aggregateGuideWarnings,
} from "@/lib/planning/v2/resultGuide";
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

type PlanningFeedbackCreateResponse = {
  id?: string;
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
  resultDto?: ResultDtoV1;
  simulate?: Record<string, unknown>;
  scenarios?: Record<string, unknown>;
  monteCarlo?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  debt?: Record<string, unknown>;
  stepStatuses: StepStatus[];
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

type AssumptionsFormModel = {
  inflationPct: number;
  expectedReturnPct: number;
  cashReturnPct: number;
  withdrawalRatePct: number;
};

type DebtOfferFormRow = {
  rowId: string;
  liabilityId: string;
  title: string;
  newAprPct: number;
  feeKrw: number;
};

const ASSUMPTIONS_FORM_DEFAULT: AssumptionsFormModel = {
  inflationPct: 2.0,
  expectedReturnPct: 5.0,
  cashReturnPct: 2.0,
  withdrawalRatePct: 4.0,
};

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

function parseJsonText<T = unknown>(label: string, text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    window.alert(`${label} JSON 파싱에 실패했습니다.`);
    return null;
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
  debtId?: string,
): ScenarioPatch[] {
  if (templateId === "REDUCE_DISCRETIONARY_10") {
    return [{ path: "/monthlyDiscretionaryExpenses", op: "multiply", value: 0.9 }];
  }
  if (templateId === "REDUCE_DISCRETIONARY_20") {
    return [{ path: "/monthlyDiscretionaryExpenses", op: "multiply", value: 0.8 }];
  }
  if (templateId === "INCOME_PLUS_5") {
    return [{ path: "/monthlyIncomeNet", op: "multiply", value: 1.05 }];
  }
  if (!debtId) return [];
  return [{ path: `/debts/${debtId}/minimumPayment`, op: "add", value: 100_000 }];
}

function scenarioId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scenario-${Date.now()}`;
}

function parseHorizonMonths(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1200) {
    window.alert("horizonMonths는 1~1200 범위 숫자여야 합니다.");
    return null;
  }
  return parsed;
}

function nextRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFiniteNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function splitAssumptionsRecord(raw: Record<string, unknown>): {
  form: AssumptionsFormModel;
  extra: Record<string, unknown>;
} {
  const knownKeys = new Set([
    "inflation",
    "expectedReturn",
    "cashReturnPct",
    "withdrawalRatePct",
    "inflationPct",
    "expectedReturnPct",
    "investReturnPct",
  ]);

  const inflationPct = typeof raw.inflationPct === "number"
    ? raw.inflationPct
    : (typeof raw.inflation === "number" ? raw.inflation : ASSUMPTIONS_FORM_DEFAULT.inflationPct);
  const expectedReturnPct = typeof raw.expectedReturnPct === "number"
    ? raw.expectedReturnPct
    : (typeof raw.expectedReturn === "number"
      ? raw.expectedReturn
      : (typeof raw.investReturnPct === "number" ? raw.investReturnPct : ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct));
  const cashReturnPct = typeof raw.cashReturnPct === "number" ? raw.cashReturnPct : ASSUMPTIONS_FORM_DEFAULT.cashReturnPct;
  const withdrawalRatePct = typeof raw.withdrawalRatePct === "number" ? raw.withdrawalRatePct : ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct;

  const extra: Record<string, unknown> = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!knownKeys.has(key)) {
      extra[key] = value;
    }
  });

  return {
    form: {
      inflationPct,
      expectedReturnPct,
      cashReturnPct,
      withdrawalRatePct,
    },
    extra,
  };
}

function assumptionsFormToRecord(form: AssumptionsFormModel, extra: Record<string, unknown>): Record<string, unknown> {
  const inflationPct = Number.isFinite(form.inflationPct) ? form.inflationPct : ASSUMPTIONS_FORM_DEFAULT.inflationPct;
  const expectedReturnPct = Number.isFinite(form.expectedReturnPct)
    ? form.expectedReturnPct
    : ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct;
  return {
    ...extra,
    inflationPct,
    expectedReturnPct,
    cashReturnPct: Number.isFinite(form.cashReturnPct) ? form.cashReturnPct : ASSUMPTIONS_FORM_DEFAULT.cashReturnPct,
    withdrawalRatePct: Number.isFinite(form.withdrawalRatePct) ? form.withdrawalRatePct : ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct,
    // Keep compatibility with current API parser fields.
    inflation: inflationPct,
    expectedReturn: expectedReturnPct,
    investReturnPct: expectedReturnPct,
  };
}

function parseDebtOffersFormRows(raw: unknown): DebtOfferFormRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const record = asRecord(row);
    return {
      rowId: `offer-${index + 1}`,
      liabilityId: String(record.liabilityId ?? "").trim(),
      title: String(record.title ?? "").trim(),
      newAprPct: typeof record.newAprPct === "number" ? record.newAprPct : 0,
      feeKrw: typeof record.feeKrw === "number" ? record.feeKrw : 0,
    };
  });
}

function debtOfferRowsToPayload(rows: DebtOfferFormRow[]): Array<Record<string, unknown>> {
  return rows
    .map((row) => ({
      liabilityId: row.liabilityId.trim(),
      newAprPct: row.newAprPct,
      feeKrw: row.feeKrw,
      ...(row.title.trim() ? { title: row.title.trim() } : {}),
    }))
    .filter((row) => row.liabilityId.length > 0);
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

type ActionSeverity = "info" | "warn" | "critical";

const ACTION_SEVERITY_ORDER: Record<ActionSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

function pickTopActionTitles(actions: unknown[]): string[] {
  return actions
    .map((action) => {
      const row = asRecord(action);
      const severityRaw = String(row.severity ?? "").trim();
      const severity: ActionSeverity = severityRaw === "critical" || severityRaw === "warn"
        ? severityRaw
        : "info";
      const title = String(row.title ?? "").trim();
      const code = String(row.code ?? "").trim();
      return {
        severity,
        title: title || code || "권장 조치",
        code: code || "UNKNOWN",
      };
    })
    .sort((a, b) => {
      const severityDiff = ACTION_SEVERITY_ORDER[a.severity] - ACTION_SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 3)
    .map((action) => action.title);
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

const STEP_LABELS: Record<StepId, string> = {
  simulate: "simulate",
  scenarios: "scenarios",
  monteCarlo: "monte carlo",
  actions: "actions",
  debt: "debt",
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
  | "REDUCE_DISCRETIONARY_10"
  | "REDUCE_DISCRETIONARY_20"
  | "INCOME_PLUS_5"
  | "DEBT_PAYMENT_PLUS_100000";

const SCENARIO_TEMPLATE_LABELS: Record<ScenarioTemplateId, string> = {
  REDUCE_DISCRETIONARY_10: "선택지출 -10%",
  REDUCE_DISCRETIONARY_20: "선택지출 -20%",
  INCOME_PLUS_5: "월수입 +5%",
  DEBT_PAYMENT_PLUS_100000: "월 부채상환 +100,000원",
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

function isServerDisabledMessage(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("서버 비활성");
}

export function PlanningWorkspaceClient({
  featureFlags,
  locale,
  initialSelectedProfileId = "",
  snapshotItems,
}: PlanningWorkspaceClientProps) {
  const initialProfileModel = useMemo(() => {
    const parsed = tryParseJsonText<ProfileV2>(DEFAULT_PROFILE_JSON);
    return parsed ? fromProfileJson(parsed, "기본 프로필") : createDefaultProfileFormModel();
  }, []);
  const initialAssumptionsSplit = useMemo(() => {
    const parsed = tryParseJsonText<Record<string, unknown>>(DEFAULT_ASSUMPTIONS_OVERRIDE) ?? {};
    return splitAssumptionsRecord(parsed);
  }, []);
  const initialDebtOfferRows = useMemo(() => {
    const parsed = tryParseJsonText<unknown[]>(DEFAULT_DEBT_OFFERS_JSON) ?? [];
    return parseDebtOffersFormRows(parsed);
  }, []);
  const safeDefaults = useMemo(() => planningExecutionDefaults(true), []);

  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileName, setProfileName] = useState("기본 프로필");
  const [profileJson, setProfileJson] = useState(DEFAULT_PROFILE_JSON);
  const [profileJsonError, setProfileJsonError] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileFormModel>(initialProfileModel);

  const [snapshotSelection, setSnapshotSelection] = useState<SnapshotSelection>(() => {
    if (snapshotItems.latest) return { mode: "latest" };
    const firstHistory = snapshotItems.history[0];
    return firstHistory ? { mode: "history", id: firstHistory.id } : { mode: "latest" };
  });
  const [policyId, setPolicyId] = useState<AllocationPolicyId>("balanced");
  const [horizonMonths, setHorizonMonths] = useState(safeDefaults.horizonMonths);
  const [runTitle, setRunTitle] = useState("기본 실행");
  const [assumptionsOverrideJson, setAssumptionsOverrideJson] = useState(DEFAULT_ASSUMPTIONS_OVERRIDE);
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

  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profilesLoadError, setProfilesLoadError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runningOptimize, setRunningOptimize] = useState(false);
  const [autoSaveRunAfterSuccess, setAutoSaveRunAfterSuccess] = useState(false);
  const [pipelineStatuses, setPipelineStatuses] = useState<StepStatus[]>(() => createInitialStepStatuses());

  const [runResult, setRunResult] = useState<CombinedRunResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<{
    meta?: PlanningMeta;
    candidates: Record<string, unknown>[];
  } | null>(null);
  const [savedRun, setSavedRun] = useState<PlanningRunRecord | null>(null);
  const [baselineRuns, setBaselineRuns] = useState<BaselineRunOption[]>([]);
  const [loadingBaselineRuns, setLoadingBaselineRuns] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [scenarioTemplateId, setScenarioTemplateId] = useState<ScenarioTemplateId>("REDUCE_DISCRETIONARY_10");
  const [scenarioDebtId, setScenarioDebtId] = useState("");
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
  const [saveWarningConfirmed, setSaveWarningConfirmed] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<PlanningFeedbackCategory>("ux");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackToast, setFeedbackToast] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const runsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/runs", selectedProfileId),
    [selectedProfileId],
  );
  const reportsPageHref = useMemo(
    () => appendProfileIdQuery("/planning/reports", selectedProfileId),
    [selectedProfileId],
  );
  const profileSummary = useMemo(() => deriveSummary(profileForm as unknown as FormDraft), [profileForm]);
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
  const selectedSnapshotItem = useMemo(() => {
    if (snapshotSelection.mode === "latest") return snapshotItems.latest;
    return snapshotItems.history.find((item) => item.id === snapshotSelection.id);
  }, [snapshotItems.history, snapshotItems.latest, snapshotSelection]);
  const selectedSnapshotId = snapshotSelection.mode === "history" ? snapshotSelection.id.trim() || undefined : undefined;
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
    () => createScenarioPatchesFromTemplate(scenarioTemplateId, scenarioDebtId || debtLiabilityOptions[0]?.id),
    [debtLiabilityOptions, scenarioDebtId, scenarioTemplateId],
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
      selectedSnapshot: snapshotSelection,
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
      snapshotSelection,
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
  const preflightBlockSummary = preflightBlockIssues[0] ? formatPreflightIssue(preflightBlockIssues[0]) : "";
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
    if (!beginnerMode) return;
    setRunScenariosEnabled(true);
    setRunMonteCarloEnabled(false);
    setRunActionsEnabled(true);
    setRunDebtEnabled(true);
    setRunOptimizeEnabled(false);
    setIncludeProducts(false);
  }, [beginnerMode]);

  useEffect(() => {
    if (snapshotSelection.mode !== "history") return;
    const exists = snapshotItems.history.some((item) => item.id === snapshotSelection.id);
    if (!exists) {
      setSnapshotSelection({ mode: "latest" });
    }
  }, [snapshotItems.history, snapshotSelection]);

  useEffect(() => {
    if (!beginnerMode) return;
    const context = beginnerGoalContext(profileForm);
    const nextGoals = ensureBeginnerGoals(profileForm.goals, context);
    if (nextGoals.length !== profileForm.goals.length) {
      applyProfileForm({
        ...profileForm,
        goals: nextGoals,
      });
    }
  }, [beginnerMode, profileForm]);

  useEffect(() => {
    if (!beginnerMode) return;
    if (profileForm.debts.length > 0) return;
    addDebtRow();
  }, [beginnerMode, profileForm.debts.length]);

  useEffect(() => {
    setSaveWarningConfirmed(false);
  }, [preflightWarnSignature, runResult?.meta?.generatedAt]);

  useEffect(() => {
    if (!feedbackToast) return;
    const timer = window.setTimeout(() => setFeedbackToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [feedbackToast]);

  async function loadProfiles(nextSelectedId?: string): Promise<void> {
    setLoadingProfiles(true);
    setProfilesLoadError("");
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord[]> | null;
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
        setProfileName(picked.name);
        const nextForm = fromProfileJson(picked.profile, picked.name);
        setProfileForm(nextForm);
        syncProfileJsonFromForm(nextForm);
      }
    } catch (error) {
      setProfilesLoadError(error instanceof Error ? error.message : "프로필 목록 조회 중 오류가 발생했습니다.");
      setProfiles([]);
      setSelectedProfileId("");
    } finally {
      setLoadingProfiles(false);
    }
  }

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
      setBaselineRuns([]);
      setBaselineRunId("");
    } finally {
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
  }, [initialSelectedProfileId]);

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
    if (scenarioDebtId) return;
    const first = debtLiabilityOptions[0]?.id;
    if (first) setScenarioDebtId(first);
  }, [debtLiabilityOptions, scenarioDebtId]);

  useEffect(() => {
    if (!selectedProfile) return;
    setProfileName(selectedProfile.name);
    const nextForm = fromProfileJson(selectedProfile.profile, selectedProfile.name);
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
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

  function syncProfileJsonFromForm(nextForm: ProfileFormModel): void {
    const canonical = normalizeDraft(nextForm as unknown as FormDraft, profileName);
    setProfileJson(pretty(canonical));
    setProfileJsonError("");
  }

  function applyProfileForm(nextForm: ProfileFormModel): void {
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  function applyWizardOutputAction(output: PlanningWizardOutput): void {
    const nextForm = fromProfileJson(output.profile, profileName);
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    clearPendingSuggestions();
    window.alert("위저드 결과를 적용했습니다. 필요 시 값을 조정한 뒤 저장하세요.");
  }

  function replaceProfileFromJsonText(nextJson: string): void {
    setProfileJson(nextJson);
    setProfileJsonError("");
  }

  function applyProfileJsonEditorAction(): void {
    const parsed = tryParseJsonText<FormDraft>(profileJson);
    if (!parsed) {
      setProfileJsonError("프로필 JSON 파싱 실패: 형식을 확인하세요.");
      return;
    }
    const canonical = normalizeDraft(parsed, profileName);
    const validation = validateProfile(canonical);
    const profileErrors = validation.issues.filter((issue) => issue.severity === "error");
    if (profileErrors.length > 0) {
      const lines = profileErrors.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
      setProfileJsonError(`프로필 JSON 검증 실패\n- ${lines.join("\n- ")}`);
      return;
    }
    setProfileForm(fromProfileJson(canonical, profileName));
    setProfileJson(pretty(canonical));
    setProfileJsonError("");
    if (pendingSuggestions.length > 0) clearPendingSuggestions();
  }

  async function copyProfileJsonEditorAction(): Promise<void> {
    const result = await copyToClipboard(profileJson);
    if (!result.ok) {
      window.alert(result.message ?? "프로필 JSON 복사에 실패했습니다.");
      return;
    }
    window.alert("프로필 JSON을 클립보드에 복사했습니다.");
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
    const parsed = tryParseJsonText<Record<string, unknown>>(nextJson);
    if (!parsed) {
      setAssumptionsJsonError("가정 JSON 파싱 실패: 형식을 확인하세요.");
      return;
    }
    setAssumptionsJsonError("");
    const split = splitAssumptionsRecord(parsed);
    setAssumptionsForm(split.form);
    setAssumptionsExtraOverrides(split.extra);
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
    const parsed = tryParseJsonText<unknown[]>(nextJson);
    if (!parsed) {
      setDebtOffersJsonError("리파이낸스 제안 JSON 파싱 실패: 형식을 확인하세요.");
      return;
    }
    setDebtOffersJsonError("");
    setDebtOfferRows(parseDebtOffersFormRows(parsed));
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
    setProfileName(SAMPLE_PROFILE_V2_KO_NAME);
    const nextForm = fromProfileJson(SAMPLE_PROFILE_V2_KO, SAMPLE_PROFILE_V2_KO_NAME);
    setProfileForm(nextForm);
    syncProfileJsonFromForm(nextForm);
    clearPendingSuggestions();
    window.alert("샘플 프로필을 편집 영역에 불러왔습니다. Save를 눌러야 실제 저장됩니다.");
  }

  async function performProfileSave(mode: ProfileSaveMode, profile: ProfileV2 | Record<string, unknown>): Promise<boolean> {
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
      const payloadProfile = normalizeDraft(profile as unknown as FormDraft, profileName);

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          name: payloadName,
          profile: payloadProfile,
        })),
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
    if (profileValidation.errors.length > 0) {
      window.alert(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
      return;
    }

    const parsedProfile = toProfileJson(profileForm);
    const canonicalProfile = normalizeDraft(parsedProfile as unknown as FormDraft, profileName);

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
        body: JSON.stringify(withDevCsrf({ confirmText })),
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
    if (profileValidation.errors.length > 0) {
      window.alert(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
      return null;
    }
    const profile = normalizeDraft(profileForm as unknown as FormDraft, profileName) as unknown as Record<string, unknown>;
    const assumptions = assumptionsFormToRecord(assumptionsForm, assumptionsExtraOverrides);

    const horizon = parseHorizonMonths(horizonMonths);
    if (!horizon) return null;

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
        window.alert("Monte Carlo paths는 1~20000 범위여야 합니다.");
        return null;
      }
      if (!Number.isFinite(seed)) {
        window.alert("Monte Carlo seed는 숫자여야 합니다.");
        return null;
      }
    }

    const maxCandidates = Number.parseInt(maxCandidatesPerAction, 10);
    if (effectiveRunActionsEnabled && (!Number.isFinite(maxCandidates) || maxCandidates < 1 || maxCandidates > 20)) {
      window.alert("후보 최대 개수는 1~20 범위여야 합니다.");
      return null;
    }

    const extraPayment = Number.parseInt(debtExtraPaymentKrw, 10);
    if (!Number.isFinite(extraPayment) || extraPayment < 0) {
      window.alert("debt extraPaymentKrw는 0 이상의 숫자여야 합니다.");
      return null;
    }

    const offers = beginnerMode ? [] : debtOfferRowsToPayload(debtOfferRows);
    if (!beginnerMode) {
      const invalidLiabilityIds = validateDebtOfferLiabilityIds(
        offers.map((offer) => asRecord(offer)),
        profileForm.debts,
      );
      if (invalidLiabilityIds.length > 0) {
        window.alert(`리파이낸스 제안의 liabilityId가 프로필 부채와 일치하지 않습니다.\n- ${invalidLiabilityIds.join("\n- ")}`);
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
    const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (normalized !== "SNAPSHOT_NOT_FOUND") return false;
    setSnapshotSelection({ mode: "latest" });
    window.alert("선택한 스냅샷을 찾을 수 없습니다. 목록을 새로고침하거나 latest를 사용하세요.");
    return true;
  }

  function handleSnapshotNotFound(payload: ApiResponse<unknown> | null): boolean {
    return handleSnapshotNotFoundCode(payload?.error?.code);
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
        body: JSON.stringify(withDevCsrf({
          profile: core.profile,
          horizonMonths: core.horizon,
          assumptions: core.assumptions,
          ...(core.snapshotId ? { snapshotId: core.snapshotId } : {}),
          constraints,
          knobs,
          search,
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
      if (handleSnapshotNotFound(payload)) return;
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

  function toStepStatusesFromRunStages(stages: PlanningRunRecord["stages"]): StepStatus[] {
    if (!Array.isArray(stages) || stages.length < 1) return createInitialStepStatuses();
    return stages.map((stage) => {
      const startedAt = stage.startedAt ? Date.parse(stage.startedAt) : NaN;
      const endedAt = stage.endedAt ? Date.parse(stage.endedAt) : NaN;
      return {
        id: stage.id,
        state: stage.status,
        ...(stage.errorSummary ? { message: stage.errorSummary } : {}),
        ...(Number.isFinite(startedAt) ? { startedAt } : {}),
        ...(Number.isFinite(endedAt) ? { endedAt } : {}),
      };
    });
  }

  function toCombinedRunResultFromRecord(run: PlanningRunRecord): CombinedRunResult {
    const outputs = asRecord(run.outputs);
    return {
      meta: {
        generatedAt: run.createdAt,
        snapshot: run.meta.snapshot,
        health: run.meta.health as PlanningMeta["health"],
      },
      ...(isResultDtoV1(outputs.resultDto) ? { resultDto: outputs.resultDto } : {}),
      ...(isRecord(outputs.simulate) ? { simulate: asRecord(outputs.simulate) } : {}),
      ...(isRecord(outputs.scenarios) ? { scenarios: asRecord(outputs.scenarios) } : {}),
      ...(isRecord(outputs.monteCarlo) ? { monteCarlo: asRecord(outputs.monteCarlo) } : {}),
      ...(isRecord(outputs.actions) ? { actions: asRecord(outputs.actions) } : {}),
      ...(isRecord(outputs.debtStrategy) ? { debt: asRecord(outputs.debtStrategy) } : {}),
      stepStatuses: toStepStatusesFromRunStages(run.stages),
    };
  }

  function isTerminalOverallStatus(status: PlanningRunRecord["overallStatus"]): boolean {
    return status === "SUCCESS" || status === "PARTIAL_SUCCESS" || status === "FAILED";
  }

  async function pollRunUntilTerminal(runId: string, seed?: PlanningRunRecord): Promise<PlanningRunRecord | null> {
    let latest = seed ?? null;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (latest?.stages) {
        setPipelineStatuses(toStepStatusesFromRunStages(latest.stages));
      }
      if (latest && isTerminalOverallStatus(latest.overallStatus)) {
        return latest;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        return latest;
      }
      latest = payload.data;
    }
    return latest;
  }

  function buildScenarioMetaFromSelection(): ScenarioMeta | null {
    const fallbackDebtId = scenarioDebtId || debtLiabilityOptions[0]?.id;
    const patches = createScenarioPatchesFromTemplate(scenarioTemplateId, fallbackDebtId);
    if (patches.length < 1) {
      window.alert("선택한 시나리오 템플릿을 적용할 수 없습니다. 부채를 확인하세요.");
      return null;
    }
    const canonicalProfile = normalizeDraft(profileForm as unknown as FormDraft, profileName) as unknown as ProfileV2;
    const issues = validateScenario(canonicalProfile, patches);
    if (issues.length > 0) {
      const lines = issues.map((issue) => `${issue.path}: ${issue.message}`);
      window.alert(`시나리오 검증에 실패했습니다.\n- ${lines.join("\n- ")}`);
      return null;
    }
    return {
      id: scenarioId(),
      name: SCENARIO_TEMPLATE_LABELS[scenarioTemplateId],
      templateId: scenarioTemplateId,
      ...(baselineRunId ? { baselineRunId } : {}),
      createdAt: new Date().toISOString(),
      patches,
    };
  }

  async function runPlanAction(options?: { scenario?: ScenarioMeta }): Promise<void> {
    if (preflightHasBlockers) {
      const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
      window.alert(`사전 점검 오류를 먼저 해결하세요.\n${details}`);
      return;
    }
    if (!selectedProfileId) {
      window.alert("실행할 프로필을 먼저 선택하세요.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;

    setRunning(true);
    setPipelineStatuses(createInitialStepStatuses());
    setSavedRun(null);

    try {
      const synced = await syncProfileIfNeeded();
      if (!synced) return;

      const response = await fetch("/api/planning/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          title: options?.scenario ? `${runTitle} · ${options.scenario.name}` : runTitle,
          ...(options?.scenario ? { scenario: options.scenario } : {}),
          input: buildRunInput(parsed),
        })),
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (handleSnapshotNotFound(payload)) return;
      if (!parseApiPayload(locale, response, payload, "실행 요청에 실패했습니다.")) return;

      const created = payload.data;
      if (!created?.id) {
        window.alert("실행 ID를 확인하지 못했습니다.");
        return;
      }
      const finalRun = await pollRunUntilTerminal(created.id, created);
      if (!finalRun) {
        window.alert("실행 상태를 확인하지 못했습니다.");
        return;
      }

      const nextResult = toCombinedRunResultFromRecord(finalRun);
      setRunResult(nextResult);
      setSavedRun(finalRun);
      setPipelineStatuses(nextResult.stepStatuses);
      if (selectedProfileId) {
        void loadBaselineRuns(selectedProfileId);
      }
      setActiveTab("summary");
      setShowAllActions(false);

      const statusById = new Map(nextResult.stepStatuses.map((row) => [row.id, row]));
      const notices: string[] = [];
      if (statusById.get("scenarios")?.state === "FAILED") notices.push("시나리오 계산에 실패했습니다.");
      if (statusById.get("monteCarlo")?.state === "FAILED") notices.push("몬테카를로 계산에 실패했습니다.");
      if (statusById.get("monteCarlo")?.state === "SKIPPED" && statusById.get("monteCarlo")?.message?.includes("budget")) {
        notices.push("몬테카를로는 예산 초과로 생략되었습니다.");
      }
      if (statusById.get("actions")?.state === "FAILED") notices.push("실행 계획 생성에 실패했습니다.");
      if (statusById.get("debt")?.state === "FAILED") notices.push("부채 분석에 실패했습니다.");
      if (finalRun.overallStatus === "PARTIAL_SUCCESS") notices.push("전체 상태: PARTIAL_SUCCESS");
      if (finalRun.overallStatus === "FAILED") notices.push("전체 상태: FAILED");

      if (notices.length > 0) {
        window.alert(`실행을 완료했습니다.\n- ${notices.join("\n- ")}`);
      } else {
        window.alert("실행을 완료했습니다.");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "실행 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function runScenarioAction(): Promise<void> {
    const scenario = buildScenarioMetaFromSelection();
    if (!scenario) return;
    await runPlanAction({ scenario });
  }

  async function syncProfileIfNeeded(): Promise<boolean> {
    if (!selectedProfileId) {
      window.alert("저장할 프로필을 먼저 선택하세요.");
      return false;
    }

    if (profileValidation.errors.length > 0) {
      window.alert(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidation.errors.join("\n- ")}`);
      return false;
    }
    const parsedProfile = toProfileJson(profileForm);
    const canonicalProfile = normalizeDraft(parsedProfile as unknown as FormDraft, profileName);

    const suggestions = suggestProfileNormalizations(parsedProfile);
    if (suggestions.length > 0) {
      setPendingProfileSave({ mode: "update", profile: parsedProfile });
      setPendingSuggestions(suggestions);
      setAcceptedSuggestionCodes([]);
      window.alert("프로필 저장 전 정규화 제안을 먼저 확인해주세요.");
      return false;
    }

    const before = pretty(normalizeDraft((selectedProfile?.profile ?? {}) as FormDraft, selectedProfile?.name ?? profileName));
    const after = pretty(canonicalProfile);
    const dirty = before !== after || (selectedProfile?.name ?? "") !== profileName;
    if (!dirty) return true;

    const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withDevCsrf({
        name: profileName,
        profile: canonicalProfile,
      })),
    });
    const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
    if (!parseApiPayload(locale, res, payload, "실행 기록 저장 전 프로필 동기화에 실패했습니다.")) {
      return false;
    }

    await loadProfiles(selectedProfileId);
    return true;
  }

  function buildRunInput(parsed: ParsedRunInputs): Record<string, unknown> {
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
    };
  }

  async function persistRunAction(
    parsed: ParsedRunInputs,
    options?: { silent?: boolean; bypassWarningConfirmation?: boolean },
  ): Promise<PlanningRunRecord | null> {
    if (!selectedProfileId) {
      if (!options?.silent) window.alert("저장할 프로필을 먼저 선택하세요.");
      return null;
    }
    if (preflightHasBlockers) {
      if (!options?.silent) {
        const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
        window.alert(`사전 점검 오류로 저장할 수 없습니다.\n${details}`);
      }
      return null;
    }
    if (preflightWarnIssues.length > 0 && !options?.bypassWarningConfirmation) {
      if (!options?.silent) {
        window.alert("사전 점검 경고를 확인한 뒤 '이대로 저장' 체크를 켜주세요.");
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
          title: runTitle,
          input: buildRunInput(parsed),
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (handleSnapshotNotFound(payload)) return null;
      if (!parseApiPayload(locale, res, payload, "실행 기록 저장에 실패했습니다.")) return null;

      const saved = payload.data ?? null;
      setSavedRun(saved);
      if (!options?.silent) {
        window.alert("실행 기록 저장을 완료했습니다. /planning/runs에서 비교할 수 있습니다.");
      }
      return saved;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "실행 기록 저장 중 오류가 발생했습니다.");
      return null;
    } finally {
      setSavingRun(false);
    }
  }

  async function saveRunAction(): Promise<void> {
    if (!runResult?.simulate) {
      window.alert("먼저 실행을 진행하세요.");
      return;
    }
    if (saveBlockedByHealth) {
      window.alert("치명 경고 확인 체크 후 저장할 수 있습니다.");
      return;
    }
    if (preflightHasBlockers) {
      const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
      window.alert(`사전 점검 오류로 저장할 수 없습니다.\n${details}`);
      return;
    }
    if (saveNeedsWarningConfirmation) {
      window.alert("사전 점검 경고를 확인한 뒤 '이대로 저장' 체크를 켜주세요.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;

    await persistRunAction(parsed, { bypassWarningConfirmation: true });
  }

  async function submitPlanningFeedbackAction(): Promise<void> {
    const title = feedbackTitle.trim();
    const message = feedbackMessage.trim();
    if (title.length < 2 || title.length > 160) {
      window.alert("피드백 제목은 2~160자로 입력하세요.");
      return;
    }
    if (message.length < 5 || message.length > 5000) {
      window.alert("피드백 내용은 5~5000자로 입력하세요.");
      return;
    }

    const snapshotFromRun = runResult?.meta?.snapshot;
    const snapshotFromSelection = selectedSnapshotItem;
    const snapshotContext = {
      ...(asString(snapshotFromRun?.id || snapshotFromSelection?.id) ? { id: asString(snapshotFromRun?.id || snapshotFromSelection?.id) } : {}),
      ...(asString(snapshotFromRun?.asOf || snapshotFromSelection?.asOf) ? { asOf: asString(snapshotFromRun?.asOf || snapshotFromSelection?.asOf) } : {}),
      ...(asString(snapshotFromRun?.fetchedAt || snapshotFromSelection?.fetchedAt) ? { fetchedAt: asString(snapshotFromRun?.fetchedAt || snapshotFromSelection?.fetchedAt) } : {}),
      ...(typeof snapshotFromRun?.missing === "boolean" ? { missing: snapshotFromRun.missing } : {}),
    };

    setFeedbackSubmitting(true);
    try {
      const response = await fetch("/api/ops/feedback/planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          from: { screen: "/planning" },
          context: {
            ...(Object.keys(snapshotContext).length > 0 ? { snapshot: snapshotContext } : {}),
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
        data?: PlanningFeedbackCreateResponse;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "피드백 저장에 실패했습니다.");
      }

      const createdId = asString(payload.data?.id);
      setFeedbackModalOpen(false);
      setFeedbackCategory("ux");
      setFeedbackTitle("");
      setFeedbackMessage("");
      setFeedbackToast(createdId ? `저장됨(${createdId})` : "저장됨");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "피드백 저장 중 오류가 발생했습니다.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  const resultDto = runResult
    ? (isResultDtoV1(runResult.resultDto)
      ? runResult.resultDto
      : buildResultDtoV1({
        generatedAt: runResult.meta?.generatedAt,
        policyId,
        meta: {
          snapshot: runResult.meta?.snapshot,
          health: runResult.meta?.health,
          cache: runResult.meta?.cache,
        },
        simulate: runResult.simulate,
        scenarios: runResult.scenarios,
        monteCarlo: runResult.monteCarlo,
        actions: runResult.actions,
        debt: runResult.debt,
      }))
    : null;

  const simulateRow = asRecord(resultDto?.raw?.simulate);
  const simulateTimeline = asArray(simulateRow.timeline).map((entry) => asRecord(entry));
  const keyTimelinePoints = (resultDto?.timeline.points ?? []).map((point) => ({
    monthIndex: point.monthIndex,
    row: {
      income: point.incomeKrw ?? 0,
      expenses: point.expensesKrw ?? 0,
      debtPayment: point.debtPaymentKrw ?? 0,
      operatingCashflow: 0,
      liquidAssets: point.cashKrw ?? 0,
      netWorth: point.netWorthKrw ?? 0,
      totalDebt: point.totalDebtKrw ?? 0,
    },
  }));
  const chartPoints = buildPlanningChartPoints({
    timeline: simulateTimeline,
    keyTimelinePoints,
  });
  const chartMode: "full" | "key" | "none" = simulateTimeline.length > 3
    ? "full"
    : chartPoints.length > 0
      ? "key"
      : "none";
  const simulateWarnings = asArray(simulateRow.warnings).map((entry) => asRecord(entry));
  const simulateGoals = asArray(simulateRow.goalStatus ?? simulateRow.goalsStatus).map((entry) => asRecord(entry));
  const aggregatedWarningsForInsight = (resultDto?.warnings.aggregated ?? []).map((warning) => {
    const severity: "info" | "warn" | "critical" = warning.severity === "critical" || warning.severity === "warn"
      ? warning.severity
      : "info";
    return {
      code: warning.code,
      severity,
      count: warning.count,
      ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
      ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
      sampleMessage: warning.sampleMessage ?? `${warning.code} 경고가 감지되었습니다.`,
    };
  });
  const aggregatedWarnings = aggregatedWarningsForInsight.map((warning) => ({
    ...warning,
    ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth + 1 } : {}),
    ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth + 1 } : {}),
  }));
  const goalTableRows = (resultDto?.goals ?? []).map((goal) => {
    const target = Number(goal.targetKrw ?? 0);
    const current = Number(goal.currentKrw ?? 0);
    const shortfall = Number(goal.shortfallKrw ?? Math.max(0, target - current));
    const progressPct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
    return {
      goalId: goal.id,
      name: goal.title,
      achieved: goal.achieved === true,
      targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
      progressPct,
      shortfallKrw: shortfall,
      interpretation: String(goal.comment ?? (goal.achieved ? "기한 내 목표를 달성했습니다." : "기한 내 달성을 위해 추가 조정이 필요합니다.")),
    };
  });
  const goalsForInsight = (resultDto?.goals ?? []).map((goal) => ({
    name: goal.title,
    targetAmount: Number(goal.targetKrw ?? 0),
    currentAmount: Number(goal.currentKrw ?? 0),
    shortfall: Number(goal.shortfallKrw ?? 0),
    targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
    achieved: goal.achieved === true,
    comment: String(goal.comment ?? ""),
  }));
  const timelineSummaryRows = (resultDto?.timeline.points ?? []).map((row) => {
    const dsrRatio = typeof resultDto?.summary.dsrPct === "number"
      ? ((resultDto.summary.dsrPct > 1 ? resultDto.summary.dsrPct / 100 : resultDto.summary.dsrPct))
      : 0;
    return {
      label: row.label === "start" ? "시작" as const : row.label === "mid" ? "중간" as const : "마지막" as const,
      monthIndex: row.monthIndex,
      month: row.monthIndex + 1,
      liquidAssetsKrw: Number(row.cashKrw ?? 0),
      netWorthKrw: Number(row.netWorthKrw ?? 0),
      totalDebtKrw: Number(row.totalDebtKrw ?? 0),
      debtServiceRatio: dsrRatio,
      interpretation: "핵심 포인트 구간입니다.",
    };
  });

  const scenariosRow = asRecord(resultDto?.scenarios);
  const scenarioTable = asArray(resultDto?.scenarios?.table).map((entry) => asRecord(entry));
  const scenariosBase = scenarioTable.find((entry) => String(entry.id ?? "") === "base") ?? {};
  const scenariosList = scenarioTable.filter((entry) => String(entry.id ?? "") !== "base");
  const scenariosBaseSummary = asRecord(asRecord(scenariosBase).summary);
  const scenariosBaseWarnings = asArray(resultDto?.warnings.top).map((entry) => ({
    reasonCode: asString(asRecord(entry).code),
    message: asString(asRecord(entry).message),
  }));
  const scenarioComparisonRows = scenariosList.map((scenario) => {
    const summary = asRecord(scenario.summary);
    const summarySource = Object.keys(summary).length > 0 ? summary : scenario;
    const diffVsBase = asRecord(scenario.diffVsBase);
    const diffMetrics = asRecord(diffVsBase.keyMetrics);
    const shortWhy = asArray(diffVsBase.shortWhy).map((entry) => String(entry));
    return {
      id: String(scenario.id ?? ""),
      title: String(scenario.title ?? "시나리오"),
      endNetWorthKrw: Number(summarySource.endNetWorthKrw ?? summarySource.endNetWorth ?? 0),
      worstCashKrw: Number(summarySource.worstCashKrw ?? 0),
      goalsAchieved: Number(summarySource.goalsAchievedCount ?? summarySource.goalsAchieved ?? 0),
      warningsCount: Number(summarySource.warningsCount ?? 0),
      endNetWorthDeltaKrw: Number(diffMetrics.endNetWorthDeltaKrw ?? scenario.endNetWorthDeltaKrw ?? 0),
      goalsAchievedDelta: Number(diffMetrics.goalsAchievedDelta ?? scenario.goalsAchievedDelta ?? 0),
      shortWhy,
    };
  });

  const monteRow = asRecord(resultDto?.monteCarlo);
  const monteData = monteRow;
  const monteProbabilities = asRecord(monteData.probabilities);
  const montePercentiles = asRecord(monteData.percentiles);
  const monteEndNetWorth = asRecord(montePercentiles.endNetWorthKrw);
  const monteWorstCash = asRecord(montePercentiles.worstCashKrw);
  const monteDepletionProb = typeof monteProbabilities.retirementDepletionBeforeEnd === "number"
    ? monteProbabilities.retirementDepletionBeforeEnd
    : undefined;

  const actionsRow = asRecord(resultDto?.actions);
  const actionsList = asArray(actionsRow.items);
  const topActionTitles = asArray(actionsRow.top3)
    .map((entry) => asString(asRecord(entry).title))
    .filter((title) => title.length > 0)
    .slice(0, 3);
  const actionTableRows = actionsList.map((entry) => {
    const row = asRecord(entry);
    const whyRows = asArray(row.why);
    const steps = asArray(row.steps).map((step) => String(step).trim()).filter((step) => step.length > 0);
    const cautions = asArray(row.cautions).map((caution) => String(caution).trim()).filter((caution) => caution.length > 0);
    return {
      code: String(row.code ?? "UNKNOWN"),
      severity: String(row.severity ?? "info"),
      title: String(row.title ?? "권장 조치"),
      summary: String(row.summary ?? "").trim(),
      whyCount: whyRows.length,
      steps,
      cautions,
    };
  });
  const visibleActionRows = showAllActions ? actionTableRows : actionTableRows.slice(0, LIMITS.actionsTop);
  const omittedActionRows = Math.max(0, actionTableRows.length - visibleActionRows.length);
  const actionsTopForInsight: ActionItemV2[] = asArray(actionsRow.top3).map((entry) => asRecord(entry) as ActionItemV2);

  const achievedGoalCount = goalTableRows.filter((goal) => goal.achieved).length;
  const dtoDsrRatio = typeof resultDto?.summary.dsrPct === "number"
    ? (resultDto.summary.dsrPct > 1 ? resultDto.summary.dsrPct / 100 : resultDto.summary.dsrPct)
    : 0;
  const contributionSkippedCount = aggregatedWarningsForInsight.find((warning) => warning.code === "CONTRIBUTION_SKIPPED")?.count ?? 0;
  const hasNegativeCashflow = aggregatedWarningsForInsight.some((warning) => warning.code === "NEGATIVE_CASHFLOW");
  const missedGoals = goalTableRows.filter((goal) => !goal.achieved).length;
  const guideBadge = (() => {
    if ((resultDto?.summary.worstCashKrw ?? 0) <= 0 || hasNegativeCashflow || dtoDsrRatio >= 0.6) {
      return {
        status: "risk" as const,
        reason: "현금 부족 또는 과도한 부채부담 신호가 있어 즉시 조정이 필요합니다.",
        minCashKrw: resultDto?.summary.worstCashKrw ?? 0,
        maxDsr: dtoDsrRatio,
        missedGoals,
        contributionSkippedCount,
      };
    }
    if (dtoDsrRatio >= 0.4 || missedGoals > 0 || contributionSkippedCount >= 3) {
      return {
        status: "warn" as const,
        reason: "일부 지표가 경고 구간입니다. 목표/지출/상환 계획을 점검하세요.",
        minCashKrw: resultDto?.summary.worstCashKrw ?? 0,
        maxDsr: dtoDsrRatio,
        missedGoals,
        contributionSkippedCount,
      };
    }
    return {
      status: "ok" as const,
      reason: "현재 가정 기준으로 주요 지표가 안정 범위입니다.",
      minCashKrw: resultDto?.summary.worstCashKrw ?? 0,
      maxDsr: dtoDsrRatio,
      missedGoals,
      contributionSkippedCount,
    };
  })();

  const debtRow = asRecord(resultDto?.debt);
  const debtData = asRecord(debtRow);
  const debtMeta = {
    debtServiceRatio: typeof debtData.dsrPct === "number"
      ? (debtData.dsrPct > 1 ? debtData.dsrPct / 100 : debtData.dsrPct)
      : 0,
    totalMonthlyPaymentKrw: Number(asRecord(asRecord(resultDto?.raw?.debt).summary).totalMonthlyPaymentKrw ?? 0),
  };
  const debtSummaries = asArray(debtData.summaries).map((entry) => asRecord(entry));
  const debtRefinance = asArray(debtData.refinance).map((entry) => asRecord(entry));
  const debtWhatIf = asRecord(debtData.whatIf);
  const debtWarningsRaw = asArray(asRecord(resultDto?.raw?.debt).warnings).map((entry) => asRecord(entry));
  const debtWarnings = aggregateGuideWarnings(debtWarningsRaw.map((warning) => ({
    reasonCode: warning.code,
    message: warning.message,
    data: warning.data,
  })));
  const debtWhatIfSummary = [
    {
      title: "상환기간 연장",
      count: asArray(debtWhatIf.termExtensions).length,
      interpretation: "월 상환액을 낮추는 대신 총이자는 늘어날 수 있습니다.",
    },
    {
      title: "상환기간 단축",
      count: asArray(debtWhatIf.termReductions).length,
      interpretation: "월 상환 부담은 늘지만 총이자는 줄어드는 방향입니다.",
    },
    {
      title: "추가상환",
      count: asArray(debtWhatIf.extraPayments).length,
      interpretation: "여유자금을 투입해 만기 단축과 이자 절감을 기대할 수 있습니다.",
    },
  ];
  const optimizeCandidates = optimizeResult?.candidates ?? [];

  const healthDisabledReason = saveBlockedByHealth
    ? (
      healthWarnings.some((warning) => warning.code === "SNAPSHOT_VERY_STALE")
        ? "치명 경고 확인이 필요합니다. 스냅샷이 매우 오래되었습니다. /ops/assumptions에서 동기화를 권장합니다."
        : "치명 경고 확인이 필요합니다. 확인 전에는 실행 기록 저장 및 고비용 액션이 제한됩니다."
    )
    : "";
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
  const debtStatus = statusFor("debt");
  const hasScenariosData = Boolean(resultDto?.scenarios);
  const hasMonteCarloData = Boolean(resultDto?.monteCarlo);
  const hasActionsData = Boolean(resultDto?.actions);
  const hasDebtData = Boolean(resultDto?.debt);

  const simulateSummary = asRecord(resultDto?.summary);
  const timelineLastRow = simulateTimeline.length > 0 ? simulateTimeline[simulateTimeline.length - 1] : {};
  const summaryEndNetWorthKrw = typeof simulateSummary.endNetWorthKrw === "number"
    ? simulateSummary.endNetWorthKrw
    : Number(asRecord(timelineLastRow).netWorth ?? 0);
  const summaryWorstCashKrw = typeof simulateSummary.worstCashKrw === "number"
    ? simulateSummary.worstCashKrw
    : Number(simulateSummary.minCashKrw ?? 0);
  const summaryWorstCashMonth = typeof simulateSummary.worstCashMonthIndex === "number"
    ? Math.max(0, Math.trunc(simulateSummary.worstCashMonthIndex))
    : 0;
  const summaryGoalsAchieved = Number(asRecord(simulateSummary.goalsAchieved).achieved ?? achievedGoalCount);
  const summaryGoalsText = goalTableRows.length > 0 ? `${summaryGoalsAchieved}/${goalTableRows.length}` : "-";
  const summaryDsr = typeof simulateSummary.dsrPct === "number"
    ? (simulateSummary.dsrPct > 1 ? simulateSummary.dsrPct / 100 : simulateSummary.dsrPct)
    : debtMeta.debtServiceRatio;
  const summaryStartPoint = (resultDto?.timeline.points ?? []).find((point) => point.label === "start")
    ?? (resultDto?.timeline.points ?? [])[0];
  const summaryStartIncome = typeof summaryStartPoint?.incomeKrw === "number" ? summaryStartPoint.incomeKrw : undefined;
  const summaryStartExpenses = typeof summaryStartPoint?.expensesKrw === "number" ? summaryStartPoint.expensesKrw : undefined;
  const summaryMonthlySurplusKrw = typeof summaryStartIncome === "number" && typeof summaryStartExpenses === "number"
    ? summaryStartIncome - summaryStartExpenses - Number(summaryStartPoint?.debtPaymentKrw ?? 0)
    : undefined;
  const emergencyGoalForSummary = (resultDto?.goals ?? []).find((goal) => goal.type === "emergencyFund");
  const summaryEmergencyFundMonths = typeof emergencyGoalForSummary?.currentKrw === "number"
    && typeof summaryStartExpenses === "number"
    && summaryStartExpenses > 0
    ? emergencyGoalForSummary.currentKrw / summaryStartExpenses
    : undefined;
  const summaryCriticalWarnings = Math.max(0, Math.trunc(Number(simulateSummary.criticalWarnings ?? resultDto?.meta.health?.criticalCount ?? 0)));
  const warningsSummaryTop5 = aggregatedWarnings.slice(0, 5);

  const keyFindings: string[] = [];
  if (summaryWorstCashKrw <= 0) {
    keyFindings.push("현금흐름 위험: 기간 중 최저 현금이 0 이하로 내려갑니다.");
  } else {
    keyFindings.push("현금흐름: 현재 가정에서는 현금이 0 이하로 내려가지 않습니다.");
  }
  if (typeof summaryDsr === "number" && Number.isFinite(summaryDsr)) {
    if (summaryDsr >= 0.6) keyFindings.push("부채부담 위험: DSR이 60% 이상입니다.");
    else if (summaryDsr >= 0.4) keyFindings.push("부채부담 주의: DSR이 40% 이상입니다.");
    else keyFindings.push("부채부담: DSR이 상대적으로 안정 구간입니다.");
  }
  if (goalTableRows.length > 0) {
    if (achievedGoalCount < goalTableRows.length) keyFindings.push(`목표 진행: ${goalTableRows.length - achievedGoalCount}개 목표가 미달입니다.`);
    else keyFindings.push("목표 진행: 현재 시뮬레이션에서 모든 목표를 달성했습니다.");
  }
  if (keyFindings.length < 3) {
    keyFindings.push(`경고 요약: 집계 경고 ${aggregatedWarnings.length}개(치명 ${summaryCriticalWarnings}개).`);
  }

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
  const beginnerStepProfileDone = profileValidation.errors.length === 0
    && (
      profileForm.monthlyIncomeNet > 0
      || profileForm.monthlyEssentialExpenses > 0
      || profileForm.monthlyDiscretionaryExpenses > 0
      || profileForm.liquidAssets > 0
      || profileForm.investmentAssets > 0
    );
  const beginnerStepRunDone = Boolean(runResult?.simulate);
  const beginnerStepSaveDone = Boolean(savedRun?.id);

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
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              프로필
              <select
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
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
            <Link className="font-semibold text-emerald-700" href={runsPageHref}>실행 기록</Link>
            <Link className="font-semibold text-emerald-700" href={reportsPageHref}>리포트</Link>
          </div>
        )}
      />

      {feedbackToast ? (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700">
          {feedbackToast}
        </Card>
      ) : null}

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">{t(locale, "DISCLAIMER_TITLE")}</p>
        <p className="mt-1 text-xs text-amber-800">{t(locale, "DISCLAIMER_BODY")}</p>
      </Card>

      <Card className="mb-6">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            checked={beginnerMode}
            onChange={(event) => setBeginnerMode(event.target.checked)}
            type="checkbox"
          />
          초보자 모드
        </label>
      </Card>
      {beginnerMode ? (
        <Card className="mb-6 border border-slate-200 bg-slate-50">
          <p className="text-xs font-semibold text-slate-800">5분 진행 안내</p>
          <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
            <p className={`rounded-lg border px-3 py-2 ${beginnerStepProfileDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`}>
              1) 프로필 입력 {beginnerStepProfileDone ? "완료" : "대기"}
            </p>
            <p className={`rounded-lg border px-3 py-2 ${beginnerStepRunDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`}>
              2) 실행 {beginnerStepRunDone ? "완료" : "대기"}
            </p>
            <p className={`rounded-lg border px-3 py-2 ${beginnerStepSaveDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`}>
              3) 저장 {beginnerStepSaveDone ? "완료" : "대기"}
            </p>
          </div>
        </Card>
      ) : null}

      {beginnerMode ? (
        <PlanningOnboardingWizard
          disabled={savingProfile || running || savingRun}
          onApply={applyWizardOutputAction}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4" data-testid="planning-profile-form">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">프로필 선택</h2>
            <span className="text-xs text-slate-500">{beginnerMode ? "초보자 모드" : "고급 모드"}</span>
          </div>

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

          <label className="block text-xs font-semibold text-slate-600">
            프로필 선택
            <select
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
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

          <label className="block text-xs font-semibold text-slate-600">
            프로필 이름
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={profileName}
              onChange={(event) => {
                setProfileName(event.target.value);
                updateProfileField("name", event.target.value);
              }}
            />
          </label>

          <div className="space-y-4 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">월 현금흐름</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-slate-600">
                월 실수령
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                    type="number"
                    placeholder="예: 5,100,000"
                    value={profileForm.monthlyIncomeNet}
                    onChange={(event) => updateProfileField("monthlyIncomeNet", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                필수지출
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                    type="number"
                    placeholder="예: 2,200,000"
                    value={profileForm.monthlyEssentialExpenses}
                    onChange={(event) => updateProfileField("monthlyEssentialExpenses", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                선택지출
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                    type="number"
                    placeholder="예: 900,000"
                    value={profileForm.monthlyDiscretionaryExpenses}
                    onChange={(event) => updateProfileField("monthlyDiscretionaryExpenses", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">자산</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                현금(예금)
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                    type="number"
                    placeholder="예: 12,000,000"
                    value={profileForm.liquidAssets}
                    onChange={(event) => updateProfileField("liquidAssets", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                투자자산
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                    type="number"
                    placeholder="예: 18,000,000"
                    value={profileForm.investmentAssets}
                    onChange={(event) => updateProfileField("investmentAssets", toFiniteNumber(event.target.value))}
                  />
                  <span className="text-[11px] font-medium text-slate-500">(원)</span>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
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
              <p className="text-xs text-slate-500">등록된 부채가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {profileForm.debts.map((debt, index) => {
                  const estimated = estimateDebtMonthlyPaymentKrw(debt);
                  return (
                    <div className="rounded-lg border border-slate-200 p-3" key={debt.id || `debt-${index}`}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-slate-600">
                          부채 ID
                          <input
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                            value={debt.id}
                            onChange={(event) => updateDebtRow(index, { ...debt, id: event.target.value })}
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          이름
                          <input
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                            value={debt.name}
                            onChange={(event) => updateDebtRow(index, { ...debt, name: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <label className="block text-xs font-semibold text-slate-600">
                          대출 잔액
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                              type="number"
                              placeholder="예: 25,000,000"
                              value={debt.balance}
                              onChange={(event) => updateDebtRow(index, { ...debt, balance: toFiniteNumber(event.target.value) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(원)</span>
                          </div>
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          금리
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                              type="number"
                              placeholder="예: 4.8"
                              value={debt.aprPct}
                              onChange={(event) => updateDebtRow(index, { ...debt, aprPct: toFiniteNumber(event.target.value) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(%)</span>
                          </div>
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          월 상환액
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                              type="number"
                              min={0}
                              placeholder="예: 650,000"
                              value={debt.monthlyPayment}
                              onChange={(event) => updateDebtRow(index, { ...debt, monthlyPayment: Math.max(0, toFiniteNumber(event.target.value)) })}
                            />
                            <span className="text-[11px] font-medium text-slate-500">(원)</span>
                          </div>
                        </label>
                      </div>
                      <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">상환 조건(고급)</summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-semibold text-slate-600">
                            상환 방식
                            <select
                              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
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
                          <label className="block text-xs font-semibold text-slate-600">
                            남은 개월
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                      type="number"
                      value={beginnerGoals.lumpSum.targetAmount}
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
                      type="number"
                      value={beginnerGoals.retirement.targetAmount}
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
              <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">목표 목록</p>
                  <Button onClick={addGoalRow} size="sm" variant="outline">목표 추가</Button>
                </div>
                {profileForm.goals.length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 목표가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {profileForm.goals.map((goal, index) => (
                      <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr_auto]" key={goal.id || `goal-${index}`}>
                          <input
                            aria-label={`목표 ${index + 1} 이름`}
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            value={goal.name}
                            onChange={(event) => updateGoalRow(index, { ...goal, name: event.target.value })}
                            placeholder="목표 이름"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 목표 금액`}
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="number"
                            value={goal.targetAmount}
                            onChange={(event) => updateGoalRow(index, { ...goal, targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="목표 금액"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 현재 금액`}
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="number"
                            value={goal.currentAmount}
                            onChange={(event) => updateGoalRow(index, { ...goal, currentAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="현재 금액"
                          />
                          <input
                            aria-label={`목표 ${index + 1} 목표 시점`}
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="month"
                            value={monthOffsetToInput(goal.targetMonth)}
                            onChange={(event) => updateGoalRow(index, { ...goal, targetMonth: inputToMonthOffset(event.target.value) })}
                          />
                          <input
                            aria-label={`목표 ${index + 1} 우선순위`}
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="number"
                            min={1}
                            value={goal.priority}
                            onChange={(event) => updateGoalRow(index, { ...goal, priority: Math.max(1, Math.trunc(toFiniteNumber(event.target.value, 1))) })}
                            placeholder="우선순위(1~10)"
                          />
                          <Button aria-label={`목표 ${index + 1} 삭제`} onClick={() => removeGoalRow(index)} size="sm" variant="ghost">삭제</Button>
                        </div>
                      ))}
                    </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <label className="flex items-center gap-2">
              <span>비상금 목표(개월):</span>
              <input
                className="h-8 w-24 rounded-lg border border-emerald-300 bg-white px-2 text-xs text-slate-700"
                min={1}
                type="number"
                value={profileSummary.emergencyTargetMonths}
                onChange={(event) => {
                  const months = Math.max(1, Math.trunc(toFiniteNumber(event.target.value, profileSummary.emergencyTargetMonths)));
                  const monthlyExpenses = Math.max(0, profileForm.monthlyEssentialExpenses + profileForm.monthlyDiscretionaryExpenses);
                  updateBeginnerGoal("emergency", {
                    targetAmount: Math.round(monthlyExpenses * months),
                  });
                }}
              />
            </label>
            <p>월 잉여: <span className="font-semibold">{formatKrw(locale, profileSummary.monthlySurplusKrw)}</span></p>
            <p>DSR(월부채상환/수입): <span className="font-semibold">{formatRatioPct(locale, profileSummary.debtServiceRatio)}</span></p>
            <p>총 월상환액: <span className="font-semibold">{formatKrw(locale, profileSummary.estimatedMonthlyDebtPaymentKrw)}</span></p>
            <p>비상금 목표액: <span className="font-semibold">{formatKrw(locale, profileSummary.emergencyTargetKrw)}</span></p>
            <p>비상금 부족분: <span className="font-semibold">{formatKrw(locale, profileSummary.emergencyGapKrw)}</span></p>
          </div>

          {profileValidation.errors.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <p className="font-semibold">입력 오류 ({profileValidation.errors.length})</p>
              {profileValidation.errors.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </div>
          ) : null}

          {profileValidation.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">입력 경고 ({profileValidation.warnings.length})</p>
              {profileValidation.warnings.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </div>
          ) : null}

          <details className="rounded-xl border border-slate-200 p-3" data-testid="planning-advanced-toggle">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700" data-testid="planning-advanced-toggle-button">Advanced: Raw Profile JSON</summary>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              편집 (JSON)
              <textarea
                className="mt-1 min-h-[260px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                data-testid="planning-json-editor"
                value={profileJson}
                onChange={(event) => replaceProfileFromJsonText(event.target.value)}
              />
              {profileJsonError ? <p className="mt-2 text-xs text-rose-700">{profileJsonError}</p> : null}
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => applyProfileJsonEditorAction()} size="sm" variant="outline">Apply</Button>
              <Button onClick={() => void copyProfileJsonEditorAction()} size="sm" variant="ghost">Copy</Button>
            </div>
          </details>

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
                    <span>[{formatSeverityKo(suggestion.severity)}] {suggestion.message}</span>
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
            <Button data-testid="planning-profile-create-button" disabled={savingProfile} onClick={() => beginProfileSave("create")} variant="primary">새로 만들기</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("duplicate")} variant="outline">복제</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("update")} variant="outline">저장</Button>
            <Button disabled={savingProfile || !selectedProfileId} onClick={() => void deleteProfileAction()} variant="ghost">삭제</Button>
            <Button disabled={loadingProfiles} onClick={() => void loadProfiles(selectedProfileId)} variant="ghost">목록 새로고침</Button>
            <Button disabled={savingProfile} onClick={loadSampleProfileAction} variant="ghost">샘플 프로필 불러오기</Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">실행 옵션</h2>
            <span className="text-xs text-slate-500">기본값만으로도 실행 가능합니다.</span>
          </div>

          <SnapshotPicker
            advancedEnabled={!beginnerMode}
            items={snapshotItems}
            value={snapshotSelection}
            onChange={(next) => setSnapshotSelection(next)}
          />

          <label className="block text-xs font-semibold text-slate-600">
            분배 정책
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
            실행 제목
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              value={runTitle}
              onChange={(event) => setRunTitle(event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
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
                className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
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
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700">가정(Assumptions) override</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  인플레이션(%)
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                    type="number"
                    value={assumptionsForm.inflationPct}
                    onChange={(event) => updateAssumptionsField("inflationPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.inflationPct))}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  기대수익률(%)
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                    type="number"
                    value={assumptionsForm.expectedReturnPct}
                    onChange={(event) => updateAssumptionsField("expectedReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct))}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  현금수익률(%)
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                    type="number"
                    value={assumptionsForm.cashReturnPct}
                    onChange={(event) => updateAssumptionsField("cashReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.cashReturnPct))}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  인출률(%)
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                    type="number"
                    value={assumptionsForm.withdrawalRatePct}
                    onChange={(event) => updateAssumptionsField("withdrawalRatePct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct))}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {beginnerMode ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>시나리오: ON</p>
              <p>Monte Carlo: OFF</p>
              <p>Actions: ON (상품 후보 OFF)</p>
              <p>Debt 분석: ON</p>
            </div>
          ) : (
            <div className="grid gap-2 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input checked={runScenariosEnabled} onChange={(event) => setRunScenariosEnabled(event.target.checked)} type="checkbox" />
                시나리오 실행
              </label>
              {!monteCarloServerDisabled ? (
                <label className="flex items-center gap-2 text-slate-700">
                  <input checked={runMonteCarloEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunMonteCarloEnabled(event.target.checked)} type="checkbox" />
                  몬테카를로 실행
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-slate-700">
                <input checked={runActionsEnabled} disabled={saveBlockedByHealth} onChange={(event) => setRunActionsEnabled(event.target.checked)} type="checkbox" />
                실행 계획 생성
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input checked={runDebtEnabled} onChange={(event) => setRunDebtEnabled(event.target.checked)} type="checkbox" />
                부채 분석
              </label>
              {!optimizerServerDisabled ? (
                <label className="flex items-center gap-2 text-slate-700">
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
              <label className="block text-xs font-semibold text-slate-600">
                몬테카를로 paths
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={monteCarloPaths} onChange={(event) => setMonteCarloPaths(event.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                몬테카를로 seed
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={monteCarloSeed} onChange={(event) => setMonteCarloSeed(event.target.value)} />
              </label>
            </div>
          ) : null}

          {!beginnerMode && runActionsEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              {!includeProductsServerDisabled ? (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input checked={includeProducts} disabled={saveBlockedByHealth} onChange={(event) => setIncludeProducts(event.target.checked)} type="checkbox" />
                  상품 후보 포함
                </label>
              ) : <div />}
              <label className="block text-xs font-semibold text-slate-600">
                후보 최대 개수
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={maxCandidatesPerAction} onChange={(event) => setMaxCandidatesPerAction(event.target.value)} />
              </label>
            </div>
          ) : null}

          {effectiveRunDebtEnabled ? (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <label className="block text-xs font-semibold text-slate-600">
                부채 추가상환 금액(KRW)
                <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" value={debtExtraPaymentKrw} onChange={(event) => setDebtExtraPaymentKrw(event.target.value)} />
              </label>
              {!beginnerMode ? (
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">리파이낸스 제안</p>
                    <Button onClick={addDebtOfferRow} size="sm" variant="outline">제안 추가</Button>
                  </div>
                  {debtOfferRows.length === 0 ? (
                    <p className="text-xs text-slate-500">리파이낸스 제안을 입력하지 않았습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {debtOfferRows.map((row, index) => (
                        <div className="grid gap-2 sm:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_auto]" key={row.rowId}>
                          <select
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            value={row.liabilityId}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, liabilityId: event.target.value })}
                          >
                            <option value="">부채 선택</option>
                            {debtLiabilityOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.id} ({option.label})</option>
                            ))}
                          </select>
                          <input
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            value={row.title}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, title: event.target.value })}
                            placeholder="제안 제목(선택)"
                          />
                          <input
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="number"
                            value={row.newAprPct}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, newAprPct: toFiniteNumber(event.target.value) })}
                            placeholder="신규 금리(%)"
                          />
                          <input
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                            type="number"
                            value={row.feeKrw}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, feeKrw: Math.max(0, toFiniteNumber(event.target.value)) })}
                            placeholder="수수료(KRW)"
                          />
                          <Button aria-label={`리파이낸스 제안 ${index + 1} 삭제`} onClick={() => removeDebtOfferRow(index)} size="sm" variant="ghost">삭제</Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {debtOfferInvalidIds.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p className="font-semibold">DEBT_OFFER_LIABILITY_NOT_FOUND</p>
                      <p className="mt-1">다음 liabilityId가 현재 프로필 부채 목록에 없습니다: {debtOfferInvalidIds.join(", ")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {!beginnerMode && runOptimizeEnabled ? (
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-semibold text-indigo-900">실험용 최적화기</p>
              <p className="text-xs text-indigo-800">후보 전략 2~5개를 비교만 제공합니다. 자동 적용은 하지 않습니다.</p>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer 제약 JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerConstraintsJson}
                  onChange={(event) => setOptimizerConstraintsJson(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer 파라미터 JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerKnobsJson}
                  onChange={(event) => setOptimizerKnobsJson(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Optimizer 탐색 JSON
                <textarea
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  value={optimizerSearchJson}
                  onChange={(event) => setOptimizerSearchJson(event.target.value)}
                />
              </label>
              <Button disabled={runningOptimize || optimizerServerDisabled || saveBlockedByHealth} onClick={() => void runOptimizeAction()} size="sm" variant="outline">
                {runningOptimize ? "최적화 실행 중..." : "최적화 실행"}
              </Button>
            </div>
          ) : null}

          {!beginnerMode ? (
            <details className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">고급(개발자): JSON 편집기</summary>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-slate-600">
                  가정 Override JSON
                  <textarea
                    className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                    value={assumptionsOverrideJson}
                    onChange={(event) => replaceAssumptionsFromJsonText(event.target.value)}
                  />
                  {assumptionsJsonError ? <p className="mt-2 text-xs text-rose-700">{assumptionsJsonError}</p> : null}
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  리파이낸스 제안 JSON
                  <textarea
                    className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                    value={debtOffersJson}
                    onChange={(event) => replaceDebtOffersFromJsonText(event.target.value)}
                  />
                  {debtOffersJsonError ? <p className="mt-2 text-xs text-rose-700">{debtOffersJsonError}</p> : null}
                </label>
              </div>
            </details>
          ) : null}

          {healthWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">가정 건강도 경고 ({healthWarnings.length})</p>
              <div className="mt-2 space-y-1">
                {healthWarnings.map((warning) => (
                  <p key={`${warning.code}:${warning.severity}`}>[{formatSeverityKo(warning.severity)}] {warning.code} - {warning.message}</p>
                ))}
              </div>
              {healthWarnings.some((warning) => warning.code === "SNAPSHOT_STALE" || warning.code === "SNAPSHOT_VERY_STALE" || warning.code === "SNAPSHOT_MISSING") ? (
                <div className="mt-2">
                  <Link className="font-semibold text-emerald-700 underline" href="/ops/assumptions">/ops/assumptions로 이동해 스냅샷 동기화</Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {preflightHasBlockers ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900" id="planning-preflight-block-reason">
              <p className="font-semibold">사전 점검 차단 ({preflightBlockIssues.length})</p>
              <div className="mt-2 space-y-1">
                {preflightBlockIssues.map((issue, index) => (
                  <p key={`${issue.code}-${index}`}>[{issue.code}] {formatPreflightIssue(issue)}</p>
                ))}
              </div>
            </div>
          ) : null}
          {preflightWarnIssues.length > 0 ? (
            <p className="text-xs text-amber-700">
              사전 점검 경고: {preflightWarnSummary}
              {preflightWarnIssues.length > 1 ? ` 외 ${preflightWarnIssues.length - 1}건` : ""}
            </p>
          ) : null}

          {hasCriticalHealth ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <label className="flex items-start gap-2">
                <input checked={healthAck} onChange={(event) => setHealthAck(event.target.checked)} type="checkbox" />
                <span>위 경고를 확인했고, 이 가정으로 계산 결과가 왜곡될 수 있음을 이해했습니다.</span>
              </label>
            </div>
          ) : null}

          {healthDisabledReason ? (
            <p className="text-xs text-slate-500" id="planning-save-disabled-reason">{healthDisabledReason}</p>
          ) : null}
          {monteCarloBudgetSkipped ? (
            <p className="text-xs text-amber-700">Monte Carlo는 예산 초과로 생략되었습니다.</p>
          ) : null}

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">What-if 시나리오</p>
              <p className="text-[11px] text-slate-500">추천이 아닌 기준 대비 비교 실행</p>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              기준 실행(Baseline)
              <select
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
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
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(SCENARIO_TEMPLATE_LABELS) as ScenarioTemplateId[]).map((templateId) => (
                <Button
                  key={templateId}
                  onClick={() => setScenarioTemplateId(templateId)}
                  size="sm"
                  variant={scenarioTemplateId === templateId ? "primary" : "outline"}
                >
                  {SCENARIO_TEMPLATE_LABELS[templateId]}
                </Button>
              ))}
            </div>
            {scenarioTemplateId === "DEBT_PAYMENT_PLUS_100000" ? (
              <label className="block text-xs font-semibold text-slate-600">
                적용 부채
                <select
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  value={scenarioDebtId}
                  onChange={(event) => setScenarioDebtId(event.target.value)}
                >
                  <option value="">부채 선택</option>
                  {debtLiabilityOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.id} ({option.label})</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-700">적용 patch</p>
              {scenarioPatchesPreview.length < 1 ? (
                <p className="mt-1 text-[11px] text-slate-500">적용할 patch가 없습니다.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                  {scenarioPatchesPreview.map((patch, index) => (
                    <li key={`${patch.path}:${patch.op}:${index}`}>{patch.path} · {patch.op} · {patch.value}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3" data-testid="run-stages-timeline">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Pipeline</p>
              <p className="text-xs text-slate-500">{running ? "단계 실행 중" : "최근 실행 기준"}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {currentStepStatuses.map((step) => (
                <div className="rounded-lg border px-3 py-2 text-xs" data-testid={`stage-${step.id}`} key={step.id}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{STEP_LABELS[step.id]}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${stepStateClass(step.state)}`}
                      data-testid={step.id === "simulate" ? "stage-simulate-pill" : `stage-${step.id}-status`}
                    >
                      <span data-testid={step.id === "simulate" ? "stage-simulate-status" : undefined}>
                        {formatStepStateKo(step.state)}
                      </span>
                    </span>
                  </div>
                  {step.message ? <p className="mt-1 text-slate-600">{step.message}</p> : null}
                </div>
              ))}
            </div>
          </div>

          {preflightWarnIssues.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-slate-700" id="planning-save-warning-confirm-hint">
              <input
                checked={saveWarningConfirmed}
                disabled={savingRun || preflightHasBlockers}
                onChange={(event) => setSaveWarningConfirmed(event.target.checked)}
                type="checkbox"
              />
              사전 점검 경고를 확인했고, 이 상태로 저장합니다.
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              checked={autoSaveRunAfterSuccess}
              disabled={running || savingRun || saveBlockedByHealth || preflightHasBlockers || preflightWarnIssues.length > 0}
              onChange={(event) => setAutoSaveRunAfterSuccess(event.target.checked)}
              type="checkbox"
            />
            실행 성공 시 실행 기록 자동 저장
          </label>

          <div className="flex flex-wrap gap-2">
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
              disabled={savingRun || !selectedProfileId || !runResult?.simulate || saveBlockedByHealth || preflightHasBlockers || saveNeedsWarningConfirmation}
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

          <Card className="text-xs text-slate-700">
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
          </Card>

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
                    snapshotMeta: {
                      missing: runResult?.meta?.snapshot?.missing === true,
                      staleDays: runResult?.meta?.health?.snapshotStaleDays,
                    },
                    monteCarlo: {
                      retirementDepletionBeforeEnd: monteDepletionProb,
                    },
                  }}
                />

                <div className="grid gap-2 md:grid-cols-5">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    말기 순자산: <span className="font-semibold">{formatKrw(locale, summaryEndNetWorthKrw)}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    최저 현금(월): <span className="font-semibold">{formatKrw(locale, summaryWorstCashKrw)} (M{summaryWorstCashMonth + 1})</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    목표 달성: <span className="font-semibold">{summaryGoalsText}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    DSR: <span className="font-semibold">{typeof summaryDsr === "number" ? formatRatioPct(locale, summaryDsr) : "-"}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    치명 경고: <span className="font-semibold">{summaryCriticalWarnings}</span>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-900">Key Findings</p>
                  <div className="mt-1 space-y-1">
                    {keyFindings.slice(0, 3).map((line, index) => (
                      <p key={`finding-${index}`}>- {line}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
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
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_GENERATED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.generatedAt)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_ID")}: <span className="font-semibold">{resultDto?.meta.snapshot.id ?? "latest"}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_AS_OF")}: <span className="font-semibold">{resultDto?.meta.snapshot.asOf ?? "-"}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{t(locale, "SUMMARY_LABEL_SNAPSHOT_FETCHED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.snapshot.fetchedAt)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">snapshot staleDays: <span className="font-semibold">{formatNumber(locale, resultDto?.meta.health?.snapshotStaleDays)}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">snapshot missing: <span className="font-semibold">{resultDto?.meta.snapshot.missing ? "true" : "false"}</span></div>
                </div>

                {currentStepStatuses.some((step) => step.state === "FAILED") ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    부분 실패 단계: {currentStepStatuses.filter((step) => step.state === "FAILED").map((step) => STEP_LABELS[step.id]).join(", ")}
                  </div>
                ) : null}
                {savedRun ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                    저장된 실행 기록: {savedRun.id}
                    {" · "}
                    <Link className="underline" href={runsPageHref}>/planning/runs로 이동</Link>
                    {" · "}
                    <Link
                      className="underline"
                      href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(savedRun.id)}`, selectedProfileId)}
                    >
                      리포트 보기
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "warningsGoals" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <h3 className="font-semibold text-slate-900">{t(locale, "CHARTS_HEADER")}</h3>
                {chartMode === "none" ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    {t(locale, "CHART_NOT_AVAILABLE")}
                  </p>
                ) : (
                  <PlanningMiniCharts locale={locale} mode={chartMode} points={chartPoints} />
                )}

                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  해석: 상태 배지와 아래 표를 함께 보면 반복 경고, 목표 부족액, 현금흐름 악화 구간을 빠르게 확인할 수 있습니다.
                </p>

                <WarningsTable warnings={aggregatedWarnings} />
                <GoalsTable locale={locale} goals={goalTableRows} />
                <TimelineSummaryTable locale={locale} rows={timelineSummaryRows} />
                {!beginnerMode ? (
                  <AdvancedJsonPanel
                    sections={[
                      { label: "warnings (raw)", value: simulateWarnings },
                      { label: "goalStatus (raw)", value: simulateGoals },
                      { label: "timeline (raw)", value: simulateTimeline },
                    ]}
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "scenarios" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {scenariosStatus.state === "FAILED" ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    시나리오 단계 실패: {scenariosStatus.message ?? "시나리오 계산에 실패했습니다."}
                  </p>
                ) : !hasScenariosData ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">시나리오 결과가 없습니다.</p>
                ) : (
                  <>
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      해석: 기준 대비 순자산 변화와 목표 달성 변화를 함께 보면 어떤 가정이 결과를 악화시키는지 빠르게 파악할 수 있습니다.
                    </p>

                    <div className="grid gap-2 md:grid-cols-4">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        기준 말기 순자산: <span className="font-semibold">{formatKrw(locale, Number(scenariosBaseSummary.endNetWorth ?? 0))}</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        기준 최저 현금: <span className="font-semibold">{formatKrw(locale, Number(scenariosBaseSummary.worstCashKrw ?? 0))}</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        기준 목표 달성: <span className="font-semibold">{formatNumber(locale, scenariosBaseSummary.goalsAchieved)}</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        기준 경고 수: <span className="font-semibold">{formatNumber(locale, scenariosBaseSummary.warningsCount)}</span>
                      </div>
                    </div>

                    <WarningsTable warnings={aggregateGuideWarnings(scenariosBaseWarnings)} />

                    <h3 className="font-semibold text-slate-900">시나리오 비교 표</h3>
                    {scenarioComparisonRows.length === 0 ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">시나리오 결과가 없습니다.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                      </div>
                    )}

                    {!beginnerMode ? (
                      <AdvancedJsonPanel
                        sections={[
                          { label: "scenario base (raw)", value: scenariosBase },
                          { label: "scenario list (raw)", value: scenariosList },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "monteCarlo" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {monteCarloStatus.state === "FAILED" ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    몬테카를로 단계 실패: {monteCarloStatus.message ?? "몬테카를로 계산에 실패했습니다."}
                  </p>
                ) : monteCarloStatus.state === "SKIPPED" ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    몬테카를로 단계 생략: {monteCarloStatus.message ?? "실행 조건에 의해 생략되었습니다."}
                  </p>
                ) : !hasMonteCarloData || Object.keys(monteData).length === 0 ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">몬테카를로 결과가 없습니다.</p>
                ) : (
                  <>
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      {typeof monteDepletionProb === "number"
                        ? `은퇴 자산 고갈 확률: ${formatPct(locale, monteDepletionProb * 100)} (모델 기반, 보장 아님)`
                        : "고갈 확률 지표가 제공되지 않았습니다."}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    </div>
                  </>
                )}
                {!beginnerMode ? (
                  <AdvancedJsonPanel
                    sections={[
                      { label: "monte carlo (raw)", value: monteRow },
                    ]}
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "actions" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {actionsStatus.state === "FAILED" ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    실행 계획 단계 실패: {actionsStatus.message ?? "실행 계획 생성에 실패했습니다."}
                  </p>
                ) : (
                  <>
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      해석: 심각도(치명/경고/정보) 순서대로 우선 처리하면 경고를 가장 빠르게 줄일 수 있습니다.
                    </p>

                    {actionTableRows.length === 0 ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">실행 계획이 없습니다.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                      </div>
                    )}
                    {actionTableRows.length > LIMITS.actionsTop ? (
                      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <span>{showAllActions ? `전체 ${actionTableRows.length}개 액션 표시 중` : `추가 ${omittedActionRows}개 액션이 생략되었습니다.`}</span>
                        <button
                          className="font-semibold text-emerald-700"
                          onClick={() => setShowAllActions((prev) => !prev)}
                          type="button"
                        >
                          {showAllActions ? "접기" : "더 보기"}
                        </button>
                      </div>
                    ) : null}

                    {actionTableRows.length > 0 ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {actionTableRows.slice(0, 3).map((row) => (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={`detail-${row.code}-${row.title}`}>
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
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {!beginnerMode ? (
                      <AdvancedJsonPanel
                        sections={[
                          { label: "actions (raw)", value: actionsList },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "debt" ? (
              <div className="mt-4 space-y-3 text-xs text-slate-700">
                {debtStatus.state === "FAILED" ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    부채 분석 단계 실패: {debtStatus.message ?? "부채 분석에 실패했습니다."}
                  </p>
                ) : !hasDebtData ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">부채 분석 결과가 없습니다.</p>
                ) : (
                  <>
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      해석: 부채 탭은 현재 상환부담(DSR), 이자비용, 리파이낸스 효과를 함께 보고 우선순위를 정하는 용도입니다.
                    </p>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        현재 DSR: <span className="font-semibold">{formatRatioPct(locale, debtMeta.debtServiceRatio)}</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        월 총상환액: <span className="font-semibold">{formatKrw(locale, Number(debtMeta.totalMonthlyPaymentKrw ?? 0))}</span>
                      </div>
                    </div>

                    <WarningsTable warnings={debtWarnings} />

                    <h3 className="font-semibold text-slate-900">부채별 상환 요약</h3>
                    {debtSummaries.length === 0 ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">부채 요약 데이터가 없습니다.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                      </div>
                    )}

                    <h3 className="font-semibold text-slate-900">리파이낸스 비교</h3>
                    {debtRefinance.length === 0 ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        적용 가능한 리파이낸스 제안이 없습니다. 현재 조건 유지 또는 추가상환을 먼저 검토하세요.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                      </div>
                    )}

                    <h3 className="font-semibold text-slate-900">What-if 요약</h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    </div>

                    {!beginnerMode ? (
                      <AdvancedJsonPanel
                        sections={[
                          { label: "debt meta (raw)", value: debtMeta },
                          { label: "debt summaries (raw)", value: debtSummaries },
                          { label: "debt refinance (raw)", value: debtRefinance },
                          { label: "debt whatIf (raw)", value: debtWhatIf },
                          { label: "debt warnings (raw)", value: debtWarningsRaw },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {feedbackModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="planning-feedback-title">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="planning-feedback-title" className="text-base font-bold text-slate-900">피드백 보내기</h2>
            <p className="mt-1 text-xs text-slate-600">/planning 사용 중 불편/버그를 로컬에 저장합니다.</p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                분류
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  value={feedbackCategory}
                  onChange={(event) => setFeedbackCategory(event.target.value as PlanningFeedbackCategory)}
                  disabled={feedbackSubmitting}
                >
                  {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                제목
                <input
                  className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  placeholder="예: 실행 결과 탭 전환이 헷갈려요"
                  value={feedbackTitle}
                  onChange={(event) => setFeedbackTitle(event.target.value)}
                  maxLength={160}
                  disabled={feedbackSubmitting}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                내용
                <textarea
                  className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="재현 단계/기대 결과/실제 결과를 간단히 적어주세요."
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  maxLength={5000}
                  disabled={feedbackSubmitting}
                />
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>snapshot: {asString(runResult?.meta?.snapshot?.id || selectedSnapshotItem?.id) || "-"}</p>
              <p>runId: {savedRun?.id ?? "-"}</p>
              <p>health: critical={healthSummary?.criticalCount ?? "-"}, warnings={healthSummary?.warningCodes?.slice(0, 10).join(", ") || "-"}</p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
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
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default PlanningWorkspaceClient;
