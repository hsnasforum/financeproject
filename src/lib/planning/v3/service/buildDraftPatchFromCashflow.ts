import { type ProfileV2 } from "../../v2/types";
import { type CashflowDraftPatch, type MonthlyCashflow } from "../domain/types";

export type BuildDraftPatchFromCashflowResult = {
  draftPatch: CashflowDraftPatch;
  profilePatch: Pick<ProfileV2, "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses">;
};

function medianRounded(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle]);
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function toRecentMonths(input: MonthlyCashflow[]): MonthlyCashflow[] {
  return [...input]
    .sort((left, right) => {
      const leftKey = left.month ?? left.ym;
      const rightKey = right.month ?? right.ym;
      return leftKey.localeCompare(rightKey);
    })
    .slice(-3);
}

function pickConfidence(months: MonthlyCashflow[]): "high" | "mid" | "low" {
  if (months.length < 1) return "low";
  const partial = months.some((row) => typeof row.daysCovered === "number" && row.daysCovered < 20);
  if (partial) return "low";
  if (months.length < 3) return "mid";
  return "high";
}

export function buildDraftPatchFromCashflow(cashflow: MonthlyCashflow[]): BuildDraftPatchFromCashflowResult {
  const recent = toRecentMonths(cashflow);

  const medianIncome = medianRounded(recent.map((row) => (
    Number.isFinite(row.inflowKrw) ? Number(row.inflowKrw) : Math.max(0, Number(row.incomeKrw) || 0)
  )));
  const medianFixed = medianRounded(recent.map((row) => (
    Number.isFinite(row.fixedOutflowKrw) ? Number(row.fixedOutflowKrw) : 0
  )));
  const medianVariable = medianRounded(recent.map((row) => (
    Number.isFinite(row.variableOutflowKrw)
      ? Number(row.variableOutflowKrw)
      : Math.max(0, Math.abs(Number(row.expenseKrw) || 0) - (Number(row.fixedOutflowKrw) || 0))
  )));

  const suggestedMonthlyEssentialSpendKrw = Math.max(
    0,
    Math.round(medianFixed + (medianVariable * 0.3)),
  );
  const suggestedMonthlyDiscretionarySpendKrw = Math.max(
    0,
    Math.round(medianVariable * 0.7),
  );

  const draftPatch: CashflowDraftPatch = {
    suggestedMonthlyIncomeKrw: medianIncome,
    suggestedMonthlyEssentialSpendKrw,
    suggestedMonthlyDiscretionarySpendKrw,
    confidence: pickConfidence(recent),
    evidence: [
      {
        rule: "income = median(recent3.inflowKrw)",
        valueKrw: medianIncome,
      },
      {
        rule: "essential = median(recent3.fixedOutflowKrw) + median(recent3.variableOutflowKrw) * 0.3",
        valueKrw: suggestedMonthlyEssentialSpendKrw,
      },
      {
        rule: "discretionary = median(recent3.variableOutflowKrw) * 0.7",
        valueKrw: suggestedMonthlyDiscretionarySpendKrw,
      },
    ],
  };

  return {
    draftPatch,
    profilePatch: {
      monthlyIncomeNet: medianIncome,
      monthlyEssentialExpenses: suggestedMonthlyEssentialSpendKrw,
      monthlyDiscretionaryExpenses: suggestedMonthlyDiscretionarySpendKrw,
    },
  };
}
