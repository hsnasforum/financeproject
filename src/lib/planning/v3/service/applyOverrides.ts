import { type AccountTransaction, type TxnOverride } from "../domain/types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function applyTxnOverrides(
  transactions: AccountTransaction[],
  overridesByTxnId: Record<string, TxnOverride>,
): AccountTransaction[] {
  return transactions.map((tx) => {
    const txnId = asString(tx.txnId).toLowerCase();
    if (!txnId) return tx;

    const override = overridesByTxnId[txnId];
    if (!override) return tx;

    const nextKind = override.kind ?? tx.kind;
    const nextCategory = override.category ?? tx.category;

    return {
      ...tx,
      ...(nextKind ? { kind: nextKind } : {}),
      ...(nextCategory ? { category: nextCategory } : {}),
      ...((nextKind && nextKind !== "transfer") ? { transfer: undefined } : {}),
    };
  });
}
