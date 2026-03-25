import { type AccountTransaction } from "@/lib/planning/v3/domain/types";
import { type ImportBatchMeta, type StoredTransaction, type V3ImportBatch } from "@/lib/planning/v3/domain/transactions";
import { applyTxnOverrides } from "@/lib/planning/v3/service/applyOverrides";
import { classifyTransactions } from "@/lib/planning/v3/service/classify";
import { ImportCsvToBatchInputError, importCsvToBatch } from "@/lib/planning/v3/service/importCsvToBatch";
import {
  appendBatchFromCsv,
  buildSameIdCoexistenceUserFacingInternalFailure,
  listBatches as listLegacyBatches,
  mergeBatches,
  readBatch,
  readBatchTransactions,
  type SameIdCoexistenceUserFacingInternalFailure,
  type SameIdCoexistenceWritesCompletedSequenceResult,
  TransactionStoreInputError,
} from "@/lib/planning/v3/service/transactionStore";
import { buildTxnId, normalizeDescriptionForTxnId } from "@/lib/planning/v3/service/txnId";
import {
  getBatchMeta,
  getBatchTransactions,
  getBatchTransactionsFileModifiedAt,
  listBatchTransactionFileIds,
  listBatches as listStoredBatches,
} from "@/lib/planning/v3/store/batchesStore";
import { getBatchTxnOverrides } from "@/lib/planning/v3/store/txnOverridesStore";

export { applyTxnOverrides };
export { classifyTransactions };
export { ImportCsvToBatchInputError, importCsvToBatch };
export {
  appendBatchFromCsv,
  listLegacyBatches,
  mergeBatches,
  readBatch,
  readBatchTransactions,
  TransactionStoreInputError,
};
export { buildTxnId, normalizeDescriptionForTxnId };
export { getBatchMeta, getBatchTransactions, getBatchTransactionsFileModifiedAt, listBatchTransactionFileIds, listStoredBatches };
// User-facing override facade: batch-scoped owner only.
export { getBatchTxnOverrides };

export type StoredFirstBatchSnapshotPolicy = {
  mode: "stored-complete" | "stored-partial" | "hybrid-legacy-transactions" | "legacy-only";
  transactionSource: "stored" | "legacy";
  metadataSource: "stored" | "legacy-derived" | "synthetic";
  usesLegacyTransactions: boolean;
  usesLegacyMetadata: boolean;
  needsLegacyDetailFallback: boolean;
};

export type StoredFirstLegacyBatchFallback = Pick<
  V3ImportBatch,
  "id" | "createdAt" | "fileName" | "accountId" | "accountHint" | "total" | "ok" | "failed"
>;

export type StoredFirstLegacyDetailFallbackClass =
  | "pure-legacy"
  | "old-stored-meta-importMetadata-gap"
  | "hybrid-legacy-summary-retained";

export type StoredFirstLegacyDetailSummaryRetentionWindow = {
  fallbackClass: StoredFirstLegacyDetailFallbackClass | null;
  retainsLegacyBatchFailed: boolean;
  retainsLegacyStatsFailedViaBatchAlias: boolean;
  retainsLegacyBatchFileName: boolean;
};

export type HistoricalNoMarkerProvenanceEvidenceSubset =
  | "marker-missing-but-otherwise-stable"
  | "origin-fundamentally-unresolved";

export type HistoricalNoMarkerProvenanceEvidence = {
  subset: HistoricalNoMarkerProvenanceEvidenceSubset;
  fallbackClass: StoredFirstLegacyDetailFallbackClass | null;
  importMetadataState: "missing" | "present";
  fileNameProvidedState: "missing";
  storedProvenanceFileNameState: "present" | "blank";
  legacyFileNameState: "present" | "blank";
};

export type PublicImportBatchMeta = Omit<ImportBatchMeta, "createdAt" | "importMetadata"> & {
  createdAt?: string;
};

export type StoredFirstBatchReadResult = {
  source: "stored" | "legacy";
  batchId: string;
  createdAt?: string;
  meta: ImportBatchMeta;
  transactions: StoredTransaction[];
  policy: StoredFirstBatchSnapshotPolicy;
  legacyBatch?: StoredFirstLegacyBatchFallback;
};

