import { type ImportBatchMeta } from "../domain/transactions";
import { listBatches as listStoredBatches } from "../store/batchesStore";

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

export async function getLatestStoredFirstBatchId(): Promise<string | null> {
  const stored = sortBatchMetasByCreatedAtDesc(await listStoredBatches());
  if (stored[0]?.id) return stored[0].id;
  return null;
}
