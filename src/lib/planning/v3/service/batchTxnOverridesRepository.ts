import {
  TxnOverridesStoreInputError,
  deleteBatchTxnOverride as deleteStoredBatchTxnOverride,
  getBatchTxnOverrides as getStoredBatchTxnOverrides,
  upsertBatchTxnOverride as upsertStoredBatchTxnOverride,
} from "../store/txnOverridesStore";

export { TxnOverridesStoreInputError };

export type BatchTxnOverrideUpsertCommand = Parameters<typeof upsertStoredBatchTxnOverride>[0];

export async function getCurrentUserBatchTxnOverrides(batchId: string) {
  return getStoredBatchTxnOverrides(batchId);
}

export async function upsertCurrentUserBatchTxnOverride(input: BatchTxnOverrideUpsertCommand) {
  return upsertStoredBatchTxnOverride(input);
}

export async function deleteCurrentUserBatchTxnOverride(input: { batchId: string; txnId: string }) {
  return deleteStoredBatchTxnOverride(input);
}