export type StoredBatchListCandidate = {
  meta: ImportBatchMeta;
  metadataSource: "stored" | "synthetic";
};

export type StoredBatchCommandSurfaceState = "stored-meta" | "synthetic-stored-only" | "missing";
export type StoredBatchAccountCommandSurfaceState =
  | "stored-meta-only"
  | "stored-meta-legacy-coexistence"
  | "synthetic-stored-only"
  | "legacy-only"
  | "missing";
export type StoredBatchDeleteSurfaceState =
  | "stored-meta"
  | "stored-meta-legacy-coexistence"
  | "synthetic-stored-only"
  | "synthetic-stored-only-legacy-collision"
  | "legacy-only"
  | "missing";

export type SameIdCoexistencePostWriteVisibleBindingVerificationStatus =
  | "visible-binding-matched"
  | "visible-binding-drifted"
  | "visible-binding-missing";

export type SameIdCoexistencePostWriteVisibleBindingVerificationResult = {
  batchId: string;
  targetAccountId: string;
  currentVisibleAccountId: string | null;
  status: SameIdCoexistencePostWriteVisibleBindingVerificationStatus;
};

export type SameIdCoexistencePostWriteSuccessSplitResult =
  | {
      status: "verified-success-candidate";
      sequence: SameIdCoexistenceWritesCompletedSequenceResult;
      verification: SameIdCoexistencePostWriteVisibleBindingVerificationResult;
    }
  | {
      status: "visible-verification-failed";
      sequence: SameIdCoexistenceWritesCompletedSequenceResult;
      verification: SameIdCoexistencePostWriteVisibleBindingVerificationResult;
      userFacingFailure: SameIdCoexistenceUserFacingInternalFailure;
    };

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

export type SameIdCoexistenceVerifiedSuccessResponseShell = {
  batch: StoredFirstVisibleBatchShell;
  updatedTransactionCount: number;
};

const SAFE_SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNonNegativeCount(value: unknown): number {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count) || count < 1) return 0;
  return count;
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

export function applyStoredFirstBatchAccountBinding(read: StoredFirstBatchReadResult): StoredTransaction[] {
  const accountId = getStoredFirstBatchBindingAccountId(read);
  if (!accountId) return read.transactions;

  // Balances/draft-style readers reuse the same stored-first visible binding view.
  // This keeps same-id coexistence on the stored meta account without rewriting raw persistence.
  let changed = false;
  const bound = read.transactions.map((row) => {
    if (asString(row.accountId)) return row;
    changed = true;
    return {
      ...row,
      accountId,
    };
  });

  return changed ? bound : read.transactions;
}

export function applyStoredFirstDetailProjectionAccountBinding(
  read: StoredFirstBatchReadResult,
): StoredTransaction[] {
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
    derivedRows: applyStoredFirstDetailProjectionAccountBinding(read),
  };
}

