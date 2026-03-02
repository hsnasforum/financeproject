import { type AccountTransaction, type MonthlyCashflow, type ProfileDraftPatch } from "../domain/types";

function monthFromIsoDate(isoDate: string): `${number}-${number}` | null {
  if (isoDate.length < 7) return null;
  const month = isoDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return month as `${number}-${number}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildCashflowFromTransactions(transactions: AccountTransaction[]): MonthlyCashflow[] {
  const monthMap = new Map<string, { inflow: number; outflow: number }>();
  for (const tx of transactions) {
    const month = monthFromIsoDate(tx.postedAt);
    if (!month) continue;
    const row = monthMap.get(month) ?? { inflow: 0, outflow: 0 };
    if (tx.amountKrw >= 0) {
      row.inflow += tx.amountKrw;
    } else {
      row.outflow += Math.abs(tx.amountKrw);
    }
    monthMap.set(month, row);
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => {
      const inflowKrw = Math.round(values.inflow);
      const outflowKrw = Math.round(values.outflow);
      return {
        month: month as `${number}-${number}`,
        inflowKrw,
        outflowKrw,
        netKrw: inflowKrw - outflowKrw,
      };
    });
}

export function buildProfileDraftFromCashflow(cashflow: MonthlyCashflow[]): ProfileDraftPatch {
  if (cashflow.length === 0) {
    return {
      notes: [
        "거래 내역이 없어 프로필 초안을 생성하지 않았습니다.",
      ],
    };
  }

  const medianInflow = Math.round(median(cashflow.map((row) => Math.max(0, row.inflowKrw))));
  const medianOutflow = Math.round(median(cashflow.map((row) => Math.max(0, row.outflowKrw))));
  const monthlyEssentialExpenses = Math.max(0, Math.round(medianOutflow * 0.7));
  const monthlyDiscretionaryExpenses = Math.max(0, medianOutflow - monthlyEssentialExpenses);

  return {
    monthlyIncomeNet: Math.max(0, medianInflow),
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    notes: [
      "월 수입/지출은 월별 현금흐름의 중앙값(median) 기준으로 추정했습니다.",
      "지출 분해는 필수/재량 70/30 기본 가정을 사용했습니다.",
      "초안은 검토용이며 자동 저장되지 않습니다.",
    ],
  };
}
