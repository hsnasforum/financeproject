import { type ImportBatchMeta } from "@/lib/planning/v3/domain/transactions";
import {
  getBatchListPublicCreatedAtString,
  sortBatchListMetadataByCreatedAtDesc,
  toBatchListPublicImportBatchMeta,
  type BatchListMergedMeta,
} from "@/lib/planning/v3/service/batchListMetadata";
import { listStoredBatchListCandidates } from "@/lib/planning/v3/service/storedBatchListCandidates";

export type TransactionBatchLegacyRow = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  total: number;
  ok: number;
  failed: number;
};

export type TransactionBatchListOptions = {
  limit?: unknown;
  cursor?: unknown;
};

export type TransactionBatchListResult = {
  data: Array<ReturnType<typeof toBatchListPublicImportBatchMeta> & { createdAt: string }>;
  items: TransactionBatchLegacyRow[];
  nextCursor?: string;
};

function toLegacyFromMeta(meta: ImportBatchMeta, fileName?: string): TransactionBatchLegacyRow {
  const count = Math.max(0, Math.trunc(Number(meta.rowCount) || 0));
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    kind: "csv",
    ...(fileName ? { fileName } : {}),
    total: count,
    ok: count,
    failed: 0,
  };
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function listTransactionBatchRows(options: TransactionBatchListOptions = {}): Promise<TransactionBatchListResult> {
  const limit = asPositiveInt(options.limit, 50);
  void options.cursor;
  const storedListed = await listStoredBatchListCandidates();
  const mergedMeta = sortBatchListMetadataByCreatedAtDesc(
    storedListed.map((item): BatchListMergedMeta => item),
    { tieBreak: "id-desc" },
  ).slice(0, limit);

  const data = mergedMeta.map((row) => {
    const publicMeta = toBatchListPublicImportBatchMeta(row);
    const createdAt = getBatchListPublicCreatedAtString(row);
    return {
      ...publicMeta,
      createdAt,
    };
  });
  const items = mergedMeta.map((row) => {
    const createdAt = getBatchListPublicCreatedAtString(row);
    return {
      ...toLegacyFromMeta(row.meta),
      // Transaction batch list keeps the legacy string contract for createdAt.
      createdAt,
    };
  });

  return {
    data,
    items,
  };
}
