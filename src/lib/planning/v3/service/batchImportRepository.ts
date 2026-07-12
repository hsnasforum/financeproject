import { getBatchSummary as getStoredBatchSummary } from "./getBatchSummary";
import { getAccountMappingOverrides } from "../store/accountMappingOverridesStore";
import { listRules } from "../store/categoryRulesStore";
import { getBatchTxnOverrides } from "../store/txnOverridesStore";
import { getTransferOverrides } from "../store/txnTransferOverridesStore";
import {
  ImportCsvToBatchInputError,
  importCsvToBatch as importStoredCsvToBatch,
  type ImportCsvToBatchInput,
  type ImportCsvToBatchResult,
} from "./importCsvToBatch";

export { ImportCsvToBatchInputError };

export type BatchImportSummary = Awaited<ReturnType<typeof getStoredBatchSummary>>;

async function assertBatchSummaryStoresReadable(batchId: string): Promise<void> {
  await Promise.all([
    listRules(),
    getBatchTxnOverrides(batchId),
    getAccountMappingOverrides(batchId),
    getTransferOverrides(batchId),
  ]);
}

export async function importCurrentUserCsvToBatch(
  input: ImportCsvToBatchInput,
  options: { preflightSummary?: boolean } = {},
): Promise<ImportCsvToBatchResult> {
  return importStoredCsvToBatch(input, {
    ...(options.preflightSummary ? { beforeCommit: assertBatchSummaryStoresReadable } : {}),
  });
}

export async function getCurrentUserBatchImportSummary(batchId: string): Promise<BatchImportSummary> {
  return getStoredBatchSummary(batchId);
}
