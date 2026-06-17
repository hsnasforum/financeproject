import {
  mergeBatchListMetadata,
  sortBatchListMetadataByCreatedAtDesc,
  toBatchListPublicImportBatchMeta,
} from "@/lib/planning/v3/service/batchListMetadata";
import { getBatchSummary } from "@/lib/planning/v3/service/getBatchSummary";
import { listStoredBatchListCandidates } from "@/lib/planning/v3/service/storedBatchListCandidates";
import { listBatches as listLegacyBatches } from "@/lib/planning/v3/service/transactionStore";

type LegacyBatchRow = {
  id: string;
  createdAt: string;
  kind: "csv";
  total: number;
};

export type BatchCenterRow = {
  batchId: string;
  // Batch center follows summary-style omission for hidden createdAt.
  createdAt?: string;
  stats?: {
    months?: number;
    txns?: number;
    unassignedCategory?: number;
    transfers?: number;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function listBatchCenterRows({
  limit = 50,
}: {
  limit?: number;
} = {}): Promise<BatchCenterRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 50;
  const [legacyListed, storedListed] = await Promise.all([
    listLegacyBatches({ limit: Math.max(safeLimit, 200) }),
    listStoredBatchListCandidates(),
  ]);

  const mergedMeta = sortBatchListMetadataByCreatedAtDesc(
    mergeBatchListMetadata({
      legacyItems: legacyListed.items as LegacyBatchRow[],
      storedItems: storedListed,
    }),
    { tieBreak: "id-asc" },
  ).slice(0, safeLimit);

  return Promise.all(mergedMeta.map(async (row) => {
    try {
      const summary = await getBatchSummary(row.meta.id);
      return {
        batchId: row.meta.id,
        ...(asString(summary.createdAt) ? { createdAt: asString(summary.createdAt) } : {}),
        stats: {
          months: summary.range?.months ?? summary.monthly.length,
          txns: summary.counts.txns,
          unassignedCategory: summary.counts.unassignedCategory,
          transfers: summary.counts.transfers,
        },
      };
    } catch {
      const publicMeta = toBatchListPublicImportBatchMeta(row);
      return {
        batchId: row.meta.id,
        ...(asString(publicMeta.createdAt) ? { createdAt: asString(publicMeta.createdAt) } : {}),
      };
    }
  }));
}
