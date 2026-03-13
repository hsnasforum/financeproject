import { type Account, type AccountTransaction, type MonthlyCashflow, type TxnOverride } from "../domain/types";
import { roundKrw } from "../../calc";
import { applyTxnOverrides } from "./applyOverrides";
import { classifyTransactions } from "./classify";

type AggregateMonthlyCashflowOptions = {
  includeTransfers?: boolean;
  accounts?: Account[];
  overridesByTxnId?: Record<string, TxnOverride>;
};

type MonthAccumulator = {
  month: string;
  incomeKrw: number;
  expenseKrw: number;
  transferInKrw: number;
  transferOutKrw: number;
  fixedOutflowKrw: number;
  variableOutflowKrw: number;
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

function normalizeDescription(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function compareTransactions(left: AccountTransaction, right: AccountTransaction): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  const leftDesc = normalizeDescription(left.description);
  const rightDesc = normalizeDescription(right.description);
  if (leftDesc !== rightDesc) return leftDesc.localeCompare(rightDesc);
  const leftAccount = (left.accountId ?? "").trim();
  const rightAccount = (right.accountId ?? "").trim();
  if (leftAccount !== rightAccount) return leftAccount.localeCompare(rightAccount);
  const leftTxnId = (left.txnId ?? "").trim();
  const rightTxnId = (right.txnId ?? "").trim();
  if (leftTxnId !== rightTxnId) return leftTxnId.localeCompare(rightTxnId);
  const leftRow = left.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rightRow = right.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return leftRow - rightRow;
}

export function aggregateMonthlyCashflow(
  transactions: AccountTransaction[],
  options: AggregateMonthlyCashflowOptions = {},
): MonthlyCashflow[] {
  const includeTransfers = options.includeTransfers === true;
  const grouped = new Map<string, MonthAccumulator>();
  const sorted = [...transactions].sort(compareTransactions);
  const classified = classifyTransactions({
    transactions: sorted,
    ...(options.accounts ? { accounts: options.accounts } : {}),
  });
  const overridden = options.overridesByTxnId
    ? applyTxnOverrides(classified, options.overridesByTxnId)
    : classified;

  for (const tx of overridden) {
    const parsed = parseMonth(tx.date);
    if (!parsed) continue;

    const current = grouped.get(parsed.month) ?? {
      month: parsed.month,
      incomeKrw: 0,
      expenseKrw: 0,
      transferInKrw: 0,
      transferOutKrw: 0,
      fixedOutflowKrw: 0,
      variableOutflowKrw: 0,
      txCount: 0,
      minDay: parsed.day,
      maxDay: parsed.day,
      unknownOutflowCount: 0,
    };

    const amount = Number.isFinite(tx.amountKrw) ? roundKrw(tx.amountKrw) : 0;
    const kind = tx.kind ?? (amount > 0 ? "income" : "expense");

    if (kind === "transfer") {
      if (amount >= 0) current.transferInKrw += amount;
      else current.transferOutKrw += amount;
    } else if (kind === "income") {
      current.incomeKrw += amount;
    } else {
      current.expenseKrw += amount;
      const outflowAmount = Math.abs(amount);
      if (tx.category === "fixed") {
        current.fixedOutflowKrw += outflowAmount;
      } else if (tx.category === "variable") {
        current.variableOutflowKrw += outflowAmount;
      } else {
        current.variableOutflowKrw += outflowAmount;
        current.unknownOutflowCount += 1;
      }
    }

    current.txCount += 1;
    current.minDay = Math.min(current.minDay, parsed.day);
    current.maxDay = Math.max(current.maxDay, parsed.day);
    grouped.set(parsed.month, current);
  }

  return [...grouped.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((row) => {
      const transferNetKrw = row.transferInKrw + row.transferOutKrw;
      const netWithoutTransfers = row.incomeKrw + row.expenseKrw;
      const netWithTransfers = netWithoutTransfers + transferNetKrw;
      const notes: string[] = [];

      if (row.unknownOutflowCount > 0) {
        notes.push("unknown treated as variable");
      }

      return {
        month: row.month,
        inflowKrw: roundKrw(row.incomeKrw),
        outflowKrw: roundKrw(Math.abs(row.expenseKrw)),
        netKrw: roundKrw(includeTransfers ? netWithTransfers : netWithoutTransfers),
        fixedOutflowKrw: roundKrw(row.fixedOutflowKrw),
        variableOutflowKrw: roundKrw(row.variableOutflowKrw),
        transferNetKrw: roundKrw(transferNetKrw),
        ...(row.transferInKrw !== 0 ? { transferInKrw: roundKrw(row.transferInKrw) } : {}),
        ...(row.transferOutKrw !== 0 ? { transferOutKrw: roundKrw(row.transferOutKrw) } : {}),
        totals: {
          incomeKrw: roundKrw(row.incomeKrw),
          expenseKrw: roundKrw(row.expenseKrw),
          transferInKrw: roundKrw(row.transferInKrw),
          transferOutKrw: roundKrw(row.transferOutKrw),
          netKrw: roundKrw(netWithTransfers),
        },
        ...(includeTransfers ? { includeTransfers: true } : {}),
        ym: row.month,
        incomeKrw: roundKrw(row.incomeKrw),
        expenseKrw: roundKrw(row.expenseKrw),
        txCount: row.txCount,
        ...(row.maxDay >= row.minDay ? { daysCovered: (row.maxDay - row.minDay + 1) } : {}),
        ...(notes.length > 0 ? { notes } : {}),
      };
    });
}
