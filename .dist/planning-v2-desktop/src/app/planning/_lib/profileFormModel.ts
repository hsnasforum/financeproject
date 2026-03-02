import { amortizingMonthlyPayment, normalizeAprPct } from "../../../lib/planning/core/v2/debt/calc";
import { loadCanonicalProfile } from "../../../lib/planning/v2/loadCanonicalProfile";
import { normalizeProfileInput } from "../../../lib/planning/v2/profileNormalize";
import { type ProfileCashflowV2, type ProfileDefaultsAppliedV2, type ProfileV2 } from "../../../lib/planning/v2/types";

export type ProfileFormDebt = {
  id: string;
  name: string;
  balance: number;
  aprPct: number;
  monthlyPayment: number;
  remainingMonths: number;
  repaymentType: "amortizing" | "interestOnly";
};

export type ProfileFormGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetMonth: number;
  priority: number;
  minimumMonthlyContribution: number;
};

export type ProfileFormModel = {
  name: string;
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  liquidAssets: number;
  investmentAssets: number;
  debts: ProfileFormDebt[];
  goals: ProfileFormGoal[];
  cashflow?: ProfileCashflowV2;
  defaultsApplied?: ProfileDefaultsAppliedV2;
};

export type ProfileFormSummary = {
  monthlySurplusKrw: number;
  debtServiceRatio: number;
  emergencyTargetMonths: number;
  emergencyTargetKrw: number;
  emergencyGapKrw: number;
  estimatedMonthlyDebtPaymentKrw: number;
  monthlySurplus: number;
  dsrPct: number;
  emergencyMonths: number;
  emergencyTarget: number;
  emergencyGap: number;
  totalDebtPayment: number;
};

export type ProfileFormValidation = {
  errors: string[];
  warnings: string[];
};

export type FormDraft = Partial<Omit<ProfileFormModel, "debts" | "goals">> & {
  debts?: Array<Partial<ProfileFormDebt> & { apr?: number }>;
  goals?: Array<Partial<ProfileFormGoal>>;
};

export type CanonicalProfileDebt = {
  id: string;
  name: string;
  balance: number;
  aprPct: number;
  minimumPayment: number;
  remainingMonths: number;
  repaymentType: "amortizing" | "interestOnly";
};

export type CanonicalProfileGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetMonth: number;
  priority: number;
  minimumMonthlyContribution: number;
};

export type CanonicalProfile = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  liquidAssets: number;
  investmentAssets: number;
  debts: CanonicalProfileDebt[];
  goals: CanonicalProfileGoal[];
  cashflow?: ProfileCashflowV2;
  defaultsApplied?: ProfileDefaultsAppliedV2;
};

export type ProfileValidationIssue = {
  path: string;
  severity: "error" | "warn";
  message: string;
};

export type ProfileValidationResult = {
  ok: boolean;
  issues: ProfileValidationIssue[];
};

