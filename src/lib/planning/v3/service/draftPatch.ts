import { type MonthlyCashflow, type ProfileV2DraftPatch } from "../domain/types";

function medianRounded(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid]);
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function buildProfileV2DraftPatch(cashflows: MonthlyCashflow[]): ProfileV2DraftPatch {
  const netIncomeMedian = medianRounded(cashflows.map((cf) => cf.netKrw));
  const expenseMedian = medianRounded(cashflows.map((cf) => Math.abs(cf.expenseKrw)));
  const monthlyEssentialExpenses = Math.max(0, Math.round(expenseMedian * 0.7));
  const monthlyDiscretionaryExpenses = Math.max(0, expenseMedian - monthlyEssentialExpenses);

  return {
    monthlyIncomeNet: netIncomeMedian,
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    assumptions: [
      "monthlyIncomeNet uses median monthly net (assumption)",
      "expense split 70/30 (assumption)",
    ],
    monthsConsidered: cashflows.length,
  };
}

export function buildProfileDraftPatchFromCashflow(cashflows: MonthlyCashflow[]): ProfileV2DraftPatch {
  return buildProfileV2DraftPatch(cashflows);
}
