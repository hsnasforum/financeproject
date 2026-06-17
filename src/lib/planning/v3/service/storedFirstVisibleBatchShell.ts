import {
  getStoredFirstDetailBatchCreatedAt,
  getStoredFirstLegacyDetailSummaryFallback,
  getStoredFirstLegacyDetailSummaryRetentionWindow,
} from "./storedFirstLegacyDetailFallback";
import {
  type StoredFirstBatchReadResult,
} from "../transactions/store";
import { getStoredFirstBatchBindingAccountId } from "./storedFirstVisibleRows";

export type StoredFirstVisibleBatchShell = {
  id: string;
  createdAt: string;
  kind: "csv";
  total: number;
  ok: number;
  failed: number;
  accountId?: string;
  accountHint?: string;
  fileName?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNonNegativeCount(value: unknown): number {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count) || count < 1) return 0;
  return count;
}

export function buildStoredFirstVisibleBatchShell(
  read: Pick<StoredFirstBatchReadResult, "batchId" | "meta" | "legacyBatch" | "policy" | "transactions">,
): StoredFirstVisibleBatchShell {
  const legacySummary = getStoredFirstLegacyDetailSummaryFallback(read);
  const retentionWindow = getStoredFirstLegacyDetailSummaryRetentionWindow(read);
  const storedImportMetadata = read.meta.importMetadata;
  const storedFirstAccountId = getStoredFirstBatchBindingAccountId(read);
  const legacyAccountHint = asString(legacySummary?.accountHint) || asString(legacySummary?.accountId);
  const failedCount = retentionWindow.retainsLegacyBatchFailed
    ? toNonNegativeCount(legacySummary?.failed)
    : toNonNegativeCount(storedImportMetadata?.diagnostics.skipped);
  const storedFileName = asString(storedImportMetadata?.provenance.fileName);
  const resolvedFileName = storedFileName || (
    retentionWindow.retainsLegacyBatchFileName ? asString(legacySummary?.fileName) : ""
  );
  const visibleOkCount = legacySummary ? read.transactions.length : read.meta.rowCount;
  const visibleTotalCount = legacySummary ? visibleOkCount + failedCount : read.meta.rowCount;

  return {
    id: read.batchId,
    createdAt: getStoredFirstDetailBatchCreatedAt(read),
    kind: "csv",
    // Detail shell keeps total/ok on the current visible-row contract.
    // Helper-owned legacy summary retention is intentionally limited to failed/fileName compat fields.
    total: visibleTotalCount,
    ok: visibleOkCount,
    failed: failedCount,
    ...(resolvedFileName ? { fileName: resolvedFileName } : {}),
    ...(storedFirstAccountId ? { accountId: storedFirstAccountId } : {}),
    ...(storedFirstAccountId
      ? { accountHint: storedFirstAccountId }
      : legacyAccountHint
        ? { accountHint: legacyAccountHint }
        : {}),
  };
}