export function getStoredFirstBatchSummaryProjectionRows(
  read: StoredFirstBatchReadResult,
): StoredTransaction[] {
  // Summary/categorized/transfers surfaces have no raw row payload, so same-id coexistence
  // reads the derived stored-first binding view directly instead of exposing legacy row accountIds.
  return applyStoredFirstDetailProjectionAccountBinding(read);
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

export async function verifySameIdCoexistencePostWriteVisibleBinding(input: {
  batchId: string;
  targetAccountId: string;
}): Promise<SameIdCoexistencePostWriteVisibleBindingVerificationResult> {
  const batchId = asString(input.batchId);
  const targetAccountId = asString(input.targetAccountId);
  const loaded = await loadStoredFirstBatchTransactions(batchId);
  const currentVisibleAccountId = loaded ? getStoredFirstBatchBindingAccountId(loaded) : null;

  if (!currentVisibleAccountId) {
    return {
      batchId,
      targetAccountId,
      currentVisibleAccountId: null,
      status: "visible-binding-missing",
    };
  }

  if (currentVisibleAccountId === targetAccountId) {
    return {
      batchId,
      targetAccountId,
      currentVisibleAccountId,
      status: "visible-binding-matched",
    };
  }

  return {
    batchId,
    targetAccountId,
    currentVisibleAccountId,
    status: "visible-binding-drifted",
  };
}

export async function runSameIdCoexistencePostWriteSuccessSplitWorker(
  input: SameIdCoexistenceWritesCompletedSequenceResult,
): Promise<SameIdCoexistencePostWriteSuccessSplitResult> {
  const verification = await verifySameIdCoexistencePostWriteVisibleBinding({
    batchId: input.batchId,
    targetAccountId: input.targetAccountId,
  });

  if (verification.status === "visible-binding-matched") {
    return {
      status: "verified-success-candidate",
      sequence: input,
      verification,
    };
  }

  return {
    status: "visible-verification-failed",
    sequence: input,
    verification,
    userFacingFailure: buildSameIdCoexistenceUserFacingInternalFailure(),
  };
}

export async function buildSameIdCoexistenceVerifiedSuccessResponseShell(
  input: Extract<SameIdCoexistencePostWriteSuccessSplitResult, { status: "verified-success-candidate" }>,
): Promise<SameIdCoexistenceVerifiedSuccessResponseShell> {
  const reloaded = await loadStoredFirstBatchTransactions(input.sequence.batchId);
  if (!reloaded) {
    throw new TransactionStoreInputError("stored-first batch not found", [
      { field: "batchId", message: "배치를 찾을 수 없습니다." },
    ]);
  }

  return {
    batch: buildStoredFirstVisibleBatchShell(reloaded),
    // This stays legacy-side changed row count only.
    // Same-id visible binding can still verify successfully even when the count is 0.
    updatedTransactionCount: input.sequence.trace.legacyWrite.updatedTransactionCount,
  };
}

export function getStoredFirstPublicCreatedAt(input: {
  createdAt?: string;
  policy: Pick<StoredFirstBatchSnapshotPolicy, "metadataSource">;
}): string | undefined {
  if (!shouldExposeStoredFirstPublicCreatedAt(input)) return undefined;
  return asString(input.createdAt);
}

export function getStoredFirstPublicCreatedAtString(input: {
  createdAt?: string;
  policy: Pick<StoredFirstBatchSnapshotPolicy, "metadataSource">;
}): string {
  // Some legacy/user-facing list surfaces still keep a string createdAt contract.
  // Those routes preserve the key and downgrade hidden public createdAt to "".
  return asString(getStoredFirstPublicCreatedAt(input));
}

export function toStoredFirstPublicImportBatchMeta(input: {
  meta: ImportBatchMeta;
  metadataSource: StoredFirstBatchSnapshotPolicy["metadataSource"];
}): PublicImportBatchMeta {
  const publicMeta = { ...input.meta } as ImportBatchMeta;
  delete publicMeta.importMetadata;
  const createdAt = getStoredFirstPublicCreatedAt({
    createdAt: input.meta.createdAt,
    policy: { metadataSource: input.metadataSource },
  });
  if (createdAt) {
    return {
      ...publicMeta,
      createdAt,
    };
  }
  // Summary/batch-center style surfaces can omit hidden public createdAt entirely.
  const rest: PublicImportBatchMeta = { ...publicMeta };
  delete rest.createdAt;
  return rest;
}

export function shouldExposeStoredFirstPublicCreatedAt(input: {
  createdAt?: string;
  policy: Pick<StoredFirstBatchSnapshotPolicy, "metadataSource">;
}): boolean {
  return Boolean(asString(input.createdAt)) && input.policy.metadataSource !== "synthetic";
}

export function getStoredFirstLegacyDetailFallbackClass(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy">,
): StoredFirstLegacyDetailFallbackClass | null {
  if (!read.policy.needsLegacyDetailFallback) return null;
  if (read.policy.mode === "legacy-only") return "pure-legacy";
  if (
    read.policy.mode === "hybrid-legacy-transactions"
    && read.policy.metadataSource === "stored"
    && !read.meta.importMetadata
  ) {
    return "old-stored-meta-importMetadata-gap";
  }
  return "hybrid-legacy-summary-retained";
}

export function isOldStoredMetaImportMetadataGap(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy">,
): boolean {
  return getStoredFirstLegacyDetailFallbackClass(read) === "old-stored-meta-importMetadata-gap";
}

export function classifyHistoricalNoMarkerProvenanceEvidence(
  read: Pick<StoredFirstBatchReadResult, "meta" | "legacyBatch" | "policy">,
): HistoricalNoMarkerProvenanceEvidence | null {
  const fallbackClass = getStoredFirstLegacyDetailFallbackClass(read);
  const legacyFileName = asString(read.legacyBatch?.fileName);
  const legacyFileNameState = legacyFileName ? "present" : "blank";
  const importMetadata = read.meta.importMetadata;

  if (!importMetadata) {
    if (fallbackClass !== "old-stored-meta-importMetadata-gap") return null;
    return {
      subset: "origin-fundamentally-unresolved",
      fallbackClass,
      importMetadataState: "missing",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "blank",
      legacyFileNameState,
    };
  }

  if (typeof importMetadata.provenance.fileNameProvided === "boolean") return null;

  const storedFileName = asString(importMetadata.provenance.fileName);
  return {
    subset: storedFileName
      ? "marker-missing-but-otherwise-stable"
      : "origin-fundamentally-unresolved",
    fallbackClass,
    importMetadataState: "present",
    fileNameProvidedState: "missing",
    storedProvenanceFileNameState: storedFileName ? "present" : "blank",
    legacyFileNameState,
  };
}

export function hasHistoricalNoMarkerVisibleFileNameCompatBridge(
  read: Pick<StoredFirstBatchReadResult, "meta" | "legacyBatch" | "policy">,
): boolean {
  const evidence = classifyHistoricalNoMarkerProvenanceEvidence(read);
  if (!evidence) return false;
  if (evidence.subset !== "origin-fundamentally-unresolved") return false;
  return evidence.legacyFileNameState === "present";
}

export function hasStoredFirstReadOnlySourceBindingCandidate(
  read: Pick<StoredFirstBatchReadResult, "meta">,
): boolean {
  const importMetadata = read.meta.importMetadata;
  if (!importMetadata?.sourceBinding) return false;

  const artifactSha256 = asString(importMetadata.sourceBinding.artifactSha256).toLowerCase();
  const attestedFileName = asString(importMetadata.sourceBinding.attestedFileName);
  const storedProvenanceFileName = asString(importMetadata.provenance.fileName);

  if (!SAFE_SHA256_HEX_PATTERN.test(artifactSha256)) return false;
  if (!attestedFileName) return false;
  if (importMetadata.sourceBinding.originKind !== "writer-handoff") return false;
  return storedProvenanceFileName === attestedFileName;
}

export function hasHybridRetainedVisibleFileNameCompatBridge(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): boolean {
  if (getStoredFirstLegacyDetailFallbackClass(read) !== "hybrid-legacy-summary-retained") return false;
  const storedFileName = asString(read.meta.importMetadata?.provenance.fileName);
  if (storedFileName) return false;
  return Boolean(asString(read.legacyBatch?.fileName));
}

export function getStoredFirstLegacyDetailSummaryRetentionWindow(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): StoredFirstLegacyDetailSummaryRetentionWindow {
  const fallbackClass = getStoredFirstLegacyDetailFallbackClass(read);
  const retainsLegacyBatchFailed =
    fallbackClass === "pure-legacy" || fallbackClass === "old-stored-meta-importMetadata-gap";

  return {
    fallbackClass,
    retainsLegacyBatchFailed,
    retainsLegacyStatsFailedViaBatchAlias: retainsLegacyBatchFailed,
    retainsLegacyBatchFileName: retainsLegacyBatchFailed || hasHybridRetainedVisibleFileNameCompatBridge(read),
  };
}

export function getStoredFirstLegacyDetailSummaryFallback(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): StoredFirstLegacyBatchFallback | null {
  // Detail route only uses this fallback for summary/count-style fields.
  // Row-derived projections continue to read raw or recovered transactions directly.
  if (!getStoredFirstLegacyDetailSummaryRetentionWindow(read).fallbackClass) return null;
  return read.legacyBatch ?? null;
}

export function getStoredFirstDetailBatchCreatedAt(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy" | "legacyBatch">,
): string {
  const shouldExposePublicCreatedAt = shouldExposeStoredFirstPublicCreatedAt({
    createdAt: read.meta.createdAt,
    policy: read.policy,
  });
  if (shouldExposePublicCreatedAt) return asString(read.meta.createdAt);
  // Detail route and summary route share the same public createdAt boundary.
  // Detail keeps a string contract, so it downgrades hidden createdAt to legacy fallback or "".
  return asString(getStoredFirstLegacyDetailSummaryFallback(read)?.createdAt);
}

export function toStoredFirstPublicMeta(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy">,
): PublicImportBatchMeta {
  return toStoredFirstPublicImportBatchMeta({
    meta: read.meta,
    metadataSource: read.policy.metadataSource,
  });
}

function normalizeLegacyTransactions(batchId: string, rows: AccountTransaction[]): StoredTransaction[] {
  return rows
    .map((row) => {
      const txnId = asString(row.txnId).toLowerCase() || buildTxnId({
        dateIso: row.date,
        amountKrw: row.amountKrw,
        descNorm: normalizeDescriptionForTxnId(row.description),
        ...(asString(row.accountId) ? { accountId: asString(row.accountId) } : {}),
      });
      return {
        ...row,
        txnId,
        batchId,
      };
    })
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
      return left.txnId.localeCompare(right.txnId);
    });
}

