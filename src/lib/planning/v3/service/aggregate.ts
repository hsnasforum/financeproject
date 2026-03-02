import { type AccountTransaction, type MonthlyCashflow } from "../domain/types";

function toMonthKey(isoDate: string): `${number}-${number}` | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}` as `${number}-${number}`;
}

function compareTransactions(a: AccountTransaction, b: AccountTransaction): number {
  const monthA = toMonthKey(a.postedAt) ?? "9999-99";
  const monthB = toMonthKey(b.postedAt) ?? "9999-99";
  if (monthA !== monthB) return monthA.localeCompare(monthB);

  if (a.postedAt !== b.postedAt) return a.postedAt.localeCompare(b.postedAt);
  return a.id.localeCompare(b.id);
}

export function aggregateMonthlyCashflow(transactions: AccountTransaction[]): MonthlyCashflow[] {
  const sorted = [...transactions].sort(compareTransactions);
  const monthly = new Map<string, { inflowKrw: number; outflowKrw: number }>();

  for (const tx of sorted) {
    const month = toMonthKey(tx.postedAt);
    if (!month) continue;

    const row = monthly.get(month) ?? { inflowKrw: 0, outflowKrw: 0 };
    if (tx.amountKrw >= 0) {
      row.inflowKrw += tx.amountKrw;
    } else {
      row.outflowKrw += Math.abs(tx.amountKrw);
    }
    monthly.set(month, row);
  }

  return [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => {
      const inflowKrw = Math.round(values.inflowKrw);
      const outflowKrw = Math.round(values.outflowKrw);
      return {
        month: month as `${number}-${number}`,
        inflowKrw,
        outflowKrw,
        netKrw: inflowKrw - outflowKrw,
      };
    });
}
