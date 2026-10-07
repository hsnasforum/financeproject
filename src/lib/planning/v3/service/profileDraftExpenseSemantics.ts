import { roundKrw } from "../../calc";
import { type DraftProfileEvidence } from "../domain/draftTypes";
import { type DraftPreflightError } from "../domain/preflightTypes";

type ExpenseEvidence = Partial<Pick<DraftProfileEvidence, "ymStats">>;

export function medianNonDebtFixedExpense(rows: DraftProfileEvidence["ymStats"]): number {
  const values = rows.map((row) => row.fixedExpenseKrw - row.debtExpenseKrw).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.trunc(values.length / 2);
  return roundKrw(values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
}

export function profileDraftExpenseError(draftPatch: unknown, evidence?: ExpenseEvidence): DraftPreflightError | undefined {
  const rows = evidence?.ymStats;
  // Legacy partial evidence cannot establish the old calculation; preserve its
  // existing validation contract rather than guessing or rewriting stored data.
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every((row) => row
    && Number.isFinite(row.fixedExpenseKrw) && Number.isFinite(row.debtExpenseKrw)
    && row.debtExpenseKrw >= 0 && row.fixedExpenseKrw >= row.debtExpenseKrw)) return undefined;
  if (!rows.some((row) => row.debtExpenseKrw > 0)) return undefined;
  if (!draftPatch || typeof draftPatch !== "object" || Array.isArray(draftPatch)) return undefined;
  const essential = (draftPatch as Record<string, unknown>).monthlyEssentialExpenses;
  if (essential === undefined || essential === null || essential === "") return undefined;
  if (Number(essential) === medianNonDebtFixedExpense(rows)) return undefined;
  return {
    path: "/monthlyEssentialExpenses",
    message: "초안의 생활지출이 월별 부채상환 제외 금액과 다릅니다. 원래 거래 자료에서 새 초안을 생성한 뒤 다시 확인해 주세요.",
  };
}