function hasCompleteStoredSnapshot(meta: ImportBatchMeta | null, transactions: StoredTransaction[]): boolean {
  if (!meta) return false;
  if (meta.rowCount === 0) return transactions.length === 0;
  return transactions.length >= meta.rowCount;
}

function collectBatchAccounts(
  transactions: StoredTransaction[],
  primaryAccountId?: string,
): NonNullable<ImportBatchMeta["accounts"]> | undefined {
  const accounts = new Map<string, { id: string }>();
  const primary = asString(primaryAccountId);
  if (primary) {
    accounts.set(primary, { id: primary });
  }
  for (const row of transactions) {
    const accountId = asString(row.accountId);
    if (!accountId || accounts.has(accountId)) continue;
    accounts.set(accountId, { id: accountId });
  }
  if (accounts.size < 1) return undefined;
  return [...accounts.values()];
}

function collectBatchMonthRange(transactions: StoredTransaction[]): { ymMin?: string; ymMax?: string } {
  const months = transactions
    .map((row) => asString(row.date).slice(0, 7))
    .filter((value) => /^\d{4}-\d{2}$/.test(value))
    .sort((left, right) => left.localeCompare(right));
  if (months.length < 1) return {};
  return {
    ymMin: months[0],
    ymMax: months[months.length - 1],
  };
}

