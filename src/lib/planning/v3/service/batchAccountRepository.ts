import {
  TransactionStoreInputError,
  updateBatchAccount,
  type UpdateBatchAccountResult,
} from "./transactionStore";
import {
  runSameIdCoexistenceAccountRouteCommand,
  type SameIdCoexistenceVerifiedSuccessResponseShell,
} from "./sameIdCoexistenceAccountCommand";
import {
  getStoredBatchAccountCommandSurfaceState,
} from "./storedBatchCommandSurface";
import { updateStoredBatchAccountBinding } from "../store/batchesStore";
import { type SameIdCoexistenceUserFacingInternalFailure } from "./sameIdCoexistenceRouteFailure";

export { TransactionStoreInputError };

export type StoredMetaOnlyAccountBindingBatch = {
  id: string;
  createdAt: string;
  kind: "csv";
  total: number;
  ok: number;
  failed: number;
  accountId: string;
  accountHint: string;
};

export type CurrentUserBatchAccountBindingResult =
  | { status: "synthetic-stored-only" }
  | {
      status: "stored-meta-only";
      batch: StoredMetaOnlyAccountBindingBatch;
      updatedTransactionCount: 0;
    }
  | { status: "stored-not-found" }
  | {
      status: "same-id-internal-failure";
      userFacingFailure: SameIdCoexistenceUserFacingInternalFailure;
    }
  | {
      status: "same-id-success";
      response: SameIdCoexistenceVerifiedSuccessResponseShell;
    }
  | {
      status: "legacy-success";
      response: UpdateBatchAccountResult;
    }
  | { status: "legacy-not-found" };

function toStoredMetaOnlyResponseBatch(input: {
  batchId: string;
  createdAt: string;
  rowCount: number;
  accountId: string;
}): StoredMetaOnlyAccountBindingBatch {
  return {
    id: input.batchId,
    createdAt: input.createdAt,
    kind: "csv",
    total: input.rowCount,
    ok: input.rowCount,
    failed: 0,
    accountId: input.accountId,
    accountHint: input.accountId,
  };
}

export async function updateCurrentUserBatchAccountBinding(
  batchId: string,
  accountId: string,
): Promise<CurrentUserBatchAccountBindingResult> {
  const commandSurface = await getStoredBatchAccountCommandSurfaceState(batchId);

  if (commandSurface === "synthetic-stored-only") {
    return { status: "synthetic-stored-only" };
  }

  if (commandSurface === "stored-meta-only") {
    const updatedMeta = await updateStoredBatchAccountBinding(batchId, accountId);
    if (!updatedMeta) return { status: "stored-not-found" };
    const boundAccountId = updatedMeta.accounts?.[0]?.id ?? accountId;
    return {
      status: "stored-meta-only",
      batch: toStoredMetaOnlyResponseBatch({
        batchId: updatedMeta.id,
        createdAt: updatedMeta.createdAt,
        rowCount: updatedMeta.rowCount,
        accountId: boundAccountId,
      }),
      updatedTransactionCount: 0,
    };
  }

  if (commandSurface === "stored-meta-legacy-coexistence") {
    const commandResult = await runSameIdCoexistenceAccountRouteCommand({
      batchId,
      targetAccountId: accountId,
    });
    if (commandResult.status === "route-safe-internal-failure") {
      return {
        status: "same-id-internal-failure",
        userFacingFailure: commandResult.userFacingFailure,
      };
    }
    return {
      status: "same-id-success",
      response: commandResult.response,
    };
  }

  const updated = await updateBatchAccount(batchId, accountId);
  if (!updated) return { status: "legacy-not-found" };
  return {
    status: "legacy-success",
    response: updated,
  };
}
