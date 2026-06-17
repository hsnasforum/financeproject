import { type ImportBatchMeta } from "@/lib/planning/v3/domain/transactions";
import {
  getBatchListPublicCreatedAtString,
  mergeBatchListMetadata,
  sortBatchListMetadataByCreatedAtDesc,
  toBatchListPublicImportBatchMeta,
} from "@/lib/planning/v3/service/batchListMetadata";
import { listStoredBatchListCandidates } from "@/lib/planning/v3/service/storedBatchListCandidates";
import { listBatches as listLegacyBatches } from "@/lib/planning/v3/service/transactionStore";

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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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
  const cursor = asString(options.cursor);
  const [legacyListed, storedListed] = await Promise.all([
    listLegacyBatches({
      ...(limit ? { limit: Math.max(limit, 200) } : {}),
      ...(cursor ? { cursor } : {}),
    }),
    listStoredBatchListCandidates(),
  ]);

  const legacyItems = legacyListed.items as TransactionBatchLegacyRow[];
  const legacyById = new Map(legacyItems.map((item) => [item.id, item]));
  const mergedMeta = sortBatchListMetadataByCreatedAtDesc(
    mergeBatchListMetadata({
      legacyItems,
      storedItems: storedListed,
    }),
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
    const legacy = legacyById.get(row.meta.id);
    return {
      ...(legacy ?? toLegacyFromMeta(row.meta)),
      // Transaction batch list keeps the legacy string contract for createdAt.
      createdAt,
    };
  });

  return {
    data,
    items,
    ...(legacyListed.nextCursor ? { nextCursor: legacyListed.nextCursor } : {}),
  };
}
