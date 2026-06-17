import {
  AccountMappingOverridesStoreInputError,
  upsertAccountMappingOverride as upsertStoredAccountMappingOverride,
} from "../store/accountMappingOverridesStore";

export { AccountMappingOverridesStoreInputError };

export async function upsertCurrentUserAccountMappingOverride(input: {
  batchId?: unknown;
  txnId?: unknown;
  accountId?: unknown;
}): Promise<Awaited<ReturnType<typeof upsertStoredAccountMappingOverride>>> {
  return upsertStoredAccountMappingOverride({
    batchId: input.batchId,
    txnId: input.txnId,
    accountId: input.accountId,
  });
}