const UNIT_SUSPECTED_MIN = 10_000;

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseDefaultsApplied(value: unknown): ProfileDefaultsAppliedV2 | undefined {
  const row = asRecord(value);
  if (Number(row.version) !== 1) return undefined;
  const items = Array.isArray(row.items)
    ? Array.from(new Set(row.items.map((item) => asString(item)).filter((item) => item.length > 0)))
    : [];
  const assumptions = asRecord(row.assumptions);
  const emergencyMonths = asNumber(assumptions.emergencyMonths, 0);
  const goalPriority = asNumber(assumptions.goalPriority, 0);
  const missingFieldsPolicy = asString(assumptions.missingFieldsPolicy);
  if (emergencyMonths < 1 || goalPriority < 1 || !missingFieldsPolicy) return undefined;
  const appliedAt = asString(row.appliedAt);
  return {
    version: 1,
    items,
    assumptions: {
      emergencyMonths: Math.trunc(emergencyMonths),
      goalPriority: Math.trunc(goalPriority),
      missingFieldsPolicy,
    },
    ...(appliedAt ? { appliedAt } : {}),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function debtId(index: number): string {
  return `debt-${index + 1}`;
}

function goalId(index: number): string {
  return `goal-${index + 1}`;
}

function nextGeneratedId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function pickGeneratedId(raw: unknown, fallback: string, used: Set<string>): string {
  const rawId = asString(raw);
  if (rawId.length > 0) return rawId;
  return nextGeneratedId(fallback, used);
}

function normalizeAprInputToPct(value: unknown): number {
  const raw = asNumber(value, 0);
  if (raw > 0 && raw <= 1) return raw * 100;
  return raw;
}

function monthlyInterestOnlyPayment(balance: number, aprPct: number): number {
  const normalizedAprPct = normalizeAprPct(aprPct);
  return Math.round(Math.max(0, balance) * (normalizedAprPct / 100 / 12));
}

function findEmergencyGoal(form: ProfileFormModel): ProfileFormGoal | null {
  return form.goals.find((goal) => {
    const name = goal.name.toLowerCase();
    const id = goal.id.toLowerCase();
    return name.includes("비상") || name.includes("emergency") || id.includes("emergency");
  }) ?? null;
}

function normalizeEmergencyMonths(goal: ProfileFormGoal | null, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 6;
  if (!goal) return 6;
  const raw = goal.targetAmount / monthlyExpenses;
  if (!Number.isFinite(raw) || raw <= 0) return 6;
  return Math.max(1, Math.round(raw));
}

export function createDefaultProfileFormModel(name = "기본 프로필"): ProfileFormModel {
  return {
    name,
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    debts: [],
    goals: [
      {
        id: "goal-emergency",
        name: "비상금",
        targetAmount: 13_800_000,
        currentAmount: 1_200_000,
        targetMonth: 12,
        priority: 5,
        minimumMonthlyContribution: 0,
      },
    ],
  };
}

export function fromProfileJson(json: unknown, name = "기본 프로필"): ProfileFormModel {
  let canonicalProfile: unknown;
  try {
    canonicalProfile = loadCanonicalProfile(json).profile;
  } catch {
    canonicalProfile = normalizeProfileInput(json).profile;
  }
  const row = asRecord(canonicalProfile);
  const defaults = createDefaultProfileFormModel(name);
  const rawDebts = Array.isArray(row.debts) ? row.debts : [];
  const rawGoals = Array.isArray(row.goals) ? row.goals : [];
  const usedGoalIds = new Set<string>();
  const usedDebtIds = new Set<string>();

  const goals: ProfileFormGoal[] = rawGoals.map((goal, index) => {
    const goalRow = asRecord(goal);
    const nextId = pickGeneratedId(goalRow.id, goalId(index), usedGoalIds);
    if (nextId) usedGoalIds.add(nextId);
    return {
      id: nextId,
      name: asString(goalRow.name) || `목표 ${index + 1}`,
      targetAmount: Math.max(0, asNumber(goalRow.targetAmount)),
      currentAmount: Math.max(0, asNumber(goalRow.currentAmount)),
      targetMonth: Math.max(1, clampInt(asNumber(goalRow.targetMonth, 12), 1, 1200)),
      priority: Math.max(1, clampInt(asNumber(goalRow.priority, 3), 1, 10)),
      minimumMonthlyContribution: Math.max(0, asNumber(goalRow.minimumMonthlyContribution)),
    };
  });

  return {
    name: name.trim() || defaults.name,
    monthlyIncomeNet: Math.max(0, asNumber(row.monthlyIncomeNet, defaults.monthlyIncomeNet)),
    monthlyEssentialExpenses: Math.max(0, asNumber(row.monthlyEssentialExpenses, defaults.monthlyEssentialExpenses)),
    monthlyDiscretionaryExpenses: Math.max(0, asNumber(row.monthlyDiscretionaryExpenses, defaults.monthlyDiscretionaryExpenses)),
    liquidAssets: Math.max(0, asNumber(row.liquidAssets, defaults.liquidAssets)),
    investmentAssets: Math.max(0, asNumber(row.investmentAssets, defaults.investmentAssets)),
    debts: rawDebts.map((debt, index) => {
      const debtRow = asRecord(debt);
      const nextId = pickGeneratedId(debtRow.id, debtId(index), usedDebtIds);
      if (nextId) usedDebtIds.add(nextId);
      const balance = Math.max(0, asNumber(debtRow.balance));
      const aprPct = normalizeAprInputToPct(debtRow.apr ?? debtRow.aprPct);
      const remainingMonths = Math.max(1, clampInt(asNumber(debtRow.remainingMonths, 36), 1, 600));
      const repaymentType = debtRow.repaymentType === "interestOnly" ? "interestOnly" : "amortizing";
      const estimatedPayment = repaymentType === "interestOnly"
        ? monthlyInterestOnlyPayment(balance, aprPct)
        : Math.round(amortizingMonthlyPayment(balance, normalizeAprPct(aprPct), remainingMonths));
      return {
        id: nextId,
        name: asString(debtRow.name) || `부채 ${index + 1}`,
        balance,
        aprPct,
        monthlyPayment: Math.max(0, asNumber(debtRow.minimumPayment, asNumber(debtRow.monthlyPayment, estimatedPayment))),
        remainingMonths,
        repaymentType,
      };
    }),
    goals: goals.length > 0 ? goals : defaults.goals,
    ...(row.cashflow && typeof row.cashflow === "object" ? { cashflow: row.cashflow as ProfileCashflowV2 } : {}),
    ...(parseDefaultsApplied(row.defaultsApplied) ? { defaultsApplied: parseDefaultsApplied(row.defaultsApplied) } : {}),
  };
}

export function estimateDebtMonthlyPaymentKrw(debt: ProfileFormDebt): number {
  const principal = Math.max(0, asNumber(debt.balance));
  const aprPct = normalizeAprPct(asNumber(debt.aprPct));
  const months = Math.max(1, clampInt(asNumber(debt.remainingMonths, 1), 1, 600));
  if (debt.repaymentType === "interestOnly") {
    return monthlyInterestOnlyPayment(principal, aprPct);
  }
  return Math.round(amortizingMonthlyPayment(principal, aprPct, months));
}

export function summarizeProfileForm(form: ProfileFormModel): ProfileFormSummary {
  const income = Math.max(0, asNumber(form.monthlyIncomeNet));
  const expenses = Math.max(0, asNumber(form.monthlyEssentialExpenses) + asNumber(form.monthlyDiscretionaryExpenses));
  const monthlyDebtPayment = form.debts.reduce((sum, debt) => {
    const payment = Math.max(0, asNumber(debt.monthlyPayment));
    if (payment > 0) return sum + payment;
    return sum + estimateDebtMonthlyPaymentKrw(debt);
  }, 0);
  const emergencyGoal = findEmergencyGoal(form);
  const emergencyTargetMonths = normalizeEmergencyMonths(emergencyGoal, expenses);
  const emergencyTarget = Math.round(expenses * emergencyTargetMonths);
  const emergencyCurrent = Math.max(0, asNumber(form.liquidAssets));
  const monthlySurplusKrw = Math.round(income - expenses);
  const debtServiceRatio = income > 0 ? monthlyDebtPayment / income : (monthlyDebtPayment > 0 ? 1 : 0);
  const estimatedMonthlyDebtPaymentKrw = Math.round(monthlyDebtPayment);
  const emergencyGapKrw = Math.max(0, emergencyTarget - emergencyCurrent);
  return {
    monthlySurplusKrw,
    debtServiceRatio,
    emergencyTargetMonths,
    emergencyTargetKrw: emergencyTarget,
    emergencyGapKrw,
    estimatedMonthlyDebtPaymentKrw,
    monthlySurplus: monthlySurplusKrw,
    dsrPct: Math.max(0, debtServiceRatio * 100),
    emergencyMonths: emergencyTargetMonths,
    emergencyTarget,
    emergencyGap: emergencyGapKrw,
    totalDebtPayment: estimatedMonthlyDebtPaymentKrw,
  };
}

function toCanonicalProfile(form: ProfileFormModel): CanonicalProfile {
  return {
    monthlyIncomeNet: Math.max(0, asNumber(form.monthlyIncomeNet)),
    monthlyEssentialExpenses: Math.max(0, asNumber(form.monthlyEssentialExpenses)),
    monthlyDiscretionaryExpenses: Math.max(0, asNumber(form.monthlyDiscretionaryExpenses)),
    liquidAssets: Math.max(0, asNumber(form.liquidAssets)),
    investmentAssets: Math.max(0, asNumber(form.investmentAssets)),
    debts: form.debts.map((debt, index) => ({
      id: asString(debt.id) || debtId(index),
      name: asString(debt.name) || `부채 ${index + 1}`,
      balance: Math.max(0, asNumber(debt.balance)),
      aprPct: normalizeAprInputToPct(debt.aprPct),
      minimumPayment: Math.max(0, asNumber(debt.monthlyPayment, estimateDebtMonthlyPaymentKrw(debt))),
      remainingMonths: Math.max(1, clampInt(asNumber(debt.remainingMonths, 36), 1, 600)),
      repaymentType: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    })),
    goals: form.goals.map((goal, index) => ({
      id: asString(goal.id) || goalId(index),
      name: asString(goal.name) || `목표 ${index + 1}`,
      targetAmount: Math.max(0, asNumber(goal.targetAmount)),
      currentAmount: Math.max(0, asNumber(goal.currentAmount)),
      targetMonth: Math.max(1, clampInt(asNumber(goal.targetMonth, 12), 1, 1200)),
      priority: Math.max(1, clampInt(asNumber(goal.priority, 3), 1, 10)),
      minimumMonthlyContribution: Math.max(0, asNumber(goal.minimumMonthlyContribution)),
    })),
    ...(form.cashflow ? { cashflow: form.cashflow } : {}),
    ...(form.defaultsApplied ? { defaultsApplied: form.defaultsApplied } : {}),
  };
}

export function normalizeDraft(draft: FormDraft | unknown, name = "기본 프로필"): CanonicalProfile {
  const row = asRecord(draft);
  const debts = Array.isArray(row.debts)
    ? row.debts.map((entry) => {
      const debt = asRecord(entry);
      return {
        ...debt,
        ...(debt.minimumPayment === undefined && debt.monthlyPayment !== undefined
          ? { minimumPayment: debt.monthlyPayment }
          : {}),
      };
    })
    : undefined;
  const normalizedInput = {
    ...row,
    ...(debts ? { debts } : {}),
  };
  const nextForm = fromProfileJson(normalizedInput, name);
  return toCanonicalProfile(nextForm);
}

export function validateProfile(profile: CanonicalProfile): ProfileValidationResult {
  const nextForm = fromProfileJson(profile);
  const result = validateProfileForm(nextForm);
  const issues: ProfileValidationIssue[] = [];
  const knownDebtIds = new Set<string>();

  result.errors.forEach((message) => {
    issues.push({
      path: "profile",
      severity: "error",
      message,
    });
  });
  result.warnings.forEach((message) => {
    issues.push({
      path: "profile",
      severity: "warn",
      message,
    });
  });

  profile.debts.forEach((debt, index) => {
    const debtId = asString(debt.id);
    if (!debtId) {
      issues.push({ path: `debts[${index}].id`, severity: "error", message: "id를 입력하세요." });
    } else if (knownDebtIds.has(debtId)) {
      issues.push({ path: `debts[${index}].id`, severity: "error", message: "id가 중복되었습니다." });
    } else {
      knownDebtIds.add(debtId);
    }
  });

  nextForm.debts.forEach((debt, index) => {
    if (!debt.id.trim()) {
      issues.push({ path: `debts[${index}].id`, severity: "error", message: "id를 입력하세요." });
    }

    if (debt.aprPct > 0 && debt.aprPct <= 1) {
      issues.push({
        path: `debts[${index}].aprPct`,
        severity: "warn",
        message: "금리는 퍼센트(예: 4.8)로 입력하세요.",
      });
    }
    if (!Number.isFinite(debt.aprPct) || debt.aprPct < 0 || debt.aprPct > 100) {
      issues.push({
        path: `debts[${index}].aprPct`,
        severity: "error",
        message: "APR은 0~100 범위여야 합니다.",
      });
    }
  });

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function deriveSummary(input: FormDraft | CanonicalProfile): ProfileFormSummary {
  const canonical = normalizeDraft(input);
  const asForm = fromProfileJson(canonical);
  return summarizeProfileForm(asForm);
}

export function toProfileJson(form: ProfileFormModel): ProfileV2 {
  const canonicalInput = {
    monthlyIncomeNet: Math.max(0, asNumber(form.monthlyIncomeNet)),
    monthlyEssentialExpenses: Math.max(0, asNumber(form.monthlyEssentialExpenses)),
    monthlyDiscretionaryExpenses: Math.max(0, asNumber(form.monthlyDiscretionaryExpenses)),
    liquidAssets: Math.max(0, asNumber(form.liquidAssets)),
    investmentAssets: Math.max(0, asNumber(form.investmentAssets)),
    debts: form.debts.map((debt, index) => ({
      id: asString(debt.id) || debtId(index),
      name: asString(debt.name) || `부채 ${index + 1}`,
      balance: Math.max(0, asNumber(debt.balance)),
      minimumPayment: Math.max(0, asNumber(debt.monthlyPayment, estimateDebtMonthlyPaymentKrw(debt))),
      aprPct: normalizeAprPct(asNumber(debt.aprPct)),
      remainingMonths: Math.max(1, clampInt(asNumber(debt.remainingMonths, 36), 1, 600)),
      repaymentType: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    })),
    goals: form.goals.map((goal, index) => ({
      id: asString(goal.id) || goalId(index),
      name: asString(goal.name) || `목표 ${index + 1}`,
      targetAmount: Math.max(0, asNumber(goal.targetAmount)),
      currentAmount: Math.max(0, asNumber(goal.currentAmount)),
      targetMonth: Math.max(1, clampInt(asNumber(goal.targetMonth, 12), 1, 1200)),
      priority: Math.max(1, clampInt(asNumber(goal.priority, 3), 1, 10)),
      minimumMonthlyContribution: Math.max(0, asNumber(goal.minimumMonthlyContribution)),
    })),
    ...(form.cashflow ? { cashflow: form.cashflow } : {}),
    ...(form.defaultsApplied ? { defaultsApplied: form.defaultsApplied } : {}),
  };
  return loadCanonicalProfile(canonicalInput).profile;
}

export function validateProfileForm(form: ProfileFormModel): ProfileFormValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const debtIds = new Set<string>();

  const amountChecks: Array<{ label: string; value: number }> = [
    { label: "월 실수령", value: form.monthlyIncomeNet },
    { label: "필수지출", value: form.monthlyEssentialExpenses },
    { label: "선택지출", value: form.monthlyDiscretionaryExpenses },
    { label: "현금성 자산", value: form.liquidAssets },
    { label: "투자자산", value: form.investmentAssets },
  ];

  amountChecks.forEach(({ label, value }) => {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${label}은(는) 0 이상의 숫자여야 합니다.`);
      return;
    }
    if (value > 0 && value < UNIT_SUSPECTED_MIN) {
      warnings.push(`UNIT_SUSPECTED: ${label} 값이 너무 작습니다. 단위를 확인하세요.`);
    }
  });

  form.debts.forEach((debt, index) => {
    const row = index + 1;
    const debtIdText = debt.id.trim();
    if (!debtIdText) errors.push(`부채 ${row}: id를 입력하세요.`);
    if (debtIdText) {
      if (debtIds.has(debtIdText)) errors.push(`부채 ${row}: id가 중복되었습니다 (${debtIdText}).`);
      debtIds.add(debtIdText);
    }
    if (!debt.name.trim()) errors.push(`부채 ${row}: 이름을 입력하세요.`);
    if (!Number.isFinite(debt.balance) || debt.balance < 0) errors.push(`부채 ${row}: 잔액은 0 이상이어야 합니다.`);
    if (!Number.isFinite(debt.aprPct) || debt.aprPct < 0 || debt.aprPct > 100) {
      errors.push(`부채 ${row}: APR은 0~100 범위여야 합니다.`);
    } else if (debt.aprPct > 0 && debt.aprPct <= 1) {
      warnings.push(`APR_PERCENT_EXPECTED: 부채 ${row} 금리는 %로 입력하세요 (예: 4.8).`);
    }
    if (!Number.isFinite(debt.monthlyPayment) || debt.monthlyPayment < 0) {
      errors.push(`부채 ${row}: 월 상환액은 0 이상이어야 합니다.`);
    }
    if (Number.isFinite(debt.balance) && debt.balance > 0 && Number.isFinite(debt.monthlyPayment) && debt.monthlyPayment <= 0) {
      errors.push(`부채 ${row}: 잔액이 있으면 월 상환액은 0보다 커야 합니다.`);
    }
    if (!Number.isFinite(debt.remainingMonths) || debt.remainingMonths < 1) {
      errors.push(`부채 ${row}: 잔여개월은 1 이상이어야 합니다.`);
    }
    if (Number.isFinite(debt.balance) && debt.balance > 0 && debt.balance < UNIT_SUSPECTED_MIN) {
      warnings.push(`UNIT_SUSPECTED: 부채 ${row} 잔액 값이 너무 작습니다. 단위를 확인하세요.`);
    }
  });

  form.goals.forEach((goal, index) => {
    const row = index + 1;
    if (!goal.id.trim()) errors.push(`목표 ${row}: id를 입력하세요.`);
    if (!goal.name.trim()) errors.push(`목표 ${row}: 목표명을 입력하세요.`);
    if (!Number.isFinite(goal.targetAmount) || goal.targetAmount < 0) {
      errors.push(`목표 ${row}: 목표액은 0 이상이어야 합니다.`);
    }
    if (!Number.isFinite(goal.currentAmount) || goal.currentAmount < 0) {
      errors.push(`목표 ${row}: 현재금액은 0 이상이어야 합니다.`);
    }
    if (Number.isFinite(goal.targetAmount) && Number.isFinite(goal.currentAmount) && goal.targetAmount < goal.currentAmount) {
      errors.push(`목표 ${row}: 목표액은 현재금액 이상이어야 합니다.`);
    }
    if (!Number.isFinite(goal.targetMonth) || goal.targetMonth <= 0) {
      errors.push(`목표 ${row}: 목표월은 1 이상이어야 합니다.`);
    }
    if (!Number.isFinite(goal.priority) || goal.priority < 1) {
      errors.push(`목표 ${row}: 우선순위는 1 이상이어야 합니다.`);
    }
    if (!Number.isFinite(goal.minimumMonthlyContribution) || goal.minimumMonthlyContribution < 0) {
      errors.push(`목표 ${row}: 최소월적립은 0 이상이어야 합니다.`);
    }
    if (Number.isFinite(goal.targetAmount) && goal.targetAmount > 0 && goal.targetAmount < UNIT_SUSPECTED_MIN) {
      warnings.push(`UNIT_SUSPECTED: 목표 ${row} 목표액 값이 너무 작습니다. 단위를 확인하세요.`);
    }
  });

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}

export function validateDebtOfferLiabilityIds(
  offers: Array<{ liabilityId?: string }>,
  debts: Array<{ id?: string }>,
): string[] {
  const known = new Set(
    debts
      .map((debt) => asString(debt.id))
      .filter((id) => id.length > 0),
  );
  const invalid = offers
    .map((offer) => asString(offer.liabilityId))
    .filter((id) => id.length > 0 && !known.has(id));
  return Array.from(new Set(invalid));
}
