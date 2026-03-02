import { amortizingMonthlyPayment, normalizeAprPct } from "../../../lib/planning/core/v2/debt/calc";
import { loadCanonicalProfile } from "../../../lib/planning/v2/loadCanonicalProfile";
import { PROFILE_SCHEMA_VERSION } from "../../../lib/planning/v2/schemaVersion";
import { type ProfileV2 } from "../../../lib/planning/v2/types";
import { createDefaultsAppliedMetadata, PLANNING_DEFAULTS } from "./planningDefaults";

export type WizardDebtDraft = {
  id?: string;
  name?: string;
  balance?: number;
  aprPct?: number;
  monthlyPayment?: number;
  remainingMonths?: number;
};

export type WizardGoalDraft = {
  id?: string;
  name?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetMonth?: number;
  priority?: number;
  minimumMonthlyContribution?: number;
};

export type PlanningWizardDraft = {
  monthlyIncomeNet?: number;
  monthlyEssentialExpenses?: number;
  monthlyDiscretionaryExpenses?: number;
  liquidAssets?: number;
  investmentAssets?: number;
  debts?: WizardDebtDraft[];
  goals?: WizardGoalDraft[];
};

export type PlanningWizardOutput = {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profile: ProfileV2;
  defaultsApplied: NonNullable<ProfileV2["defaultsApplied"]>;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePct(value: number): number {
  if (value > 0 && value <= 1) return normalizeAprPct(value * 100);
  return normalizeAprPct(value);
}

function normalizeNonNegative(value: number | undefined, fallback: number): { value: number; defaulted: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: fallback, defaulted: true };
  }
  return { value: Math.max(0, value), defaulted: false };
}

function resolveMonthlyPayment(balance: number, aprPct: number, remainingMonths: number): number {
  if (balance <= 0) return 0;
  return Math.round(amortizingMonthlyPayment(balance, normalizeAprPct(aprPct), Math.max(1, Math.trunc(remainingMonths))));
}

function debtId(index: number): string {
  return `debt-${index + 1}`;
}

function goalId(index: number): string {
  return `goal-${index + 1}`;
}

