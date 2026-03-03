import { type Account, type AccountTransaction, type TransferCandidate } from "../domain/types";

type IndexedTransaction = {
  index: number;
  tx: AccountTransaction;
};

export type DetectTransfersInput = {
  transactions: AccountTransaction[];
  accounts?: Account[];
};

export type DetectTransfersResult = {
  transactions: AccountTransaction[];
  candidates: TransferCandidate[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferKind(amountKrw: number): "income" | "expense" {
  return amountKrw > 0 ? "income" : "expense";
}

function compareIndexedTransactions(left: IndexedTransaction, right: IndexedTransaction): number {
  const leftTxnId = asString(left.tx.txnId);
  const rightTxnId = asString(right.tx.txnId);
  if (leftTxnId || rightTxnId) {
    const cmp = leftTxnId.localeCompare(rightTxnId);
    if (cmp !== 0) return cmp;
  }

  if (left.tx.date !== right.tx.date) {
    return left.tx.date.localeCompare(right.tx.date);
  }
  if (left.tx.amountKrw !== right.tx.amountKrw) {
    return left.tx.amountKrw - right.tx.amountKrw;
  }

  const leftAccount = asString(left.tx.accountId);
  const rightAccount = asString(right.tx.accountId);
  if (leftAccount !== rightAccount) {
    return leftAccount.localeCompare(rightAccount);
  }

  const leftRow = left.tx.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rightRow = right.tx.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftRow !== rightRow) {
    return leftRow - rightRow;
  }

  return left.index - right.index;
}

function buildTransferKey(tx: AccountTransaction): string {
  const absAmount = Math.abs(Math.round(tx.amountKrw));
  return `${tx.date}|${absAmount}`;
}

export function detectTransfers(input: DetectTransfersInput): DetectTransfersResult {
  const accountSet = new Set((input.accounts ?? []).map((account) => asString(account.id)).filter((id) => id.length > 0));
  const shouldValidateAccount = accountSet.size > 0;

  const annotated: AccountTransaction[] = input.transactions.map((tx) => ({
    ...tx,
    kind: tx.kind === "transfer" ? "transfer" : inferKind(tx.amountKrw),
    category: tx.category ?? "unknown",
  }));

  const positiveByKey = new Map<string, IndexedTransaction[]>();
  const negativeByKey = new Map<string, IndexedTransaction[]>();

  for (let index = 0; index < annotated.length; index += 1) {
    const tx = annotated[index];
    const accountId = asString(tx.accountId);
    if (!accountId) continue;
    if (shouldValidateAccount && !accountSet.has(accountId)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) continue;

    const rounded = Math.round(tx.amountKrw);
    if (rounded === 0) continue;

    const key = buildTransferKey(tx);
    const entry: IndexedTransaction = { index, tx };
    if (rounded > 0) {
      const rows = positiveByKey.get(key) ?? [];
      rows.push(entry);
      positiveByKey.set(key, rows);
    } else {
      const rows = negativeByKey.get(key) ?? [];
      rows.push(entry);
      negativeByKey.set(key, rows);
    }
  }

  const allKeys = [...new Set([...positiveByKey.keys(), ...negativeByKey.keys()])]
    .sort((a, b) => a.localeCompare(b));
  const candidates: TransferCandidate[] = [];

  for (const key of allKeys) {
    const positives = [...(positiveByKey.get(key) ?? [])].sort(compareIndexedTransactions);
    const negatives = [...(negativeByKey.get(key) ?? [])].sort(compareIndexedTransactions);
    if (positives.length < 1 || negatives.length < 1) continue;

    const usedPositiveIndexes = new Set<number>();

    for (const negative of negatives) {
      const fromAccountId = asString(negative.tx.accountId);
      if (!fromAccountId) continue;

      let matchedPositive: IndexedTransaction | null = null;
      for (const positive of positives) {
        if (usedPositiveIndexes.has(positive.index)) continue;
        const toAccountId = asString(positive.tx.accountId);
        if (!toAccountId || toAccountId === fromAccountId) continue;
        matchedPositive = positive;
        break;
      }

      if (!matchedPositive) continue;
      usedPositiveIndexes.add(matchedPositive.index);

      const outTxnId = asString(negative.tx.txnId);
      const inTxnId = asString(matchedPositive.tx.txnId);
      const reason = "same-date-opposite-amount-different-account";

      annotated[negative.index] = {
        ...annotated[negative.index],
        kind: "transfer",
        category: "unknown",
        transfer: {
          direction: "out",
          counterpartyAccountId: asString(matchedPositive.tx.accountId) || undefined,
          matchedTxnId: inTxnId || undefined,
          confidence: "high",
        },
        classificationReason: `rule:${reason}`,
        matchedRuleId: reason,
      };

      annotated[matchedPositive.index] = {
        ...annotated[matchedPositive.index],
        kind: "transfer",
        category: "unknown",
        transfer: {
          direction: "in",
          counterpartyAccountId: asString(negative.tx.accountId) || undefined,
          matchedTxnId: outTxnId || undefined,
          confidence: "high",
        },
        classificationReason: `rule:${reason}`,
        matchedRuleId: reason,
      };

      candidates.push({
        fromAccountId: asString(negative.tx.accountId) || undefined,
        toAccountId: asString(matchedPositive.tx.accountId) || undefined,
        txnId: outTxnId || inTxnId,
        reason,
      });
    }
  }

  return {
    transactions: annotated,
    candidates,
  };
}