function getLatestSyntheticBatchRowDateOrderingCreatedAt(transactions: StoredTransaction[]): string | null {
  let latestTs = Number.NEGATIVE_INFINITY;
  for (const row of transactions) {
    const date = asString(row.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const ts = Date.parse(`${date}T23:59:59.999Z`);
    if (!Number.isFinite(ts) || ts <= latestTs) continue;
    latestTs = ts;
  }
  if (!Number.isFinite(latestTs)) return null;
  return new Date(latestTs).toISOString();
}

async function deriveSyntheticBatchOrderingCreatedAt(input: {
  batchId: string;
  transactions: StoredTransaction[];
}): Promise<string> {
  // Synthetic stored-only batches do not have trusted import metadata.
  // Ordering surrogate priority stays row-date first, then file mtime, then epoch.
  // Public createdAt exposure still stays behind the synthetic metadata boundary.
  const rowDateCreatedAt = getLatestSyntheticBatchRowDateOrderingCreatedAt(input.transactions);
  if (rowDateCreatedAt) return rowDateCreatedAt;
  const fileModifiedAt = await getBatchTransactionsFileModifiedAt(input.batchId);
  if (fileModifiedAt) return fileModifiedAt;
  return new Date(0).toISOString();
}

function buildImportBatchMeta(input: {
  batchId: string;
  createdAt: string;
  rowCount: number;
  transactions: StoredTransaction[];
  accountId?: string;
}): ImportBatchMeta {
  const monthRange = collectBatchMonthRange(input.transactions);
  const accounts = collectBatchAccounts(input.transactions, input.accountId);
  return {
    id: input.batchId,
    createdAt: input.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(input.rowCount) || 0)),
    ...(monthRange.ymMin ? { ymMin: monthRange.ymMin } : {}),
    ...(monthRange.ymMax ? { ymMax: monthRange.ymMax } : {}),
    ...(accounts ? { accounts } : {}),
  };
}

