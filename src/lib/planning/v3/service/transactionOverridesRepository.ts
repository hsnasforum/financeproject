import {
  TxnOverridesStoreInputError,
  deleteBatchTxnOverride as deleteStoredBatchTxnOverride,
  deleteLegacyUnscopedTxnOverride as deleteStoredLegacyUnscopedTxnOverride,
  getBatchTxnOverrides as getStoredBatchTxnOverrides,
  listLegacyUnscopedTxnOverrides as listStoredLegacyUnscopedTxnOverrides,
  upsertBatchTxnOverride as upsertStoredBatchTxnOverride,
  upsertLegacyUnscopedTxnOverride as upsertStoredLegacyUnscopedTxnOverride,
} from "../store/txnOverridesStore";
import { withExistingCurrentUserBatchLifecycleMutation } from "./batchLifecycleMutation";

export { TxnOverridesStoreInputError };

export type TransactionOverridesScope = "batch-scoped" | "legacy-unscoped";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function listCurrentUserTransactionOverrides(batchIdInput: unknown): Promise<{
  items: Awaited<ReturnType<typeof getStoredBatchTxnOverrides>>;
  batchId: string | null;
  scope: TransactionOverridesScope;
}> {
  const batchId = asString(batchIdInput);
  if (batchId) {
    return {
      items: await getStoredBatchTxnOverrides(batchId),
      batchId,
      scope: "batch-scoped",
    };
  }

  return {
    items: await listStoredLegacyUnscopedTxnOverrides(),
    batchId: null,
    scope: "legacy-unscoped",
  };
}

export async function upsertCurrentUserTransactionOverride(input: {
  batchId?: unknown;
  txnId?: unknown;
  categoryId?: unknown;
  note?: unknown;
  kind?: unknown;
  category?: unknown;
}): Promise<{
  override: Awaited<ReturnType<typeof upsertStoredBatchTxnOverride>>;
  scope: TransactionOverridesScope;
}> {
  const batchId = asString(input.batchId);
  const hasCategoryId = asString(input.categoryId).length > 0;

  if (batchId && hasCategoryId) {
    return withExistingCurrentUserBatchLifecycleMutation(batchId, async (safeBatchId) => ({
      override: await upsertStoredBatchTxnOverride({
        batchId: safeBatchId,
        txnId: input.txnId,
        categoryId: input.categoryId,
        ...(input.note !== undefined ? { note: input.note } : {}),
      }),
      scope: "batch-scoped" as const,
    }));
  }

  return {
    override: await upsertStoredLegacyUnscopedTxnOverride(input.txnId, {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    }),
    scope: "legacy-unscoped",
  };
}

export async function deleteCurrentUserTransactionOverride(input: {
  batchId?: unknown;
  txnId?: unknown;
}): Promise<{
  deleted: true;
  scope: TransactionOverridesScope;
}> {
  const batchId = asString(input.batchId);
  const txnId = asString(input.txnId);

  if (batchId && txnId) {
    return withExistingCurrentUserBatchLifecycleMutation(batchId, async (safeBatchId) => {
      await deleteStoredBatchTxnOverride({ batchId: safeBatchId, txnId });
      return { deleted: true as const, scope: "batch-scoped" as const };
    });
  }

  await deleteStoredLegacyUnscopedTxnOverride(txnId);
  return { deleted: true, scope: "legacy-unscoped" };
}
