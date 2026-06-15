import { type QuickViewKind } from "@/components/QuickViewModal";
import { type PlannerInput, buildPlan } from "@/lib/planner/plan";
import { type ChecklistCheckedMap } from "@/lib/planner/checklistStorage";
import { type LinkOpenMode } from "@/lib/planner/uiPrefs";
import { type PlannerSnapshot } from "@/lib/planner/storage";
import { uiTextKo } from "@/lib/uiText.ko";

export type PlannerPlan = ReturnType<typeof buildPlan>;

export const STEPS = [
  { label: uiTextKo.planner.stepGoal, icon: "🎯", color: "text-rose-500", bg: "bg-rose-50" },
  { label: uiTextKo.planner.stepAnalysis, icon: "📊", color: "text-blue-500", bg: "bg-blue-50" },
  { label: uiTextKo.planner.stepAlternatives, icon: "✨", color: "text-primary", bg: "bg-primary/5" },
  { label: uiTextKo.planner.stepExecution, icon: "⚡", color: "text-amber-500", bg: "bg-amber-50" },
  { label: uiTextKo.planner.stepMonitoring, icon: "📅", color: "text-indigo-500", bg: "bg-indigo-50" },
] as const;

export const DEFAULT_INPUT: PlannerInput = {
  unit: "MANWON",
  goalName: "목돈 마련",
  goalAmount: 2000,
  goalDeadlineMonths: 36,
  goalPriority: "medium",
  monthlyIncome: 420,
  monthlyFixedExpense: 150,
  monthlyVariableExpense: 90,
  cashAssets: 600,
  debtBalance: 300,
  debtRateAnnual: 8,
  monthlyDebtPayment: 25,
  emergencyTargetMonths: 3,
  assumedAnnualReturn: 3,
  assumedInflationRate: 2.5,
  extraMonthlySaving: 0,
  extraMonthlyDebtPayment: 0,
  riskProfile: "balanced",
  insuranceStatus: "unknown",
  monthlyInsurancePremium: 0,
  indemnityStatus: "unknown",
  insurancePurposeHealth: false,
  insurancePurposeAccident: false,
  insurancePurposeLife: false,
  insurancePurposeIncome: false,
  retirementAssets: 0,
  retirementMonthlyContribution: 0,
  npsExpectedMonthly: 0,
  retirementNeedRatioPct: 70,
  retirementWithdrawalRatePct: 3.5,
};

export const SHOW_RULE_DEBUG = process.env.NEXT_PUBLIC_SHOW_RULE_DEBUG === "1";

export type QuickViewState = {
  open: boolean;
  kind: QuickViewKind;
  title: string;
  hrefForNewTab: string;
};

export type PlannerActionLink = {
  label: string;
  href?: string;
};

export const INITIAL_QUICK_VIEW: QuickViewState = {
  open: false,
  kind: "products",
  title: "빠른 보기",
  hrefForNewTab: "/products/deposit",
};

export type PlannerWizardSidebarProps = {
  step: number;
  linkOpenMode: LinkOpenMode;
  onStepSelect: (step: number) => void;
  onLinkOpenModeChange: (mode: LinkOpenMode) => void;
};

export type PlannerWizardFooterNavProps = {
  step: number;
  onPrevious: () => void;
  onContinue: () => void;
};

export type PlannerWizardHistoryPanelProps = {
  snapshots: PlannerSnapshot[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
};

export type PlannerWizardTrendPanelProps = {
  snapshots: PlannerSnapshot[];
  compareA: string;
  compareB: string;
  onCompareAChange: (value: string) => void;
  onCompareBChange: (value: string) => void;
  compareSnapA: PlannerSnapshot | null;
  compareSnapB: PlannerSnapshot | null;
  monthlySavingTrend: number[];
  emergencyGapTrend: number[];
  goalRequiredTrend: number[];
  debtRatioTrend: number[];
  unit: PlannerInput["unit"];
};

export type PlannerWizardGoalStepProps = {
  input: PlannerInput;
  setNumber: (key: keyof PlannerInput, value: string) => void;
  setText: (key: keyof PlannerInput, value: string) => void;
};

export type PlannerWizardAnalysisStepProps = {
  input: PlannerInput;
  plan: PlannerPlan;
  insuranceMetrics: ReturnType<typeof import("@/lib/planner/insuranceMetrics").computeInsuranceMetrics>;
  retirementMetrics: ReturnType<typeof import("@/lib/planner/retirementMetrics").computeRetirementMetrics>;
  setNumber: (key: keyof PlannerInput, value: string) => void;
  setText: (key: keyof PlannerInput, value: string) => void;
  setBoolean: (key: keyof PlannerInput, value: boolean) => void;
};

export type PlannerWizardAlternativesStepProps = {
  input: PlannerInput;
  plan: PlannerPlan;
  healthScore: number;
  linkOpenMode: LinkOpenMode;
  openAction: (action: PlannerActionLink) => void;
};

export type PlannerWizardExecutionStepProps = {
  plan: PlannerPlan;
  checkedMap: ChecklistCheckedMap;
  benefitQueries: string[];
  subscriptionRegion: string;
  toggleChecklist: (id: string) => void;
  openAction: (action: PlannerActionLink) => void;
  openPlaybook: (id?: string) => void;
};

export type PlannerWizardMonitoringStepProps = {
  plan: PlannerPlan;
  input: PlannerInput;
  snapshots: PlannerSnapshot[];
  compareA: string;
  compareB: string;
  compareSnapA: PlannerSnapshot | null;
  compareSnapB: PlannerSnapshot | null;
  monthlySavingTrend: number[];
  emergencyGapTrend: number[];
  goalRequiredTrend: number[];
  debtRatioTrend: number[];
  saveCurrentSnapshot: () => void;
  applySnapshot: (id: string) => void;
  deleteSnapshotById: (id: string) => void;
  setCompareA: (value: string) => void;
  setCompareB: (value: string) => void;
};

export function formatMoney(baseValue: number, unit: PlannerInput["unit"]): string {
  const divided = unit === "MANWON" ? baseValue / 10000 : baseValue;
  if (divided >= 10000) return `${(divided / 10000).toFixed(1)}억원`;
  if (divided >= 1) return `${divided.toLocaleString()}만원`;
  return `${(divided * 10000).toLocaleString()}원`;
}

export function openNewTab(href: string) {
  if (typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

export function resolveQuickView(action: PlannerActionLink): { kind: QuickViewKind; href: string; title: string } {
  const href = action.href ?? "/products/deposit";
  if (href.includes("/tools/fx")) return { kind: "fxtool", href, title: action.label };
  if (href.includes("/benefits")) return { kind: "benefits", href, title: action.label };
  if (href.includes("/housing/subscription")) return { kind: "subscription", href, title: action.label };
  if (action.label.includes("예금/적금") || href.includes("/products") && !href.includes("deposit") && !href.includes("saving")) {
    return { kind: "products", href: "/products/deposit", title: action.label };
  }
  if (href.includes("/products/deposit")) return { kind: "deposit", href, title: action.label };
  if (href.includes("/products/saving")) return { kind: "saving", href, title: action.label };
  if (href.includes("/recommend")) return { kind: "recommend", href, title: action.label };
  return { kind: "products", href, title: action.label };
}

export type { PlannerInput };
