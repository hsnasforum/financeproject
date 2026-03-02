import { amortizingMonthlyPayment, normalizeAprPct } from "./debt/calc";
import { type ProfileV2, type ProfileV2Debt, type ProfileV2Goal } from "./types";
import { decimalToAprPct, toEngineRateBoundary } from "../../v2/aprBoundary";

export type ProfileFormDebt = {
  id: string;
  name: string;
  balance: number;
  aprPct: number;
  remainingMonths: number;
  repaymentType: "amortizing" | "interestOnly";
};

export type ProfileFormLumpSumGoal = {
  id: string;
  title: string;
  targetAmount: number;
  targetMonth: number;
};

export type ProfileFormModel = {
  currentAge: number;
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  liquidAssets: number;
  investmentAssets: number;
  emergencyMonths: number;
  retirementAge: number;
  retirementMonthlySpend: number;
  debts: ProfileFormDebt[];
  lumpSumGoals: ProfileFormLumpSumGoal[];
};

export type ProfileFormSummary = {
  monthlySurplusKrw: number;
  debtServiceRatio: number;
  emergencyTargetKrw: number;
  emergencyGapKrw: number;
};

const RETIREMENT_WITHDRAWAL_RATE = 0.04;

function asFinite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isEmergencyGoal(goal: ProfileV2Goal): boolean {
  const id = goal.id.toLowerCase();
  const name = goal.name.toLowerCase();
  return id.includes("emergency") || name.includes("emergency") || name.includes("비상");
}

function isRetirementGoal(goal: ProfileV2Goal): boolean {
  const id = goal.id.toLowerCase();
  const name = goal.name.toLowerCase();
  return id.includes("retire") || name.includes("retire") || name.includes("은퇴");
}

function estimateEmergencyMonths(targetAmount: number, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 6;
  return clampInt(Math.round(targetAmount / monthlyExpenses), 0, 120);
}

function estimateRetirementMonthlySpend(targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.round((targetAmount * RETIREMENT_WITHDRAWAL_RATE) / 12);
}

function estimateRetirementAge(currentAge: number, targetMonth?: number): number {
  if (!targetMonth || targetMonth <= 0) return currentAge + 25;
  return clampInt(currentAge + Math.round(targetMonth / 12), currentAge, 100);
}

function normalizeDebtId(index: number): string {
  return `debt-${index + 1}`;
}

function normalizeGoalId(index: number): string {
  return `goal-${index + 1}`;
}

function monthlyInterestPayment(balance: number, aprPct: number): number {
  const normalizedAprPct = normalizeAprPct(aprPct);
  return Math.round(balance * (normalizedAprPct / 100 / 12));
}

export function estimateDebtMonthlyPaymentKrw(debt: ProfileFormDebt): number {
  const balance = Math.max(0, asFinite(debt.balance));
  const aprPct = asFinite(debt.aprPct);
  const remainingMonths = Math.max(1, clampInt(asFinite(debt.remainingMonths), 1, 600));
  if (debt.repaymentType === "interestOnly") {
    return monthlyInterestPayment(balance, aprPct);
  }
  return Math.round(amortizingMonthlyPayment(balance, aprPct, remainingMonths));
}

function toProfileDebt(row: ProfileFormDebt, index: number): ProfileV2Debt {
  const minimumPayment = estimateDebtMonthlyPaymentKrw(row);
  const aprBoundary = toEngineRateBoundary(asFinite(row.aprPct));
  return {
    id: (row.id || normalizeDebtId(index)).trim(),
    name: (row.name || `Debt ${index + 1}`).trim(),
    balance: Math.max(0, asFinite(row.balance)),
    minimumPayment,
    apr: aprBoundary.decimal,
    remainingMonths: Math.max(1, clampInt(asFinite(row.remainingMonths), 1, 600)),
    repaymentType: row.repaymentType,
  };
}

function buildEmergencyGoal(form: ProfileFormModel): ProfileV2Goal | null {
  const emergencyMonths = clampInt(asFinite(form.emergencyMonths), 0, 120);
  if (emergencyMonths <= 0) return null;
  const monthlyExpenses = Math.max(0, asFinite(form.monthlyEssentialExpenses) + asFinite(form.monthlyDiscretionaryExpenses));
  return {
    id: "goal-emergency",
    name: "Emergency Fund",
    targetAmount: Math.round(monthlyExpenses * emergencyMonths),
    currentAmount: Math.max(0, asFinite(form.liquidAssets)),
    targetMonth: 12,
    priority: 5,
    minimumMonthlyContribution: 0,
  };
}

function buildRetirementGoal(form: ProfileFormModel): ProfileV2Goal | null {
  const monthlySpend = Math.max(0, asFinite(form.retirementMonthlySpend));
  if (monthlySpend <= 0) return null;
  const currentAge = clampInt(asFinite(form.currentAge, 35), 0, 100);
  const retirementAge = clampInt(asFinite(form.retirementAge, currentAge + 25), currentAge, 110);
  const months = Math.max(1, (retirementAge - currentAge) * 12);
  const targetAmount = Math.round((monthlySpend * 12) / RETIREMENT_WITHDRAWAL_RATE);
  return {
    id: "goal-retirement",
    name: "Retirement",
    targetAmount,
    currentAmount: Math.max(0, asFinite(form.investmentAssets)),
    targetMonth: months,
    priority: 4,
    minimumMonthlyContribution: 0,
  };
}