export function buildPlanningWizardOutput(
  draft: PlanningWizardDraft,
  options?: { appliedAt?: string },
): PlanningWizardOutput {
  const codes: string[] = [];
  const input = draft ?? {};

  const monthlyIncome = normalizeNonNegative(asNumber(input.monthlyIncomeNet), 0);
  if (monthlyIncome.defaulted) codes.push("MONTHLY_INCOME_NET_DEFAULTED");
  const essential = normalizeNonNegative(asNumber(input.monthlyEssentialExpenses), 0);
  if (essential.defaulted) codes.push("MONTHLY_ESSENTIAL_EXPENSES_DEFAULTED");
  const discretionary = normalizeNonNegative(asNumber(input.monthlyDiscretionaryExpenses), 0);
  if (discretionary.defaulted) codes.push("MONTHLY_DISCRETIONARY_EXPENSES_DEFAULTED");
  const liquid = normalizeNonNegative(asNumber(input.liquidAssets), 0);
  if (liquid.defaulted) codes.push("LIQUID_ASSETS_DEFAULTED");
  const investments = normalizeNonNegative(asNumber(input.investmentAssets), 0);
  if (investments.defaulted) codes.push("INVESTMENT_ASSETS_DEFAULTED");

  const debtsSource = Array.isArray(input.debts) ? input.debts : [];
  const debts = debtsSource.map((row, index) => {
    const id = asString(row.id) || debtId(index);
    if (!asString(row.id)) codes.push(`DEBT_${index + 1}_ID_DEFAULTED`);
    const name = asString(row.name) || `부채 ${index + 1}`;
    if (!asString(row.name)) codes.push(`DEBT_${index + 1}_NAME_DEFAULTED`);
    const balanceRaw = normalizeNonNegative(asNumber(row.balance), 0);
    if (balanceRaw.defaulted) codes.push(`DEBT_${index + 1}_BALANCE_DEFAULTED`);
    const aprRaw = asNumber(row.aprPct);
    let aprPct = 0;
    if (typeof aprRaw === "number") {
      if (aprRaw > 0 && aprRaw <= 1) {
        codes.push(`DEBT_${index + 1}_APR_DECIMAL_NORMALIZED`);
      }
      aprPct = normalizePct(aprRaw);
    } else {
      codes.push(`DEBT_${index + 1}_APR_DEFAULTED`);
    }
    const remainingMonthsRaw = asNumber(row.remainingMonths);
    const remainingMonths = Number.isFinite(remainingMonthsRaw) && (remainingMonthsRaw ?? 0) > 0
      ? Math.trunc(remainingMonthsRaw as number)
      : PLANNING_DEFAULTS.debtRemainingMonths;
    if (!Number.isFinite(remainingMonthsRaw) || (remainingMonthsRaw ?? 0) <= 0) {
      codes.push(`DEBT_${index + 1}_REMAINING_MONTHS_DEFAULTED`);
    }
    const monthlyPaymentRaw = asNumber(row.monthlyPayment);
    const minimumPayment = Number.isFinite(monthlyPaymentRaw) && (monthlyPaymentRaw ?? 0) >= 0
      ? Math.max(0, monthlyPaymentRaw as number)
      : resolveMonthlyPayment(balanceRaw.value, aprPct, remainingMonths);
    if (!Number.isFinite(monthlyPaymentRaw) || (monthlyPaymentRaw ?? 0) < 0) {
      codes.push(`DEBT_${index + 1}_MONTHLY_PAYMENT_DEFAULTED`);
    }
    return {
      id,
      name,
      balance: balanceRaw.value,
      minimumPayment,
      aprPct,
      remainingMonths,
      repaymentType: PLANNING_DEFAULTS.debtRepaymentType,
    } satisfies ProfileV2["debts"][number];
  });

  const goalsSource = Array.isArray(input.goals) ? input.goals : [];
  const goals = goalsSource
    .map((row, index) => {
      const name = asString(row.name);
      if (!name) return null;
      const id = asString(row.id) || goalId(index);
      if (!asString(row.id)) codes.push(`GOAL_${index + 1}_ID_DEFAULTED`);
      const target = normalizeNonNegative(asNumber(row.targetAmount), 0);
      if (target.defaulted) codes.push(`GOAL_${index + 1}_TARGET_DEFAULTED`);
      const current = normalizeNonNegative(asNumber(row.currentAmount), 0);
      if (current.defaulted) codes.push(`GOAL_${index + 1}_CURRENT_DEFAULTED`);
      const targetMonthRaw = asNumber(row.targetMonth);
      const targetMonth = Number.isFinite(targetMonthRaw) && (targetMonthRaw ?? 0) > 0
        ? Math.trunc(targetMonthRaw as number)
        : 12;
      if (!Number.isFinite(targetMonthRaw) || (targetMonthRaw ?? 0) <= 0) {
        codes.push(`GOAL_${index + 1}_TARGET_MONTH_DEFAULTED`);
      }
      const priorityRaw = asNumber(row.priority);
      const priority = Number.isFinite(priorityRaw) && (priorityRaw ?? 0) >= 1
        ? Math.trunc(priorityRaw as number)
        : PLANNING_DEFAULTS.goalPriority;
      if (!Number.isFinite(priorityRaw) || (priorityRaw ?? 0) < 1) {
        codes.push(`GOAL_${index + 1}_PRIORITY_DEFAULTED`);
      }
      const minimumMonthlyContributionRaw = asNumber(row.minimumMonthlyContribution);
      const minimumMonthlyContribution = Number.isFinite(minimumMonthlyContributionRaw) && (minimumMonthlyContributionRaw ?? 0) >= 0
        ? minimumMonthlyContributionRaw as number
        : 0;
      return {
        id,
        name,
        targetAmount: target.value,
        currentAmount: current.value,
        targetMonth,
        priority,
        minimumMonthlyContribution,
      } satisfies ProfileV2["goals"][number];
    })
    .filter((row): row is ProfileV2["goals"][number] => row !== null);

  if (goals.length < 1) {
    const monthlyExpenses = essential.value + discretionary.value;
    goals.push({
      id: "goal-emergency",
      name: "비상금",
      targetAmount: Math.max(0, Math.round(monthlyExpenses * PLANNING_DEFAULTS.emergencyMonths)),
      currentAmount: liquid.value,
      targetMonth: 12,
      priority: PLANNING_DEFAULTS.goalPriority,
      minimumMonthlyContribution: 0,
    });
    codes.push("GOALS_EMPTY_DEFAULT_EMERGENCY_CREATED");
  }

  const defaultsApplied = createDefaultsAppliedMetadata(codes, options?.appliedAt);
  const rawProfile: ProfileV2 = {
    monthlyIncomeNet: monthlyIncome.value,
    monthlyEssentialExpenses: essential.value,
    monthlyDiscretionaryExpenses: discretionary.value,
    liquidAssets: liquid.value,
    investmentAssets: investments.value,
    debts,
    goals,
    defaultsApplied,
  };
  const canonical = loadCanonicalProfile(rawProfile).profile;
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile: canonical,
    defaultsApplied: canonical.defaultsApplied ?? defaultsApplied,
  };
}
