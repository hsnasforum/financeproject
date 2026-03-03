import { type AccountTransaction } from "../domain/types";
import { buildTxnId, isTxnId, normalizeDescriptionForTxnId } from "./txnId";

export type DedupeTransactionsResult = {
  transactions: AccountTransaction[];
  dedupedCount: number;
};

function withTxnId(tx: AccountTransaction): AccountTransaction {
  const txnId = isTxnId(tx.txnId)
    ? tx.txnId
    : buildTxnId({
        dateIso: tx.date,
        amountKrw: tx.amountKrw,
        descNorm: normalizeDescriptionForTxnId(tx.description),
      });

  return {
    ...tx,
    txnId,
  };
}

function compareTransactions(left: AccountTransaction, right: AccountTransaction): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  return (left.txnId ?? "").localeCompare(right.txnId ?? "");
}

export function dedupeTransactions(transactions: AccountTransaction[]): DedupeTransactionsResult {
  const seen = new Set<string>();
  const kept: AccountTransaction[] = [];

  for (const raw of transactions) {
    const tx = withTxnId(raw);
    const key = tx.txnId ?? "";
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(tx);
  }

  const sorted = kept.slice().sort(compareTransactions);
  return {
    transactions: sorted,
    dedupedCount: Math.max(0, transactions.length - kept.length),
  };
}
