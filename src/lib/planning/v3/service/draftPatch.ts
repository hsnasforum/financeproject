import { type MonthlyCashflow, type ProfileV2DraftPatch } from "../domain/types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildProfileDraftPatchFromCashflow(cashflows: MonthlyCashflow[]): ProfileV2DraftPatch {
  const monthsConsidered = cashflows.length;
  const incomeMedian = Math.round(median(cashflows.map((cf) => cf.income)));
  const expenseMedian = Math.round(median(cashflows.map((cf) => cf.expense)));
  const monthlyEssentialExpenses = Math.max(0, Math.round(expenseMedian * 0.7));
  const monthlyDiscretionaryExpenses = Math.max(0, expenseMedian - monthlyEssentialExpenses);

  return {
    monthlyIncomeNet: Math.max(0, incomeMedian),
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    assumptions: [
      "월 수입/지출은 월별 중앙값(median) 기준 추정치입니다.",
      "월 지출은 필수 70% / 재량 30% 고정 분할 가정을 사용합니다.",
      "초안은 저장/실행 전 검토용입니다.",
    ],
    monthsConsidered,
  };
}
