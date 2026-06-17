import { getBatchSummary as getStoredBatchSummary } from "./getBatchSummary";
import {
  ImportCsvToBatchInputError,
  importCsvToBatch as importStoredCsvToBatch,
  type ImportCsvToBatchInput,
  type ImportCsvToBatchResult,
} from "./importCsvToBatch";

export { ImportCsvToBatchInputError };

export type BatchImportSummary = Awaited<ReturnType<typeof getStoredBatchSummary>>;

export async function importCurrentUserCsvToBatch(input: ImportCsvToBatchInput): Promise<ImportCsvToBatchResult> {
  return importStoredCsvToBatch(input);
}

export async function getCurrentUserBatchImportSummary(batchId: string): Promise<BatchImportSummary> {
  return getStoredBatchSummary(batchId);
}
