import { listDrafts } from "../planning/v3/store/draftStore";
import { type DraftSummaryForStress } from "./stressRunner";

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function readLatestDraftSummaryForStress(): Promise<DraftSummaryForStress | null> {
  const drafts = await listDrafts();
  const latest = drafts[0];
  if (!latest?.summary) return null;
  return {
    medianIncomeKrw: asNumber(latest.summary.medianIncomeKrw),
    medianExpenseKrw: asNumber(latest.summary.medianExpenseKrw),
    avgNetKrw: asNumber(latest.summary.avgNetKrw),
  };
}
