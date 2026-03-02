import { type MonthlyCashflow, type ProfileDraftPatch } from "../domain/types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildProfileDraftPatchFromCashflow(cashflows: MonthlyCashflow[]): ProfileDraftPatch {
  if (cashflows.length === 0) {
    return {
      assumptions: [
        "월별 현금흐름 데이터가 없어 중앙값 기반 초안을 계산하지 않았습니다.",
      ],
      notes: [
        "CSV를 확인한 뒤 다시 시도하세요.",
      ],
    };
  }

  const medianIncome = Math.round(median(cashflows.map((row) => row.inflowKrw)));
  const medianExpense = Math.round(median(cashflows.map((row) => row.outflowKrw)));
  const medianNet = Math.round(median(cashflows.map((row) => row.netKrw)));

  const monthlyEssentialExpenses = Math.max(0, Math.round(medianExpense * 0.7));
  const monthlyDiscretionaryExpenses = Math.max(0, medianExpense - monthlyEssentialExpenses);

  return {
    monthlyIncomeNet: Math.max(0, medianIncome),
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    assumptions: [
      "월 수입/지출/순현금흐름은 월별 중앙값(median)으로 계산합니다.",
      "월 지출 분할은 필수 70%, 변동 30% 고정 가정입니다.",
      "초안은 검토용이며 자동 저장/실행하지 않습니다.",
    ],
    notes: [
      `중앙값 순현금흐름: ${medianNet}원`,
    ],
  };
}
