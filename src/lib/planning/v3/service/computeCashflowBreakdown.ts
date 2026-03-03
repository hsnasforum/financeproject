import { type CategoryId, type MonthlyCashflowBreakdown } from "../domain/types";
import { type CategorizedTransactionRow } from "../domain/types";

const CATEGORY_IDS: CategoryId[] = [
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
];

function asMonth(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const ym = text.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(ym) ? ym : "";
}

function emptyByCategory(): Record<CategoryId, number> {
  return {
    income: 0,
    transfer: 0,
    fixed: 0,
    variable: 0,
    debt: 0,
    tax: 0,
    insurance: 0,
    housing: 0,
    food: 0,
    transport: 0,
    shopping: 0,
    health: 0,
    education: 0,
    etc: 0,
    unknown: 0,
  };
}

export function computeCashflowBreakdown(transactions: CategorizedTransactionRow[]): MonthlyCashflowBreakdown[] {
  const grouped = new Map<string, MonthlyCashflowBreakdown>();

  for (const tx of transactions) {
    const ym = asMonth(tx.date);
    if (!ym) continue;

    const amount = Math.round(Number(tx.amountKrw) || 0);
    const magnitude = Math.abs(amount);
    const isTransfer = tx.kind === "transfer" || tx.transfer !== undefined || tx.categoryId === "transfer";
    const categoryId = isTransfer
      ? "transfer"
      : (CATEGORY_IDS.includes(tx.categoryId) ? tx.categoryId : "unknown");
    const current = grouped.get(ym) ?? {
      ym,
      incomeKrw: 0,
      expenseKrw: 0,
      transferKrw: 0,
      byCategory: emptyByCategory(),
    };

    if (isTransfer) {
      current.transferKrw += magnitude;
    } else if (amount > 0) {
      current.incomeKrw += magnitude;
    } else {
      current.expenseKrw += magnitude;
    }
    current.byCategory[categoryId] += magnitude;
    grouped.set(ym, current);
  }

  return [...grouped.values()]
    .sort((left, right) => left.ym.localeCompare(right.ym))
    .map((row) => ({
      ym: row.ym,
      incomeKrw: row.incomeKrw,
      expenseKrw: row.expenseKrw,
      transferKrw: row.transferKrw,
      byCategory: CATEGORY_IDS.reduce((acc, categoryId) => {
        acc[categoryId] = Math.round(row.byCategory[categoryId] || 0);
        return acc;
      }, emptyByCategory()),
    }));
}