function toLumpSumGoals(rows: ProfileFormLumpSumGoal[]): ProfileV2Goal[] {
  return rows.map((row, index) => ({
    id: (row.id || normalizeGoalId(index)).trim(),
    name: (row.title || `Goal ${index + 1}`).trim(),
    targetAmount: Math.max(0, asFinite(row.targetAmount)),
    currentAmount: 0,
    targetMonth: Math.max(1, clampInt(asFinite(row.targetMonth, 12), 1, 1200)),
    priority: 3,
    minimumMonthlyContribution: 0,
  }));
}

export function createDefaultProfileFormModel(): ProfileFormModel {
  return {
    currentAge: 35,
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    emergencyMonths: 6,
    retirementAge: 60,
    retirementMonthlySpend: 2_000_000,
    debts: [],
    lumpSumGoals: [],
  };
}

export function profileToFormModel(profile: ProfileV2): ProfileFormModel {
  const defaults = createDefaultProfileFormModel();
  const goals = Array.isArray(profile.goals) ? profile.goals : [];
  const emergencyGoal = goals.find(isEmergencyGoal);
  const retirementGoal = goals.find(isRetirementGoal);
  const lumpSumGoals = goals
    .filter((goal) => goal !== emergencyGoal && goal !== retirementGoal)
    .map((goal, index) => ({
      id: goal.id || normalizeGoalId(index),
      title: goal.name || `Goal ${index + 1}`,
      targetAmount: Math.max(0, asFinite(goal.targetAmount)),
      targetMonth: Math.max(1, clampInt(asFinite(goal.targetMonth, 12), 1, 1200)),
    }));

  const monthlyExpenses = Math.max(0, asFinite(profile.monthlyEssentialExpenses) + asFinite(profile.monthlyDiscretionaryExpenses));
  const currentAge = clampInt(asFinite(profile.currentAge, defaults.currentAge), 0, 100);

  return {
    currentAge,
    monthlyIncomeNet: Math.max(0, asFinite(profile.monthlyIncomeNet, defaults.monthlyIncomeNet)),
    monthlyEssentialExpenses: Math.max(0, asFinite(profile.monthlyEssentialExpenses, defaults.monthlyEssentialExpenses)),
    monthlyDiscretionaryExpenses: Math.max(0, asFinite(profile.monthlyDiscretionaryExpenses, defaults.monthlyDiscretionaryExpenses)),
    liquidAssets: Math.max(0, asFinite(profile.liquidAssets, defaults.liquidAssets)),
    investmentAssets: Math.max(0, asFinite(profile.investmentAssets, defaults.investmentAssets)),
    emergencyMonths: emergencyGoal
      ? estimateEmergencyMonths(Math.max(0, asFinite(emergencyGoal.targetAmount)), monthlyExpenses)
      : defaults.emergencyMonths,
    retirementAge: retirementGoal
      ? estimateRetirementAge(currentAge, retirementGoal.targetMonth)
      : defaults.retirementAge,
    retirementMonthlySpend: retirementGoal
      ? estimateRetirementMonthlySpend(Math.max(0, asFinite(retirementGoal.targetAmount)))
      : defaults.retirementMonthlySpend,
    debts: (Array.isArray(profile.debts) ? profile.debts : []).map((debt, index) => ({
      id: debt.id || normalizeDebtId(index),
      name: debt.name || `Debt ${index + 1}`,
      balance: Math.max(0, asFinite(debt.balance)),
      aprPct: decimalToAprPct(asFinite(debt.apr, 0)),
      remainingMonths: Math.max(1, clampInt(asFinite(debt.remainingMonths, 36), 1, 600)),
      repaymentType: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    })),
    lumpSumGoals,
  };
}

export function formModelToProfile(form: ProfileFormModel): ProfileV2 {
  const emergencyGoal = buildEmergencyGoal(form);
  const retirementGoal = buildRetirementGoal(form);
  const lumpSumGoals = toLumpSumGoals(form.lumpSumGoals);
  const goals: ProfileV2Goal[] = [
    ...(emergencyGoal ? [emergencyGoal] : []),
    ...lumpSumGoals,
    ...(retirementGoal ? [retirementGoal] : []),
  ];

  return {
    currentAge: clampInt(asFinite(form.currentAge, 35), 0, 100),
    monthlyIncomeNet: Math.max(0, asFinite(form.monthlyIncomeNet)),
    monthlyEssentialExpenses: Math.max(0, asFinite(form.monthlyEssentialExpenses)),
    monthlyDiscretionaryExpenses: Math.max(0, asFinite(form.monthlyDiscretionaryExpenses)),
    liquidAssets: Math.max(0, asFinite(form.liquidAssets)),
    investmentAssets: Math.max(0, asFinite(form.investmentAssets)),
    debts: form.debts.map(toProfileDebt),
    goals,
  };
}

export function summarizeProfileForm(form: ProfileFormModel): ProfileFormSummary {
  const monthlyIncome = Math.max(0, asFinite(form.monthlyIncomeNet));
  const monthlyExpenses = Math.max(0, asFinite(form.monthlyEssentialExpenses) + asFinite(form.monthlyDiscretionaryExpenses));
  const monthlyDebt = form.debts.reduce((sum, debt) => sum + estimateDebtMonthlyPaymentKrw(debt), 0);
  const emergencyTargetKrw = Math.round(Math.max(0, asFinite(form.emergencyMonths)) * monthlyExpenses);
  const emergencyGapKrw = Math.max(0, emergencyTargetKrw - Math.max(0, asFinite(form.liquidAssets)));
  return {
    monthlySurplusKrw: Math.round(monthlyIncome - monthlyExpenses),
    debtServiceRatio: monthlyIncome > 0 ? monthlyDebt / monthlyIncome : (monthlyDebt > 0 ? 1 : 0),
    emergencyTargetKrw,
    emergencyGapKrw,
  };
}
