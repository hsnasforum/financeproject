import { type ProfileV2 } from "../../server/v2/types";
import { type PlanningV3Draft } from "../drafts/types";

const KNOWN_ASSUMPTION_NOTES = new Set([
  "monthlyIncomeNet uses median monthly net (assumption)",
  "expense split 70/30 (assumption)",
]);

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toNonNegativeMoney(value: unknown): number {
  return Math.max(0, Math.round(toFiniteNumber(value, 0)));
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(toFiniteNumber(value, fallback));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeAssumptionNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const normalized = row.trim();
    if (!KNOWN_ASSUMPTION_NOTES.has(normalized)) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

function computeMedian(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function summarizeFromCashflow(draft: PlanningV3Draft): {
  medianIncomeKrw: number;
  medianExpenseAbsKrw: number;
} {
  const incomes = draft.cashflow.map((row) => toNonNegativeMoney(row.incomeKrw));
  const expensesAbs = draft.cashflow.map((row) => Math.abs(toFiniteNumber(row.expenseKrw, 0))).map((value) => toNonNegativeMoney(value));
  return {
    medianIncomeKrw: toNonNegativeMoney(computeMedian(incomes)),
    medianExpenseAbsKrw: toNonNegativeMoney(computeMedian(expensesAbs)),
  };
}

export function buildProfileV2DraftFromV3Draft(draft: PlanningV3Draft): ProfileV2 {
  const monthlyIncomeNet = toNonNegativeMoney(draft.draftPatch.monthlyIncomeNet);
  const monthlyEssentialExpenses = toNonNegativeMoney(draft.draftPatch.monthlyEssentialExpenses);
  const monthlyDiscretionaryExpenses = toNonNegativeMoney(draft.draftPatch.monthlyDiscretionaryExpenses);
  const monthlySurplusKrw = Math.max(0, monthlyIncomeNet - monthlyEssentialExpenses - monthlyDiscretionaryExpenses);
  const monthsConsidered = toNonNegativeInt(draft.draftPatch.monthsConsidered, 0);
  const assumptions = normalizeAssumptionNotes(draft.draftPatch.assumptions);
  const summary = summarizeFromCashflow(draft);

  const defaultItems = [
    "planning-v3-export-only",
    "source=csv",
    `rows=${toNonNegativeInt(draft.meta.rows, 0)}`,
    `months=${toNonNegativeInt(draft.meta.months, 0)}`,
    `monthsConsidered=${monthsConsidered}`,
    `monthlySurplusKrw=${monthlySurplusKrw}`,
    `medianIncomeKrw=${summary.medianIncomeKrw}`,
    `medianExpenseAbsKrw=${summary.medianExpenseAbsKrw}`,
    ...assumptions.map((note) => `assumption=${note}`),
  ];

  const profile: ProfileV2 = {
    monthlyIncomeNet,
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
    cashflow: {
      monthlyIncomeKrw: monthlyIncomeNet,
      monthlyFixedExpensesKrw: monthlyEssentialExpenses,
      monthlyVariableExpensesKrw: monthlyDiscretionaryExpenses,
    },
    defaultsApplied: {
      version: 1,
      items: defaultItems,
      assumptions: {
        emergencyMonths: 6,
        goalPriority: 3,
        missingFieldsPolicy: "fill-with-defaults",
      },
      appliedAt: "v3-export",
    },
  };

  return profile;
}

