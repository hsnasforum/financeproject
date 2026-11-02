import { sanitizeRecordId } from "../../store/paths";
import { deleteBatch as deleteStoredBatch } from "../store/batchesStore";
import {
  deleteBatchTxnOverrides,
  getBatchTxnOverrides,
  restoreBatchTxnOverrides,
} from "../store/txnOverridesStore";
import {
  deleteBatchAccountMappingOverrides,
  getAccountMappingOverrides,
  restoreBatchAccountMappingOverrides,
} from "../store/accountMappingOverridesStore";
import {
  deleteBatchTransferOverrides,
  getTransferOverrides,
  restoreBatchTransferOverrides,
} from "../store/txnTransferOverridesStore";
import {
  loadStoredFirstBatchTransactions,
} from "../transactions/store";
import { GetBatchSummaryError, getBatchSummary as getStoredFirstBatchSummary } from "./getBatchSummary";
import { withExistingCurrentUserBatchLifecycleMutation } from "./batchLifecycleMutation";
import { getStoredBatchDeleteSurfaceState } from "./storedBatchCommandSurface";
import { isUserFacingStoredBatchRead } from "./userFacingBatchReadPolicy";

export { GetBatchSummaryError };

export async function getCurrentUserBatchSummary(batchId: string) {
  const safeBatchId = sanitizeRecordId(batchId);
  const loaded = await loadStoredFirstBatchTransactions(safeBatchId);
  if (!isUserFacingStoredBatchRead(loaded)) {
    throw new GetBatchSummaryError("NOT_FOUND", "batch not found");
  }
  return getStoredFirstBatchSummary(safeBatchId);
}

export async function loadCurrentUserBatchDetail(batchIdInput: string) {
  const batchId = sanitizeRecordId(batchIdInput);
  const [loaded, overridesByTxnId] = await Promise.all([
    loadStoredFirstBatchTransactions(batchId),
    getBatchTxnOverrides(batchId),
  ]);
  if (!isUserFacingStoredBatchRead(loaded)) {
    return { batchId, loaded: null, overridesByTxnId };
  }
  return { batchId, loaded, overridesByTxnId };
}

export async function getCurrentUserBatchDeleteSurface(batchIdInput: string) {
  const batchId = sanitizeRecordId(batchIdInput);
  const deleteSurface = await getStoredBatchDeleteSurfaceState(batchId);
  if (deleteSurface === "legacy-only") {
    return { batchId, deleteSurface: "missing" as const };
  }
  return { batchId, deleteSurface };
}

export async function deleteCurrentUserStoredBatch(batchIdInput: string) {
  return withExistingCurrentUserBatchLifecycleMutation(batchIdInput, async (batchId) => {
    const [txnOverrides, accountOverrides, transferOverrides] = await Promise.all([
      getBatchTxnOverrides(batchId),
      getAccountMappingOverrides(batchId),
      getTransferOverrides(batchId),
    ]);

    try {
      await deleteBatchTxnOverrides(batchId);
      await deleteBatchAccountMappingOverrides(batchId);
      await deleteBatchTransferOverrides(batchId);
      await deleteStoredBatch(batchId);
    } catch (error) {
      const rollbackResults = await Promise.allSettled([
        restoreBatchTxnOverrides(batchId, txnOverrides),
        restoreBatchAccountMappingOverrides(batchId, accountOverrides),
        restoreBatchTransferOverrides(batchId, transferOverrides),
      ]);
      const rollbackFailure = rollbackResults.find((result) => result.status === "rejected");
      if (rollbackFailure?.status === "rejected") throw rollbackFailure.reason;
      throw error;
    }
  }, { allowSyntheticStoredOnly: true });
}
