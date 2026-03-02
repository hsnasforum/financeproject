import { amortizingMonthlyPayment, monthlyRateFromAprPct, normalizeAprPct } from "./debt/calc";
import { type ProfileCashflowV2, type ProfileV2, type ProfileV2Debt, type ProfileV2Goal } from "./types";
import { validateProfileV2 } from "./validate";

export type NormalizeResult = {
  ok: boolean;
  profile: ProfileV2;
  legacy?: Record<string, unknown>;
  warnings: string[];
  fixes: Array<{ field: string; from: unknown; to: unknown }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmergencyLabel(value: string): boolean {
  const lowered = value.toLowerCase();
  return lowered.includes("emergency") || lowered.includes("비상");
}

function safeNumber(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

function nextId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizeAprToPct(raw: number | undefined, warnings: string[], fixes: NormalizeResult["fixes"], field: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw < 0) {
    warnings.push("APR_NEGATIVE_CLAMPED");
    fixes.push({ field, from: raw, to: 0 });
    return 0;
  }
  if (raw <= 1) {
    return normalizeAprPct(raw);
  }
  if (raw <= 100) {
    return raw;
  }
  warnings.push("APR_OUT_OF_RANGE_SCALED");
  fixes.push({ field, from: raw, to: 100 });
  return 100;
}

function aprPctToDecimal(aprPct: number): number {
  const pct = normalizeAprPct(aprPct);
  return pct / 100;
}

function toAprPct(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return normalizeAprPct(value);
}

function coerceDebtAprPct(debt: Record<string, unknown>): number {
  const aprPct = asNumber(debt.aprPct) ?? asNumber(debt.ratePct);
  if (aprPct !== undefined) return toAprPct(aprPct);
  const aprDecimal = asNumber(debt.apr);
  if (aprDecimal !== undefined) return toAprPct(aprDecimal);
  return 0;
}

function estimateMinimumPayment(balance: number, aprPct: number, remainingMonths: number, repaymentType: "amortizing" | "interestOnly"): number {
  const principal = Math.max(0, balance);
  const months = Math.max(1, Math.trunc(remainingMonths));
  if (repaymentType === "interestOnly") {
    const monthlyRate = monthlyRateFromAprPct(aprPct);
    return roundMoney(principal * monthlyRate);
  }
  return roundMoney(amortizingMonthlyPayment(principal, normalizeAprPct(aprPct), months));
}

function normalizeDebtList(
  input: Record<string, unknown>,
  warnings: string[],
  fixes: NormalizeResult["fixes"],
): ProfileV2Debt[] {
  const sourceDebts = Array.isArray(input.debts)
    ? input.debts
    : (Array.isArray(input.liabilities) ? input.liabilities : []);

  const seen = new Set<string>();
  return sourceDebts.map((rawDebt, index) => {
    const debt = asRecord(rawDebt);
    const rawId = asString(debt.id) || asString(debt.liabilityId) || nextId("debt", index);
    let id = rawId;
    if (seen.has(id)) {
      const deduped = `${id}-${index + 1}`;
      warnings.push("DEBT_ID_DUPLICATED_RENAMED");
      fixes.push({ field: `debts[${index}].id`, from: id, to: deduped });
      id = deduped;
    }
    seen.add(id);

    const balance = Math.max(0, safeNumber(
      asNumber(debt.balance)
      ?? asNumber(debt.principalKrw)
      ?? asNumber(debt.principal)
      ?? 0,
    ));

    const aprRaw = asNumber(debt.aprPct) ?? asNumber(debt.apr) ?? asNumber(debt.ratePct);
    const aprPct = normalizeAprToPct(aprRaw, warnings, fixes, `debts[${index}].aprPct`);
    const remainingMonths = Math.max(1, Math.trunc(
      safeNumber(asNumber(debt.remainingMonths) ?? asNumber(debt.termMonths) ?? 36, 36),
    ));
    const repaymentType = debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing";

    const minimumPaymentRaw = asNumber(debt.minimumPayment) ?? asNumber(debt.minimumPaymentKrw) ?? asNumber(debt.monthlyPaymentKrw);
    const minimumPayment = typeof minimumPaymentRaw === "number" && minimumPaymentRaw >= 0
      ? minimumPaymentRaw
      : estimateMinimumPayment(balance, aprPct, remainingMonths, repaymentType);

    return {
      id,
      name: asString(debt.name) || asString(debt.title) || `Debt ${index + 1}`,
      balance,
      minimumPayment,
      aprPct,
      remainingMonths,
      repaymentType,
    };
  });
}

function normalizeGoalList(
  input: Record<string, unknown>,
  warnings: string[],
  fixes: NormalizeResult["fixes"],
): ProfileV2Goal[] {
  const sourceGoals = Array.isArray(input.goals)
    ? input.goals
    : (Array.isArray(input.goalsV2) ? input.goalsV2 : []);

  const seen = new Set<string>();
  return sourceGoals.map((rawGoal, index) => {
    const goal = asRecord(rawGoal);
    const rawId = asString(goal.id) || asString(goal.goalId) || nextId("goal", index);
    let id = rawId;
    if (seen.has(id)) {
      const deduped = `${id}-${index + 1}`;
      warnings.push("GOAL_ID_DUPLICATED_RENAMED");
      fixes.push({ field: `goals[${index}].id`, from: id, to: deduped });
      id = deduped;
    }
    seen.add(id);

    const name = asString(goal.name) || asString(goal.title) || `Goal ${index + 1}`;
    const targetAmount = Math.max(0, safeNumber(asNumber(goal.targetAmount) ?? asNumber(goal.amount) ?? 0));
    const currentAmount = Math.max(0, safeNumber(asNumber(goal.currentAmount) ?? asNumber(goal.savedAmount) ?? 0));
    let targetMonth = asNumber(goal.targetMonth) ?? asNumber(goal.dueMonth);
    if (typeof targetMonth === "number" && targetMonth <= 0) {
      warnings.push("GOAL_TARGET_MONTH_INVALID_DEFAULTED");
      fixes.push({ field: `goals[${index}].targetMonth`, from: targetMonth, to: 12 });
      targetMonth = 12;
    }

    const base: ProfileV2Goal = {
      id,
      name: isEmergencyLabel(name) ? "Emergency Fund" : name,
      targetAmount,
      ...(currentAmount > 0 ? { currentAmount } : {}),
      ...(typeof targetMonth === "number" ? { targetMonth: Math.max(1, Math.trunc(targetMonth)) } : {}),
      ...(typeof asNumber(goal.priority) === "number" ? { priority: Math.max(1, Math.trunc(safeNumber(asNumber(goal.priority), 3))) } : {}),
      ...(typeof asNumber(goal.minimumMonthlyContribution) === "number"
        ? { minimumMonthlyContribution: Math.max(0, safeNumber(asNumber(goal.minimumMonthlyContribution), 0)) }
        : {}),
    };

    return base;
  });
}

function normalizeCashflow(
  input: Record<string, unknown>,
  warnings: string[],
  fixes: NormalizeResult["fixes"],
): ProfileCashflowV2 | undefined {
  const sourceCashflow = asRecord(input.cashflow);
  if (Object.keys(sourceCashflow).length < 1) return undefined;

  const monthlyIncomeKrw = asNumber(sourceCashflow.monthlyIncomeKrw);
  const monthlyFixedExpensesKrw = asNumber(sourceCashflow.monthlyFixedExpensesKrw);
  const monthlyVariableExpensesKrw = asNumber(sourceCashflow.monthlyVariableExpensesKrw);

  const normalized: ProfileCashflowV2 = {
    ...(Array.isArray(sourceCashflow.phases) ? { phases: sourceCashflow.phases as ProfileCashflowV2["phases"] } : {}),
    ...(Array.isArray(sourceCashflow.pensions) ? { pensions: sourceCashflow.pensions as ProfileCashflowV2["pensions"] } : {}),
    ...(Array.isArray(sourceCashflow.contributions) ? { contributions: sourceCashflow.contributions as ProfileCashflowV2["contributions"] } : {}),
    ...(sourceCashflow.rules && typeof sourceCashflow.rules === "object" ? { rules: sourceCashflow.rules as ProfileCashflowV2["rules"] } : {}),
  };

  if (monthlyIncomeKrw !== undefined) {
    warnings.push("DUPLICATE_FIELD_REMOVED:cashflow.monthlyIncomeKrw");
    fixes.push({ field: "cashflow.monthlyIncomeKrw", from: monthlyIncomeKrw, to: undefined });
  }
  if (monthlyFixedExpensesKrw !== undefined) {
    warnings.push("DUPLICATE_FIELD_REMOVED:cashflow.monthlyFixedExpensesKrw");
    fixes.push({ field: "cashflow.monthlyFixedExpensesKrw", from: monthlyFixedExpensesKrw, to: undefined });
  }
  if (monthlyVariableExpensesKrw !== undefined) {
    warnings.push("DUPLICATE_FIELD_REMOVED:cashflow.monthlyVariableExpensesKrw");
    fixes.push({ field: "cashflow.monthlyVariableExpensesKrw", from: monthlyVariableExpensesKrw, to: undefined });
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function resolveCanonicalMonthly(input: Record<string, unknown>, field: {
  topLevel: "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses";
  cashflow: "monthlyIncomeKrw" | "monthlyFixedExpensesKrw" | "monthlyVariableExpensesKrw";
}, warnings: string[], fixes: NormalizeResult["fixes"]): number {
  const topLevelValue = asNumber(input[field.topLevel]);
  const cashflowValue = asNumber(asRecord(input.cashflow)[field.cashflow]);

  if (typeof topLevelValue === "number" && typeof cashflowValue === "number" && topLevelValue !== cashflowValue) {
    warnings.push(`DUPLICATE_FIELD_MISMATCH:${field.topLevel}`);
    fixes.push({ field: field.topLevel, from: topLevelValue, to: cashflowValue });
  }

  // Policy: cashflow value wins when present.
  const picked = typeof cashflowValue === "number"
    ? cashflowValue
    : (typeof topLevelValue === "number" ? topLevelValue : 0);

  return Math.max(0, picked);
}

function resolveCanonicalAsset(
  input: Record<string, unknown>,
  field: {
    topLevel: "liquidAssets" | "investmentAssets";
    nested: "cashKrw" | "investmentsKrw";
  },
  warnings: string[],
  fixes: NormalizeResult["fixes"],
): number {
  const topLevelValue = asNumber(input[field.topLevel]);
  const nestedValue = asNumber(asRecord(input.assets)[field.nested]);

  if (typeof topLevelValue === "number" && typeof nestedValue === "number" && topLevelValue !== nestedValue) {
    warnings.push(`DUPLICATE_FIELD_MISMATCH:${field.topLevel}`);
    fixes.push({ field: field.topLevel, from: nestedValue, to: topLevelValue });
  }

  const picked = typeof topLevelValue === "number"
    ? topLevelValue
    : (typeof nestedValue === "number" ? nestedValue : 0);
  return Math.max(0, picked);
}

export function normalizeProfileInput(input: unknown): NormalizeResult {
  const warnings: string[] = [];
  const fixes: NormalizeResult["fixes"] = [];

  const source = asRecord(input);
  if (Object.keys(source).length < 1) {
    return {
      ok: false,
      profile: {
        monthlyIncomeNet: 0,
        monthlyEssentialExpenses: 0,
        monthlyDiscretionaryExpenses: 0,
        liquidAssets: 0,
        investmentAssets: 0,
        debts: [],
        goals: [],
      },
      warnings: ["INVALID_PROFILE_OBJECT"],
      fixes,
    };
  }

  const monthlyIncomeNet = resolveCanonicalMonthly(source, {
    topLevel: "monthlyIncomeNet",
    cashflow: "monthlyIncomeKrw",
  }, warnings, fixes);
  const monthlyEssentialExpenses = resolveCanonicalMonthly(source, {
    topLevel: "monthlyEssentialExpenses",
    cashflow: "monthlyFixedExpensesKrw",
  }, warnings, fixes);
  const monthlyDiscretionaryExpenses = resolveCanonicalMonthly(source, {
    topLevel: "monthlyDiscretionaryExpenses",
    cashflow: "monthlyVariableExpensesKrw",
  }, warnings, fixes);

  const liquidAssets = resolveCanonicalAsset(source, {
    topLevel: "liquidAssets",
    nested: "cashKrw",
  }, warnings, fixes);
  const investmentAssets = resolveCanonicalAsset(source, {
    topLevel: "investmentAssets",
    nested: "investmentsKrw",
  }, warnings, fixes);

  const debts = normalizeDebtList(source, warnings, fixes);
  const goals = normalizeGoalList(source, warnings, fixes);
  const normalizedCashflow = normalizeCashflow(source, warnings, fixes);

  const canonicalCandidate: ProfileV2 = {
    ...(typeof asNumber(source.currentAge) === "number" ? { currentAge: Math.max(0, Math.trunc(safeNumber(asNumber(source.currentAge), 0))) } : {}),
    ...(typeof asNumber(source.birthYear) === "number" ? { birthYear: Math.max(1900, Math.trunc(safeNumber(asNumber(source.birthYear), 1900))) } : {}),
    monthlyIncomeNet,
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    liquidAssets,
    investmentAssets,
    debts,
    goals,
    ...(normalizedCashflow ? { cashflow: normalizedCashflow } : {}),
    ...(source.tax && typeof source.tax === "object" ? { tax: source.tax as ProfileV2["tax"] } : {}),
    ...(source.pensionsDetailed && typeof source.pensionsDetailed === "object"
      ? { pensionsDetailed: source.pensionsDetailed as ProfileV2["pensionsDetailed"] }
      : {}),
    ...(source.defaultsApplied && typeof source.defaultsApplied === "object"
      ? { defaultsApplied: source.defaultsApplied as ProfileV2["defaultsApplied"] }
      : {}),
  };

  const profile = canonicalCandidate;
  let ok = true;
  try {
    validateProfileV2(canonicalCandidate);
  } catch {
    ok = false;
    warnings.push("NORMALIZED_PROFILE_VALIDATION_FAILED");
  }

  const legacyDebts = profile.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    balance: debt.balance,
    minimumPayment: debt.minimumPayment,
    apr: aprPctToDecimal(coerceDebtAprPct(asRecord(debt))),
    aprPct: coerceDebtAprPct(asRecord(debt)),
    remainingMonths: debt.remainingMonths,
    repaymentType: debt.repaymentType,
  }));

  return {
    ok,
    profile,
    legacy: {
      monthlyIncomeNet: profile.monthlyIncomeNet,
      monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
      monthlyDiscretionaryExpenses: profile.monthlyDiscretionaryExpenses,
      liquidAssets: profile.liquidAssets,
      investmentAssets: profile.investmentAssets,
      debts: legacyDebts,
      goals: profile.goals,
      ...(profile.defaultsApplied ? { defaultsApplied: profile.defaultsApplied } : {}),
    },
    warnings,
    fixes,
  };
}
