import {
  TxnOverridesStoreInputError,
  deleteBatchTxnOverride as deleteStoredBatchTxnOverride,
  getBatchTxnOverrides as getStoredBatchTxnOverrides,
  upsertBatchTxnOverride as upsertStoredBatchTxnOverride,
} from "../store/txnOverridesStore";
import { withExistingCurrentUserBatchLifecycleMutation } from "./batchLifecycleMutation";

export { TxnOverridesStoreInputError };

export type BatchTxnOverrideUpsertCommand = Parameters<typeof upsertStoredBatchTxnOverride>[0];

export async function getCurrentUserBatchTxnOverrides(batchId: string) {
  return getStoredBatchTxnOverrides(batchId);
}

export async function upsertCurrentUserBatchTxnOverride(input: BatchTxnOverrideUpsertCommand) {
  return withExistingCurrentUserBatchLifecycleMutation(input.batchId, (batchId) => (
    upsertStoredBatchTxnOverride({ ...input, batchId })
  ));
}

export async function deleteCurrentUserBatchTxnOverride(input: { batchId: string; txnId: string }) {
  return withExistingCurrentUserBatchLifecycleMutation(input.batchId, (batchId) => (
    deleteStoredBatchTxnOverride({ ...input, batchId })
  ));
}
