import { getLatestCashflowDraftSummary } from "../planning/v3/store/draftStore";
import { type DraftSummaryForStress } from "./stressRunner";

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function readLatestDraftSummaryForStress(): Promise<DraftSummaryForStress | null> {
  const summary = await getLatestCashflowDraftSummary();
  if (!summary) return null;
  return {
    medianIncomeKrw: asNumber(summary.medianIncomeKrw),
    medianExpenseKrw: asNumber(summary.medianExpenseKrw),
    avgNetKrw: asNumber(summary.avgNetKrw),
  };
}
