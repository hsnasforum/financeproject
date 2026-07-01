import { type StoredFirstBatchReadResult } from "../transactions/store";

export function isUserFacingStoredBatchRead(
  read: StoredFirstBatchReadResult | null | undefined,
): read is StoredFirstBatchReadResult {
  return Boolean(read && !read.policy.usesLegacyTransactions);
}