export async function listStoredBatchListCandidates(): Promise<StoredBatchListCandidate[]> {
  const [storedMeta, storedFileIds] = await Promise.all([
    listStoredBatches(),
    listBatchTransactionFileIds(),
  ]);

  const byId = new Map<string, StoredBatchListCandidate>(
    storedMeta.map((meta) => [
      meta.id,
      {
        meta,
        metadataSource: "stored" as const,
      },
    ]),
  );

  const syntheticIds = storedFileIds.filter((batchId) => !byId.has(batchId));
  if (syntheticIds.length < 1) {
    return [...byId.values()];
  }

  const syntheticRows = await Promise.all(syntheticIds.map(async (batchId) => {
    const transactions = await getBatchTransactions(batchId).catch(() => []);
    if (transactions.length < 1) return null;
    return {
      meta: buildImportBatchMeta({
        batchId,
        createdAt: await deriveSyntheticBatchOrderingCreatedAt({ batchId, transactions }),
        rowCount: transactions.length,
        transactions,
      }),
      metadataSource: "synthetic" as const,
    };
  }));

  for (const row of syntheticRows) {
    if (!row) continue;
    byId.set(row.meta.id, row);
  }

  return [...byId.values()];
}

export async function getStoredBatchCommandSurfaceState(batchId: string): Promise<StoredBatchCommandSurfaceState> {
  // Read surfaces can synthesize a batch from stored rows only, but command routes
  // still need to distinguish indexed writer-owned batches from synthetic read-only ones.
  const [storedMeta, storedTransactions] = await Promise.all([
    getBatchMeta(batchId).catch(() => null),
    getBatchTransactions(batchId).catch(() => []),
  ]);
  if (storedMeta) return "stored-meta";
  if (storedTransactions.length > 0) return "synthetic-stored-only";
  return "missing";
}

export async function getStoredBatchAccountCommandSurfaceState(batchId: string): Promise<StoredBatchAccountCommandSurfaceState> {
  const commandSurface = await getStoredBatchCommandSurfaceState(batchId);
  if (commandSurface === "synthetic-stored-only") return commandSurface;

  const legacyBatch = await readBatchTransactions(batchId).catch(() => null);
  if (!legacyBatch) {
    if (commandSurface === "stored-meta") return "stored-meta-only";
    return commandSurface;
  }

  // Account binding still writes through the legacy batch owner.
  // When stored metadata with the same id already exists, user-facing read surfaces
  // can keep the visible binding on the stored-first side, so command success would
  // overstate what the user continues to see immediately after POST /account.
  if (commandSurface === "stored-meta") return "stored-meta-legacy-coexistence";
  return "legacy-only";
}

export async function getStoredBatchDeleteSurfaceState(batchId: string): Promise<StoredBatchDeleteSurfaceState> {
  const commandSurface = await getStoredBatchCommandSurfaceState(batchId);
  const legacyBatch = await readBatchTransactions(batchId).catch(() => null);
  if (!legacyBatch) return commandSurface;

  // User-facing DELETE should not overstate removal when the legacy bridge still
  // resolves the same id after stored-side deletion.
  if (commandSurface === "missing") return "legacy-only";
  if (commandSurface === "stored-meta") return "stored-meta-legacy-coexistence";
  return "synthetic-stored-only-legacy-collision";
}

