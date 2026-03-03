import { type MonthlyAccountBalanceTimeline, type OpeningBalance, type TxnOverride } from "../domain/types";
import { type StoredTransaction } from "../domain/transactions";
import { applyTxnOverrides } from "./applyOverrides";
import { classifyTransactions } from "./classify";

export type ComputeMonthlyBalancesInput = {
  transactions: StoredTransaction[];
  openingBalancesByAccount: Record<string, OpeningBalance>;
  includeTransfers?: boolean;
  overridesByTxnId?: Record<string, TxnOverride>;
};

export type ComputeMonthlyBalancesResult = {
  data: MonthlyAccountBalanceTimeline[];
  warnings: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function asRoundedInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function sortTransactionsDeterministic(rows: StoredTransaction[]): StoredTransaction[] {
  return [...rows].sort((left, right) => {
    const leftAccount = asString(left.accountId);
    const rightAccount = asString(right.accountId);
    if (leftAccount !== rightAccount) return leftAccount.localeCompare(rightAccount);
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
    return asString(left.txnId).localeCompare(asString(right.txnId));
  });
}

export function computeMonthlyBalances(input: ComputeMonthlyBalancesInput): ComputeMonthlyBalancesResult {
  const includeTransfers = input.includeTransfers !== false;
  const sorted = sortTransactionsDeterministic(input.transactions);
  const classified = classifyTransactions({ transactions: sorted });
  const applied = input.overridesByTxnId
    ? applyTxnOverrides(classified, input.overridesByTxnId)
    : classified;

  const warnings = new Set<string>();
  const openingByAccount = new Map<string, OpeningBalance>();
  for (const [accountId, opening] of Object.entries(input.openingBalancesByAccount)) {
    if (!accountId || !opening) continue;
    openingByAccount.set(accountId, opening);
  }

  const netByAccountMonth = new Map<string, number>();
  const transferByAccountMonth = new Map<string, number>();

  for (const row of applied) {
    const accountId = asString(row.accountId) || "unassigned";
    if (!asString(row.accountId)) {
      warnings.add("accountId가 없는 거래는 unassigned 계좌로 집계됩니다.");
    }
    const ym = asString(row.date).slice(0, 7);
    if (!isYearMonth(ym)) continue;

    const key = `${accountId}|${ym}`;
    const amount = asRoundedInt(row.amountKrw);
    const kind = asString(row.kind);

    if (kind === "transfer") {
      transferByAccountMonth.set(key, (transferByAccountMonth.get(key) ?? 0) + amount);
    }
    if (!includeTransfers && kind === "transfer") {
      continue;
    }
    netByAccountMonth.set(key, (netByAccountMonth.get(key) ?? 0) + amount);
  }

  const monthsByAccount = new Map<string, string[]>();
  for (const key of netByAccountMonth.keys()) {
    const [accountId, ym] = key.split("|");
    if (!accountId || !ym) continue;
    const prev = monthsByAccount.get(accountId) ?? [];
    prev.push(ym);
    monthsByAccount.set(accountId, prev);
  }

  const rows: MonthlyAccountBalanceTimeline[] = [];
  for (const accountId of [...monthsByAccount.keys()].sort((a, b) => a.localeCompare(b))) {
    const months = [...new Set(monthsByAccount.get(accountId) ?? [])]
      .filter(isYearMonth)
      .sort((a, b) => a.localeCompare(b));
    if (months.length < 1) continue;

    if (!openingByAccount.has(accountId)) {
      warnings.add(`초기잔액이 없는 계좌가 있습니다: ${accountId}`);
    }

    let running = asRoundedInt(openingByAccount.get(accountId)?.amountKrw ?? 0);
    for (const ym of months) {
      const netChangeKrw = asRoundedInt(netByAccountMonth.get(`${accountId}|${ym}`) ?? 0);
      const openingKrw = running;
      const closingKrw = openingKrw + netChangeKrw;
      const transferKrw = asRoundedInt(transferByAccountMonth.get(`${accountId}|${ym}`) ?? 0);
      rows.push({
        ym,
        accountId,
        openingKrw,
        netChangeKrw,
        closingKrw,
        ...(transferKrw !== 0 ? { transferKrw } : {}),
      });
      running = closingKrw;
    }
  }

  return {
    data: rows.sort((left, right) => {
      if (left.ym !== right.ym) return left.ym.localeCompare(right.ym);
      return left.accountId.localeCompare(right.accountId);
    }),
    warnings: [...warnings.values()].sort((a, b) => a.localeCompare(b)),
  };
}
