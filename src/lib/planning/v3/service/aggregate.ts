import { type AccountTransaction, type MonthlyCashflow } from "../domain/types";

function monthOf(date: string): `${number}-${number}` | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}` as `${number}-${number}`;
}

function compareTx(a: AccountTransaction, b: AccountTransaction): number {
  const ymA = monthOf(a.date) ?? "9999-99";
  const ymB = monthOf(b.date) ?? "9999-99";
  if (ymA !== ymB) return ymA.localeCompare(ymB);
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const rowA = a.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rowB = b.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return rowA - rowB;
}

export function aggregateMonthlyCashflow(transactions: AccountTransaction[]): MonthlyCashflow[] {
  const sorted = [...transactions].sort(compareTx);
  const grouped = new Map<string, { income: number; expense: number; txCount: number }>();

  for (const tx of sorted) {
    const ym = monthOf(tx.date);
    if (!ym) continue;

    const prev = grouped.get(ym) ?? { income: 0, expense: 0, txCount: 0 };
    if (tx.amount >= 0) {
      prev.income += tx.amount;
    } else {
      prev.expense += Math.abs(tx.amount);
    }
    prev.txCount += 1;
    grouped.set(ym, prev);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, row]) => ({
      ym: ym as `${number}-${number}`,
      income: Math.round(row.income),
      expense: Math.round(row.expense),
      net: Math.round(row.income - row.expense),
      txCount: row.txCount,
    }));
}