function pickLegacyBatchFallback(batch: V3ImportBatch): StoredFirstLegacyBatchFallback {
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    total: batch.total,
    ok: batch.ok,
    failed: batch.failed,
    ...(asString(batch.fileName) ? { fileName: asString(batch.fileName) } : {}),
    ...(asString(batch.accountId) ? { accountId: asString(batch.accountId) } : {}),
    ...(asString(batch.accountHint) ? { accountHint: asString(batch.accountHint) } : {}),
  };
}

function sortBatchMetasByCreatedAtDesc(items: ImportBatchMeta[]): ImportBatchMeta[] {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return left.id.localeCompare(right.id);
  });
}

export async function loadStoredFirstBatchTransactions(batchId: string): Promise<StoredFirstBatchReadResult | null> {
  const [storedMeta, storedTransactions] = await Promise.all([
    getBatchMeta(batchId).catch(() => null),
    getBatchTransactions(batchId).catch(() => []),
  ]);

  if (hasCompleteStoredSnapshot(storedMeta, storedTransactions)) {
    return {
      source: "stored",
      batchId: storedMeta!.id,
      createdAt: storedMeta!.createdAt,
      meta: storedMeta!,
      transactions: storedTransactions,
      policy: {
        mode: "stored-complete",
        transactionSource: "stored",
        metadataSource: "stored",
        usesLegacyTransactions: false,
        usesLegacyMetadata: false,
        needsLegacyDetailFallback: false,
      },
    };
  }

  const legacy = await readBatchTransactions(batchId);
  if (legacy) {
    const normalizedLegacyTransactions = normalizeLegacyTransactions(legacy.batch.id, legacy.transactions);
    const legacyBatch = pickLegacyBatchFallback(legacy.batch);
    if (storedMeta) {
      return {
        source: "legacy",
        batchId: legacy.batch.id,
        createdAt: storedMeta.createdAt,
        meta: storedMeta,
        transactions: normalizedLegacyTransactions,
        legacyBatch,
        policy: {
          mode: "hybrid-legacy-transactions",
          transactionSource: "legacy",
          metadataSource: "stored",
          usesLegacyTransactions: true,
          usesLegacyMetadata: false,
          needsLegacyDetailFallback: true,
        },
      };
    }

    return {
      source: "legacy",
      batchId: legacy.batch.id,
      createdAt: legacy.batch.createdAt,
      meta: buildImportBatchMeta({
        batchId: legacy.batch.id,
        createdAt: legacy.batch.createdAt,
        rowCount: legacy.batch.total,
        transactions: normalizedLegacyTransactions,
        accountId: legacy.batch.accountId,
      }),
      transactions: normalizedLegacyTransactions,
      legacyBatch,
      policy: {
        mode: "legacy-only",
        transactionSource: "legacy",
        metadataSource: "legacy-derived",
        usesLegacyTransactions: true,
        usesLegacyMetadata: true,
        needsLegacyDetailFallback: true,
      },
    };
  }

  if (storedMeta || storedTransactions.length > 0) {
    return {
      source: "stored",
      batchId: storedMeta?.id ?? batchId,
      ...(storedMeta ? { createdAt: storedMeta.createdAt } : {}),
      meta: storedMeta ?? buildImportBatchMeta({
        batchId,
        createdAt: await deriveSyntheticBatchOrderingCreatedAt({ batchId, transactions: storedTransactions }),
        rowCount: storedTransactions.length,
        transactions: storedTransactions,
      }),
      transactions: storedTransactions,
      policy: {
        mode: "stored-partial",
        transactionSource: "stored",
        metadataSource: storedMeta ? "stored" : "synthetic",
        usesLegacyTransactions: false,
        usesLegacyMetadata: false,
        needsLegacyDetailFallback: false,
      },
    };
  }

  return null;
}

export async function getLatestStoredFirstBatchId(): Promise<string | null> {
  const stored = sortBatchMetasByCreatedAtDesc(await listStoredBatches());
  if (stored[0]?.id) return stored[0].id;

  const legacy = await listLegacyBatches({ limit: 1 });
  return legacy.items[0]?.id ?? null;
}

export type { ImportBatchMeta, StoredTransaction };
