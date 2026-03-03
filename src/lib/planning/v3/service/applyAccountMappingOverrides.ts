import { type AccountTransaction, type AccountMappingOverride } from "../domain/types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountId(value: unknown): string {
  const accountId = asString(value);
  return accountId || "unassigned";
}

export function applyAccountMappingOverrides(
  transactions: AccountTransaction[],
  overridesByTxnId: Record<string, AccountMappingOverride>,
): AccountTransaction[] {
  return transactions.map((tx) => {
    const txnId = asString(tx.txnId).toLowerCase();
    const override = txnId ? overridesByTxnId[txnId] : undefined;
    const accountId = normalizeAccountId(override?.accountId ?? tx.accountId);
    return {
      ...tx,
      accountId,
    };
  });
}
