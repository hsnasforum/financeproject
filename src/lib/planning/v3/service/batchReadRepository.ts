import { sanitizeRecordId } from "../../store/paths";
import { deleteBatch as deleteStoredBatch } from "../store/batchesStore";
import { getBatchTxnOverrides } from "../store/txnOverridesStore";
import {
  loadStoredFirstBatchTransactions,
} from "../transactions/store";
import { GetBatchSummaryError, getBatchSummary as getStoredFirstBatchSummary } from "./getBatchSummary";
import { getStoredBatchDeleteSurfaceState } from "./storedBatchCommandSurface";

export { GetBatchSummaryError };

export async function getCurrentUserBatchSummary(batchId: string) {
  return getStoredFirstBatchSummary(batchId);
}

export async function loadCurrentUserBatchDetail(batchIdInput: string) {
  const batchId = sanitizeRecordId(batchIdInput);
  const [loaded, overridesByTxnId] = await Promise.all([
    loadStoredFirstBatchTransactions(batchId),
    getBatchTxnOverrides(batchId).catch(() => ({})),
  ]);
  return { batchId, loaded, overridesByTxnId };
}

export async function getCurrentUserBatchDeleteSurface(batchIdInput: string) {
  const batchId = sanitizeRecordId(batchIdInput);
  const deleteSurface = await getStoredBatchDeleteSurfaceState(batchId);
  return { batchId, deleteSurface };
}

export async function deleteCurrentUserStoredBatch(batchIdInput: string) {
  const batchId = sanitizeRecordId(batchIdInput);
  await deleteStoredBatch(batchId);
}
