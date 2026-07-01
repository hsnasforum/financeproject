import {
  getStoredBatchAccountCommandSurfaceState,
} from "./storedBatchCommandSurface";
import { updateStoredBatchAccountBinding } from "../store/batchesStore";

export class TransactionStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TransactionStoreInputError";
    this.details = details;
  }
}

export type StoredMetaOnlyAccountBindingBatch = {
  id: string;
  createdAt: string;
  kind: "csv";
  total: number;
  ok: number;
  failed: number;
  accountId: string;
  accountHint: string;
};

export type CurrentUserBatchAccountBindingResult =
  | { status: "synthetic-stored-only" }
  | {
      status: "stored-meta-only";
      batch: StoredMetaOnlyAccountBindingBatch;
      updatedTransactionCount: 0;
    }
  | { status: "stored-not-found" }
  | { status: "migration-conflict" };

function toStoredMetaOnlyResponseBatch(input: {
  batchId: string;
  createdAt: string;
  rowCount: number;
  accountId: string;
}): StoredMetaOnlyAccountBindingBatch {
  return {
    id: input.batchId,
    createdAt: input.createdAt,
    kind: "csv",
    total: input.rowCount,
    ok: input.rowCount,
    failed: 0,
    accountId: input.accountId,
    accountHint: input.accountId,
  };
}

export async function updateCurrentUserBatchAccountBinding(
  batchId: string,
  accountId: string,
): Promise<CurrentUserBatchAccountBindingResult> {
  const commandSurface = await getStoredBatchAccountCommandSurfaceState(batchId);

  if (commandSurface === "synthetic-stored-only") {
    return { status: "synthetic-stored-only" };
  }

  if (commandSurface === "stored-meta-only") {
    const updatedMeta = await updateStoredBatchAccountBinding(batchId, accountId);
    if (!updatedMeta) return { status: "stored-not-found" };
    const boundAccountId = updatedMeta.accounts?.[0]?.id ?? accountId;
    return {
      status: "stored-meta-only",
      batch: toStoredMetaOnlyResponseBatch({
        batchId: updatedMeta.id,
        createdAt: updatedMeta.createdAt,
        rowCount: updatedMeta.rowCount,
        accountId: boundAccountId,
      }),
      updatedTransactionCount: 0,
    };
  }

  if (commandSurface === "stored-meta-legacy-coexistence") {
    return { status: "migration-conflict" };
  }

  return { status: "stored-not-found" };
}
