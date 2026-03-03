import { type AccountTransaction, type MonthlyCashflow } from "../domain/types";
import { classifyExpense } from "./classifyExpense";

type MonthAccumulator = {
  month: string;
  inflowKrw: number;
  outflowKrw: number;
  fixedOutflowKrw: number;
  variableOutflowKrw: number;
  netKrw: number;
  txCount: number;
  minDay: number;
  maxDay: number;
  unknownOutflowCount: number;
};

function parseMonth(value: string): { month: string; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = `${match[1]}-${match[2]}`;
  const day = Number(match[3]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function normalizeForClassify(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compareTransactions(left: AccountTransaction, right: AccountTransaction): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  const leftDesc = normalizeForClassify(left.description);
  const rightDesc = normalizeForClassify(right.description);
  if (leftDesc !== rightDesc) return leftDesc.localeCompare(rightDesc);
  const leftRow = left.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rightRow = right.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return leftRow - rightRow;
}

export function aggregateMonthlyCashflow(transactions: AccountTransaction[]): MonthlyCashflow[] {
  const grouped = new Map<string, MonthAccumulator>();
  const sorted = [...transactions].sort(compareTransactions);

  for (const tx of sorted) {
    const parsed = parseMonth(tx.date);
    if (!parsed) continue;

    const current = grouped.get(parsed.month) ?? {
      month: parsed.month,
      inflowKrw: 0,
      outflowKrw: 0,
      fixedOutflowKrw: 0,
      variableOutflowKrw: 0,
      netKrw: 0,
      txCount: 0,
      minDay: parsed.day,
      maxDay: parsed.day,
      unknownOutflowCount: 0,
    };

    const amount = Number.isFinite(tx.amountKrw) ? tx.amountKrw : 0;
    if (amount >= 0) {
      current.inflowKrw += amount;
    } else {
      const outflowAmount = Math.abs(amount);
      current.outflowKrw += outflowAmount;

      const classified = classifyExpense(normalizeForClassify(tx.description));
      if (classified === "fixed") {
        current.fixedOutflowKrw += outflowAmount;
      } else {
        current.variableOutflowKrw += outflowAmount;
        if (classified === "unknown") {
          current.unknownOutflowCount += 1;
        }
      }
    }

    current.netKrw += amount;
    current.txCount += 1;
    current.minDay = Math.min(current.minDay, parsed.day);
    current.maxDay = Math.max(current.maxDay, parsed.day);
    grouped.set(parsed.month, current);
  }

  return [...grouped.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((row) => {
      const notes: string[] = [];
      if (row.unknownOutflowCount > 0) {
        notes.push("unknown treated as variable");
      }

      return {
        month: row.month,
        inflowKrw: Math.round(row.inflowKrw),
        outflowKrw: Math.round(row.outflowKrw),
        netKrw: Math.round(row.netKrw),
        fixedOutflowKrw: Math.round(row.fixedOutflowKrw),
        variableOutflowKrw: Math.round(row.variableOutflowKrw),
        ym: row.month,
        incomeKrw: Math.round(row.inflowKrw),
        expenseKrw: -Math.round(row.outflowKrw),
        txCount: row.txCount,
        ...(row.maxDay >= row.minDay ? { daysCovered: (row.maxDay - row.minDay + 1) } : {}),
        ...(notes.length > 0 ? { notes } : {}),
      };
    });
}
