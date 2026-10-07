import {
  normalizePlanningBatchLifecycleId,
  withPlanningBatchLifecycleLock,
} from "../store/batchLifecycleLock";
import { getStoredBatchCommandSurfaceState } from "./storedBatchCommandSurface";

export class BatchLifecycleMutationError extends Error {
  readonly code: "INPUT" | "NOT_FOUND" | "READ_ONLY";

  constructor(code: "INPUT" | "NOT_FOUND" | "READ_ONLY", message: string) {
    super(message);
    this.name = "BatchLifecycleMutationError";
    this.code = code;
  }
}

function normalizeBatchId(batchId: unknown): string {
  try {
    return normalizePlanningBatchLifecycleId(batchId);
  } catch {
    throw new BatchLifecycleMutationError("INPUT", "invalid batch id");
  }
}

export function withExistingCurrentUserBatchLifecycleMutation<T>(
  batchIdInput: unknown,
  callback: (batchId: string) => Promise<T> | T,
  options: { allowSyntheticStoredOnly?: boolean } = {},
): Promise<T> {
  const batchId = normalizeBatchId(batchIdInput);
  return withPlanningBatchLifecycleLock(batchId, async () => {
    const state = await getStoredBatchCommandSurfaceState(batchId);
    if (state === "missing") {
      throw new BatchLifecycleMutationError("NOT_FOUND", "batch not found");
    }
    if (state === "synthetic-stored-only" && !options.allowSyntheticStoredOnly) {
      throw new BatchLifecycleMutationError("READ_ONLY", "synthetic stored-only batch is read-only");
    }
    return callback(batchId);
  });
}
