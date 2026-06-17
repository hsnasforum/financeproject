import {
  TxnTransferOverridesStoreInputError,
  upsertTransferOverride as upsertStoredTransferOverride,
} from "../store/txnTransferOverridesStore";

export { TxnTransferOverridesStoreInputError };

export async function upsertCurrentUserTransferOverride(input: {
  batchId?: unknown;
  txnId?: unknown;
  forceTransfer?: unknown;
  forceNonTransfer?: unknown;
  note?: unknown;
}): Promise<Awaited<ReturnType<typeof upsertStoredTransferOverride>>> {
  return upsertStoredTransferOverride({
    batchId: input.batchId,
    txnId: input.txnId,
    forceTransfer: input.forceTransfer,
    forceNonTransfer: input.forceNonTransfer,
    note: input.note,
  });
}
