import { withPlanningStoreWriteLock } from "../../storage/storeWriteLock";
import { sanitizeRecordId } from "../../store/paths";

export function normalizePlanningBatchLifecycleId(batchId: unknown): string {
  return sanitizeRecordId(typeof batchId === "string" ? batchId.trim() : "");
}

export function withPlanningBatchLifecycleLock<T>(
  batchId: unknown,
  callback: (safeBatchId: string) => Promise<T> | T,
): Promise<T> {
  const safeBatchId = normalizePlanningBatchLifecycleId(batchId);
  return withPlanningStoreWriteLock(
    `planning-v3:batch-lifecycle:${safeBatchId}`,
    () => callback(safeBatchId),
  );
}
