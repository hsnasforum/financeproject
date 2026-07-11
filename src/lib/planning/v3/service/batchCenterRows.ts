import {
  sortBatchListMetadataByCreatedAtDesc,
  toBatchListPublicImportBatchMeta,
  type BatchListMergedMeta,
} from "@/lib/planning/v3/service/batchListMetadata";
import { getBatchSummary } from "@/lib/planning/v3/service/getBatchSummary";
import { listStoredBatchListCandidates } from "@/lib/planning/v3/service/storedBatchListCandidates";
import {
  StorageCorruptedError,
  StorageUnavailableError,
} from "@/lib/planning/storage/serverFileRead";

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
  const storedListed = await listStoredBatchListCandidates();

  const mergedMeta = sortBatchListMetadataByCreatedAtDesc(
    storedListed.map((item): BatchListMergedMeta => item),
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
    } catch (error) {
      if (error instanceof StorageCorruptedError || error instanceof StorageUnavailableError) throw error;
      const publicMeta = toBatchListPublicImportBatchMeta(row);
      return {
        batchId: row.meta.id,
        ...(asString(publicMeta.createdAt) ? { createdAt: asString(publicMeta.createdAt) } : {}),
      };
    }
  }));
}
