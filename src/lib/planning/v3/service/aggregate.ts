import { type AccountTransaction, type MonthlyCashflow } from "../domain/types";

function monthOf(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function compareDescription(a: string | undefined, b: string | undefined): number {
  const aMissing = !a || a.trim().length === 0;
  const bMissing = !b || b.trim().length === 0;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a.localeCompare(b);
}

function compareTx(a: AccountTransaction, b: AccountTransaction): number {
  const ymA = monthOf(a.date) ?? "9999-99";
  const ymB = monthOf(b.date) ?? "9999-99";
  if (ymA !== ymB) return ymA.localeCompare(ymB);
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.amountKrw !== b.amountKrw) return a.amountKrw - b.amountKrw;
  const descriptionCompare = compareDescription(a.description, b.description);
  if (descriptionCompare !== 0) return descriptionCompare;
  const rowA = a.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rowB = b.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return rowA - rowB;
}

export function aggregateMonthlyCashflow(transactions: AccountTransaction[]): MonthlyCashflow[] {
  const sorted = [...transactions].sort(compareTx);
  const grouped = new Map<string, { incomeKrw: number; expenseKrw: number; txCount: number }>();

  for (const tx of sorted) {
    const ym = monthOf(tx.date);
    if (!ym) continue;

    const prev = grouped.get(ym) ?? { incomeKrw: 0, expenseKrw: 0, txCount: 0 };
    if (tx.amountKrw > 0) {
      prev.incomeKrw += tx.amountKrw;
    } else {
      prev.expenseKrw += tx.amountKrw;
    }
    prev.txCount += 1;
    grouped.set(ym, prev);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, row]) => ({
      ym,
      incomeKrw: Math.round(row.incomeKrw),
      expenseKrw: Math.round(row.expenseKrw),
      netKrw: Math.round(row.incomeKrw + row.expenseKrw),
      txCount: row.txCount,
    }));
}
