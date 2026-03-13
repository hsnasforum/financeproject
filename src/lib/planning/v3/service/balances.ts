import { type Account, type AccountTransaction, type MonthlyAccountBalance, type TxnOverride } from "../domain/types";
import { roundKrw } from "../../calc";
import { applyTxnOverrides } from "./applyOverrides";
import { classifyTransactions } from "./classify";

export type ComputeMonthlyBalancesInput = {
  accounts: Account[];
  transactions: AccountTransaction[];
  includeTransfers?: boolean;
  overridesByTxnId?: Record<string, TxnOverride>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compareTransactions(left: AccountTransaction, right: AccountTransaction): number {
  const leftAccount = asString(left.accountId);
  const rightAccount = asString(right.accountId);
  if (leftAccount !== rightAccount) return leftAccount.localeCompare(rightAccount);

  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;

  const leftTxnId = asString(left.txnId);
  const rightTxnId = asString(right.txnId);
  if (leftTxnId !== rightTxnId) return leftTxnId.localeCompare(rightTxnId);

  const leftRow = left.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rightRow = right.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return leftRow - rightRow;
}

function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function computeMonthlyBalances(input: ComputeMonthlyBalancesInput): MonthlyAccountBalance[] {
  const includeTransfers = input.includeTransfers === true;
  const sortedTransactions = [...input.transactions].sort(compareTransactions);
  const classified = classifyTransactions({
    accounts: input.accounts,
    transactions: sortedTransactions,
  });
  const overridden = input.overridesByTxnId
    ? applyTxnOverrides(classified, input.overridesByTxnId)
    : classified;

  const netByAccountMonth = new Map<string, number>();
  for (const tx of overridden) {
    const accountId = asString(tx.accountId);
    if (!accountId) continue;

    const ym = asString(tx.date).slice(0, 7);
    if (!isYearMonth(ym)) continue;
    if (!includeTransfers && tx.kind === "transfer") continue;

    const key = `${accountId}|${ym}`;
    const current = netByAccountMonth.get(key) ?? 0;
    netByAccountMonth.set(key, current + roundKrw(tx.amountKrw));
  }

  const monthsByAccount = new Map<string, string[]>();
  for (const key of netByAccountMonth.keys()) {
    const [accountId, ym] = key.split("|");
    if (!accountId || !ym) continue;
    const current = monthsByAccount.get(accountId) ?? [];
    current.push(ym);
    monthsByAccount.set(accountId, current);
  }

  const startingByAccount = new Map<string, number | undefined>();
  for (const account of input.accounts) {
    const balance = Number.isInteger(account.startingBalanceKrw)
      ? Number(account.startingBalanceKrw)
      : undefined;
    startingByAccount.set(account.id, balance);
  }

  const accountIds = [...monthsByAccount.keys()].sort((a, b) => a.localeCompare(b));
  const rows: MonthlyAccountBalance[] = [];

  for (const accountId of accountIds) {
    const months = [...new Set(monthsByAccount.get(accountId) ?? [])]
      .filter(isYearMonth)
      .sort((a, b) => a.localeCompare(b));
    if (months.length < 1) continue;

    const startingBalanceKrw = startingByAccount.get(accountId);
    const hasStartingBalance = Number.isInteger(startingBalanceKrw);
    let running = hasStartingBalance ? Number(startingBalanceKrw) : 0;

    for (const ym of months) {
      const netKrw = roundKrw(netByAccountMonth.get(`${accountId}|${ym}`) ?? 0);
      if (hasStartingBalance) {
        running += netKrw;
      }

      rows.push({
        ym,
        accountId,
        ...(hasStartingBalance ? { startingBalanceKrw: Number(startingBalanceKrw) } : {}),
        netKrw,
        ...(hasStartingBalance ? { endBalanceKrw: running } : {}),
        hasStartingBalance,
      });
    }
  }

  return rows.sort((left, right) => {
    const accountCmp = left.accountId.localeCompare(right.accountId);
    if (accountCmp !== 0) return accountCmp;
    return left.ym.localeCompare(right.ym);
  });
}
