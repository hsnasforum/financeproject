import { type StoredTransaction } from "../domain/transactions";
import { type StoredFirstBatchReadResult } from "../transactions/store";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getStoredFirstBatchBindingAccountId(
  read: Pick<StoredFirstBatchReadResult, "meta" | "legacyBatch">,
): string | null {
  // User-facing readers intentionally resolve batch/account binding stored-first.
  // Same-id legacy coexistence can still fall back to legacy, but if stored meta
  // already exposes a primary account binding, that visible value wins first.
  const metaAccountId = asString(read.meta.accounts?.[0]?.id);
  if (metaAccountId) return metaAccountId;
  const legacyAccountId = asString(read.legacyBatch?.accountId);
  return legacyAccountId || null;
}

function applyStoredFirstProjectionAccountBinding(read: StoredFirstBatchReadResult): StoredTransaction[] {
  const accountId = getStoredFirstBatchBindingAccountId(read);
  if (!accountId) return read.transactions;

  const shouldNormalizeLegacyRows = read.policy.transactionSource === "legacy" && read.policy.metadataSource === "stored";
  let changed = false;
  const bound = read.transactions.map((row) => {
    const currentAccountId = asString(row.accountId);
    if (!currentAccountId) {
      changed = true;
      return {
        ...row,
        accountId,
      };
    }
    if (shouldNormalizeLegacyRows && currentAccountId !== accountId) {
      changed = true;
      return {
        ...row,
        accountId,
      };
    }
    return row;
  });

  return changed ? bound : read.transactions;
}

export type StoredFirstBatchDetailProjectionRows = {
  rawRows: StoredTransaction[];
  derivedRows: StoredTransaction[];
};

export function getStoredFirstBatchDetailProjectionRows(
  read: StoredFirstBatchReadResult,
): StoredFirstBatchDetailProjectionRows {
  // `data` keeps the raw stored/legacy snapshot, while user-facing detail projections
  // read stored-first bound rows so batch-level account binding is visible without rewriting raw payloads.
  return {
    rawRows: read.transactions,
    derivedRows: applyStoredFirstProjectionAccountBinding(read),
  };
}

export function getStoredFirstBatchSummaryProjectionRows(
  read: StoredFirstBatchReadResult,
): StoredTransaction[] {
  // Summary/categorized/transfers surfaces have no raw row payload, so same-id coexistence
  // reads the derived stored-first binding view directly instead of exposing legacy row accountIds.
  return applyStoredFirstProjectionAccountBinding(read);
}
