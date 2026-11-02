import {
  AccountMappingOverridesStoreInputError,
  upsertAccountMappingOverride as upsertStoredAccountMappingOverride,
} from "../store/accountMappingOverridesStore";
import { withExistingCurrentUserBatchLifecycleMutation } from "./batchLifecycleMutation";

export { AccountMappingOverridesStoreInputError };

export async function upsertCurrentUserAccountMappingOverride(input: {
  batchId?: unknown;
  txnId?: unknown;
  accountId?: unknown;
}): Promise<Awaited<ReturnType<typeof upsertStoredAccountMappingOverride>>> {
  return withExistingCurrentUserBatchLifecycleMutation(input.batchId, (batchId) => (
    upsertStoredAccountMappingOverride({
      batchId,
      txnId: input.txnId,
      accountId: input.accountId,
    })
  ));
}
