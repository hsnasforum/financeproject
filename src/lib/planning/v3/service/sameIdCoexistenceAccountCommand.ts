import { TransactionStoreInputError } from "./transactionStore";
import { type SameIdCoexistenceWritesCompletedSequenceResult } from "./sameIdCoexistenceSequencingTypes";
import {
  buildSameIdCoexistenceUserFacingInternalFailure,
  toSameIdCoexistenceUserFacingInternalFailure,
  type SameIdCoexistenceUserFacingInternalFailure,
} from "./sameIdCoexistenceRouteFailure";
import { runSameIdCoexistenceStoredThenLegacyRouteLocalSequence } from "./sameIdCoexistenceSequencing";
import { getStoredFirstBatchBindingAccountId } from "./storedFirstVisibleRows";
import {
  buildStoredFirstVisibleBatchShell,
  type StoredFirstVisibleBatchShell,
} from "./storedFirstVisibleBatchShell";
import {
  loadStoredFirstBatchTransactions,
} from "../transactions/store";

export type SameIdCoexistencePostWriteVisibleBindingVerificationStatus =
  | "visible-binding-matched"
  | "visible-binding-drifted"
  | "visible-binding-missing";

export type SameIdCoexistencePostWriteVisibleBindingVerificationResult = {
  batchId: string;
  targetAccountId: string;
  currentVisibleAccountId: string | null;
  status: SameIdCoexistencePostWriteVisibleBindingVerificationStatus;
};

export type SameIdCoexistencePostWriteSuccessSplitResult =
  | {
      status: "verified-success-candidate";
      sequence: SameIdCoexistenceWritesCompletedSequenceResult;
      verification: SameIdCoexistencePostWriteVisibleBindingVerificationResult;
    }
  | {
      status: "visible-verification-failed";
      sequence: SameIdCoexistenceWritesCompletedSequenceResult;
      verification: SameIdCoexistencePostWriteVisibleBindingVerificationResult;
      userFacingFailure: SameIdCoexistenceUserFacingInternalFailure;
    };

export type SameIdCoexistenceVerifiedSuccessResponseShell = {
  batch: StoredFirstVisibleBatchShell;
  updatedTransactionCount: number;
};

export type SameIdCoexistencePostWriteRouteResult =
  | {
      status: "verified-success";
      response: SameIdCoexistenceVerifiedSuccessResponseShell;
    }
  | {
      status: "visible-verification-failed";
      userFacingFailure: SameIdCoexistenceUserFacingInternalFailure;
      verification: SameIdCoexistencePostWriteVisibleBindingVerificationResult;
    };

export type SameIdCoexistenceAccountRouteCommandResult =
  | {
      status: "verified-success";
      response: SameIdCoexistenceVerifiedSuccessResponseShell;
    }
  | {
      status: "route-safe-internal-failure";
      userFacingFailure: SameIdCoexistenceUserFacingInternalFailure;
    };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function verifySameIdCoexistencePostWriteVisibleBinding(input: {
  batchId: string;
  targetAccountId: string;
}): Promise<SameIdCoexistencePostWriteVisibleBindingVerificationResult> {
  const batchId = asString(input.batchId);
  const targetAccountId = asString(input.targetAccountId);
  const loaded = await loadStoredFirstBatchTransactions(batchId);
  const currentVisibleAccountId = loaded ? getStoredFirstBatchBindingAccountId(loaded) : null;

  if (!currentVisibleAccountId) {
    return {
      batchId,
      targetAccountId,
      currentVisibleAccountId: null,
      status: "visible-binding-missing",
    };
  }

  if (currentVisibleAccountId === targetAccountId) {
    return {
      batchId,
      targetAccountId,
      currentVisibleAccountId,
      status: "visible-binding-matched",
    };
  }

  return {
    batchId,
    targetAccountId,
    currentVisibleAccountId,
    status: "visible-binding-drifted",
  };
}

export async function runSameIdCoexistencePostWriteSuccessSplitWorker(
  input: SameIdCoexistenceWritesCompletedSequenceResult,
): Promise<SameIdCoexistencePostWriteSuccessSplitResult> {
  const verification = await verifySameIdCoexistencePostWriteVisibleBinding({
    batchId: input.batchId,
    targetAccountId: input.targetAccountId,
  });

  if (verification.status === "visible-binding-matched") {
    return {
      status: "verified-success-candidate",
      sequence: input,
      verification,
    };
  }

  return {
    status: "visible-verification-failed",
    sequence: input,
    verification,
    userFacingFailure: buildSameIdCoexistenceUserFacingInternalFailure(),
  };
}

export async function buildSameIdCoexistenceVerifiedSuccessResponseShell(
  input: Extract<SameIdCoexistencePostWriteSuccessSplitResult, { status: "verified-success-candidate" }>,
): Promise<SameIdCoexistenceVerifiedSuccessResponseShell> {
  const reloaded = await loadStoredFirstBatchTransactions(input.sequence.batchId);
  if (!reloaded) {
    throw new TransactionStoreInputError("stored-first batch not found", [
      { field: "batchId", message: "배치를 찾을 수 없습니다." },
    ]);
  }

  return {
    batch: buildStoredFirstVisibleBatchShell(reloaded),
    // This stays legacy-side changed row count only.
    // Same-id visible binding can still verify successfully even when the count is 0.
    updatedTransactionCount: input.sequence.trace.legacyWrite.updatedTransactionCount,
  };
}

export async function resolveSameIdCoexistencePostWriteRouteResult(
  input: SameIdCoexistenceWritesCompletedSequenceResult,
): Promise<SameIdCoexistencePostWriteRouteResult> {
  const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(input);
  if (split.status === "visible-verification-failed") {
    return {
      status: "visible-verification-failed",
      userFacingFailure: split.userFacingFailure,
      verification: split.verification,
    };
  }

  return {
    status: "verified-success",
    response: await buildSameIdCoexistenceVerifiedSuccessResponseShell(split),
  };
}

export async function runSameIdCoexistenceAccountRouteCommand(input: {
  batchId: string;
  targetAccountId: string;
}): Promise<SameIdCoexistenceAccountRouteCommandResult> {
  const sequencing = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence(input);
  if (sequencing.status === "secondary-failure") {
    return {
      status: "route-safe-internal-failure",
      userFacingFailure: toSameIdCoexistenceUserFacingInternalFailure(sequencing),
    };
  }

  const routeResult = await resolveSameIdCoexistencePostWriteRouteResult(sequencing);
  if (routeResult.status === "visible-verification-failed") {
    return {
      status: "route-safe-internal-failure",
      userFacingFailure: routeResult.userFacingFailure,
    };
  }

  return routeResult;
}
