import { type ProfileV2, type ProfileV2Debt, type ProfileV2Goal } from "../../v2/types";
import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { type V3DraftRecord } from "../domain/draft";

type ApplyDraftInput = {
  baseProfile: ProfileV2;
  draft: V3DraftRecord;
};

export type V3DraftApplySummary = {
  changedFields: string[];
  notes: string[];
};

export type ApplyDraftToProfileResult = {
  merged: ProfileV2;
  summary: V3DraftApplySummary;
};

type PartialDebtPatch = {
  id?: unknown;
  name?: unknown;
  balance?: unknown;
  minimumPayment?: unknown;
  aprPct?: unknown;
  apr?: unknown;
  remainingMonths?: unknown;
  repaymentType?: unknown;
};

type PartialGoalPatch = {
  id?: unknown;
  name?: unknown;
  targetAmount?: unknown;
  currentAmount?: unknown;
  targetMonth?: unknown;
  priority?: unknown;
  minimumMonthlyContribution?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function monthlySurplus(profile: ProfileV2): number {
  return profile.monthlyIncomeNet - profile.monthlyEssentialExpenses - profile.monthlyDiscretionaryExpenses;
}

function debtServiceRatioPct(profile: ProfileV2): number | null {
  const income = profile.monthlyIncomeNet;
  if (!Number.isFinite(income) || income <= 0) return null;
  const debtPayment = profile.debts
    .map((debt) => Number(debt.minimumPayment))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
  return Math.round((debtPayment / income) * 10_000) / 100;
}

function emergencyMonths(profile: ProfileV2): number | null {
  const monthlyExpense = profile.monthlyEssentialExpenses + profile.monthlyDiscretionaryExpenses;
  if (!Number.isFinite(monthlyExpense) || monthlyExpense <= 0) return null;
  return Math.round((profile.liquidAssets / monthlyExpense) * 10) / 10;
}

function applyNumericField(
  merged: ProfileV2,
  patch: Record<string, unknown>,
  field: "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses",
  changed: Set<string>,
): void {
  const next = asFiniteNumber(patch[field]);
  if (next === null) return;
  if (!Number.isFinite(merged[field])) return;
  if (merged[field] === next) return;
  merged[field] = next;
  changed.add(field);
}

function mergeDebtById(baseDebt: ProfileV2Debt, patch: PartialDebtPatch, changed: Set<string>): ProfileV2Debt {
  const next: ProfileV2Debt = { ...baseDebt };

  const name = asString(patch.name);
  if (name && next.name !== name) {
    next.name = name;
    changed.add(`debts.${baseDebt.id}.name`);
  }

  const numericFields: Array<keyof Pick<ProfileV2Debt, "balance" | "minimumPayment" | "aprPct" | "apr" | "remainingMonths">> = [
    "balance",
    "minimumPayment",
    "aprPct",
    "apr",
    "remainingMonths",
  ];

  for (const field of numericFields) {
    if (!(field in patch)) continue;
    const nextValue = asFiniteNumber((patch as Record<string, unknown>)[field]);
    if (nextValue === null) continue;
    const current = Number(next[field]);
    if (Number.isFinite(current) && current === nextValue) continue;
    (next as Record<string, unknown>)[field] = nextValue;
    changed.add(`debts.${baseDebt.id}.${field}`);
  }

  const repaymentType = asString(patch.repaymentType);
  if ((repaymentType === "amortizing" || repaymentType === "interestOnly") && next.repaymentType !== repaymentType) {
    next.repaymentType = repaymentType;
    changed.add(`debts.${baseDebt.id}.repaymentType`);
  }

  return next;
}

function mergeGoalById(baseGoal: ProfileV2Goal, patch: PartialGoalPatch, changed: Set<string>): ProfileV2Goal {
  const next: ProfileV2Goal = { ...baseGoal };

  const name = asString(patch.name);
  if (name && next.name !== name) {
    next.name = name;
    changed.add(`goals.${baseGoal.id}.name`);
  }

  const numericFields: Array<keyof Pick<ProfileV2Goal, "targetAmount" | "currentAmount" | "targetMonth" | "priority" | "minimumMonthlyContribution">> = [
    "targetAmount",
    "currentAmount",
    "targetMonth",
    "priority",
    "minimumMonthlyContribution",
  ];

  for (const field of numericFields) {
    if (!(field in patch)) continue;
    const nextValue = asFiniteNumber((patch as Record<string, unknown>)[field]);
    if (nextValue === null) continue;
    const current = Number(next[field]);
    if (Number.isFinite(current) && current === nextValue) continue;
    (next as Record<string, unknown>)[field] = nextValue;
    changed.add(`goals.${baseGoal.id}.${field}`);
  }

  return next;
}

function applyArrayPatches(merged: ProfileV2, patch: Record<string, unknown>, changed: Set<string>): void {
  if (Array.isArray(patch.debts) && Array.isArray(merged.debts)) {
    const byId = new Map<string, PartialDebtPatch>();
    for (const row of patch.debts) {
      if (!isRecord(row)) continue;
      const id = asString(row.id);
      if (!id) continue;
      byId.set(id, row);
    }
    merged.debts = merged.debts.map((debt) => {
      const debtPatch = byId.get(debt.id);
      if (!debtPatch) return debt;
      return mergeDebtById(debt, debtPatch, changed);
    });
  }

  if (Array.isArray(patch.goals) && Array.isArray(merged.goals)) {
    const byId = new Map<string, PartialGoalPatch>();
    for (const row of patch.goals) {
      if (!isRecord(row)) continue;
      const id = asString(row.id);
      if (!id) continue;
      byId.set(id, row);
    }
    merged.goals = merged.goals.map((goal) => {
      const goalPatch = byId.get(goal.id);
      if (!goalPatch) return goal;
      return mergeGoalById(goal, goalPatch, changed);
    });
  }
}

function buildNotes(before: ProfileV2, after: ProfileV2, draft: V3DraftRecord): string[] {
  const notes: string[] = [];

  const beforeSurplus = monthlySurplus(before);
  const afterSurplus = monthlySurplus(after);
  if (beforeSurplus !== afterSurplus) {
    notes.push(`monthly surplus: ${Math.round(beforeSurplus).toLocaleString("ko-KR")} -> ${Math.round(afterSurplus).toLocaleString("ko-KR")} KRW`);
  }

  const beforeDsr = debtServiceRatioPct(before);
  const afterDsr = debtServiceRatioPct(after);
  if (beforeDsr !== null && afterDsr !== null && beforeDsr !== afterDsr) {
    notes.push(`DSR: ${beforeDsr.toFixed(2)}% -> ${afterDsr.toFixed(2)}%`);
  }

  const beforeEmergency = emergencyMonths(before);
  const afterEmergency = emergencyMonths(after);
  if (beforeEmergency !== null && afterEmergency !== null && beforeEmergency !== afterEmergency) {
    notes.push(`emergency months: ${beforeEmergency.toFixed(1)} -> ${afterEmergency.toFixed(1)}`);
  }

  const assumptionNotes = Array.isArray(draft.draftPatch.assumptions)
    ? draft.draftPatch.assumptions.map((row) => asString(row)).filter((row) => row.length > 0)
    : [];
  if (assumptionNotes.length > 0) {
    notes.push(`assumptions: ${assumptionNotes.join("; ")}`);
  }

  return notes.slice(0, 10);
}

export function applyDraftToProfile(input: ApplyDraftInput): ApplyDraftToProfileResult {
  const canonicalBase = loadCanonicalProfile(input.baseProfile).profile;
  const patch = isRecord(input.draft.draftPatch)
    ? (input.draft.draftPatch as Record<string, unknown>)
    : {};

  const merged: ProfileV2 = {
    ...canonicalBase,
    debts: canonicalBase.debts.map((row) => ({ ...row })),
    goals: canonicalBase.goals.map((row) => ({ ...row })),
    ...(canonicalBase.cashflow ? { cashflow: structuredClone(canonicalBase.cashflow) } : {}),
    ...(canonicalBase.tax ? { tax: structuredClone(canonicalBase.tax) } : {}),
    ...(canonicalBase.pensionsDetailed ? { pensionsDetailed: structuredClone(canonicalBase.pensionsDetailed) } : {}),
    ...(canonicalBase.defaultsApplied ? { defaultsApplied: structuredClone(canonicalBase.defaultsApplied) } : {}),
  };

  const changedFields = new Set<string>();
  applyNumericField(merged, patch, "monthlyIncomeNet", changedFields);
  applyNumericField(merged, patch, "monthlyEssentialExpenses", changedFields);
  applyNumericField(merged, patch, "monthlyDiscretionaryExpenses", changedFields);
  applyArrayPatches(merged, patch, changedFields);

  const canonicalMerged = loadCanonicalProfile(merged).profile;
  const notes = buildNotes(canonicalBase, canonicalMerged, input.draft);

  if (changedFields.size < 1) {
    notes.unshift("no profile field changed by draft patch");
  }

  return {
    merged: canonicalMerged,
    summary: {
      changedFields: [...changedFields].sort((a, b) => a.localeCompare(b)),
      notes,
    },
  };
}
