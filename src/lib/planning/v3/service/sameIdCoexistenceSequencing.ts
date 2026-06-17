import { type ImportBatchMeta } from "../domain/transactions";
import { sanitizeRecordId } from "../../store/paths";
import {
  getBatchMeta,
  restoreStoredBatchAccountBindingSnapshot,
  updateStoredBatchAccountBinding,
} from "../store/batchesStore";
import {
  TransactionStoreInputError,
  updateBatchAccount,
} from "./transactionStore";
import {
  type SameIdCoexistenceLegacySecondWriteErrorSummary,
  type SameIdCoexistenceRouteLocalSequencingResult,
  type SameIdCoexistenceRouteLocalSequencingTrace,
  type SameIdCoexistenceSecondaryFailureWorkerInput,
} from "./sameIdCoexistenceSequencingTypes";
import {
  buildSameIdCoexistenceOperatorRepairPayload,
  runSameIdCoexistenceSecondaryFailureRouteLocalWorker,
} from "./sameIdCoexistenceFailureAnalysis";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 transaction store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountId(value: unknown): string {
  const text = asString(value);
  if (!text) {
    throw new TransactionStoreInputError("accountId is required", [
      { field: "accountId", message: "거래 계좌를 선택해 주세요." },
    ]);
  }
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new TransactionStoreInputError("invalid accountId", [
      { field: "accountId", message: "거래 계좌 형식이 올바르지 않습니다." },
    ]);
  }
}

function cloneImportBatchAccounts(
  accounts: ImportBatchMeta["accounts"],
): ImportBatchMeta["accounts"] {
  const existing = Array.isArray(accounts) ? accounts : [];
  if (existing.length < 1) return undefined;
  return existing.map((entry) => ({ ...entry }));
}

function getPrimaryImportBatchAccountId(
  accounts: ImportBatchMeta["accounts"],
): string | null {
  return asString(accounts?.[0]?.id) || null;
}

export function summarizeSameIdCoexistenceLegacySecondWriteError(
  error: unknown,
): SameIdCoexistenceLegacySecondWriteErrorSummary {
  if (error instanceof TransactionStoreInputError && error.message === "legacy batch not found") {
    return {
      stage: "legacy-second-write",
      code: "legacy-batch-missing",
      message: "기존 배치를 찾을 수 없습니다.",
    };
  }

  return {
    stage: "legacy-second-write",
    code: "legacy-second-write-failed",
    message: "기존 배치 append 저장에 실패했습니다.",
  };
}

export async function runSameIdCoexistenceStoredThenLegacyRouteLocalSequence(input: {
  batchId: string;
  targetAccountId: string;
}): Promise<SameIdCoexistenceRouteLocalSequencingResult> {
  assertServerOnly();

  const safeBatchId = sanitizeRecordId(input.batchId);
  const safeTargetAccountId = normalizeAccountId(input.targetAccountId);
  const storedPreWriteMeta = await getBatchMeta(safeBatchId).catch(() => null);
  if (!storedPreWriteMeta) {
    throw new TransactionStoreInputError("stored batch meta not found", [
      { field: "batchId", message: "배치를 찾을 수 없습니다." },
    ]);
  }

  const storedPreWriteAccounts = cloneImportBatchAccounts(storedPreWriteMeta.accounts);
  const trace: SameIdCoexistenceRouteLocalSequencingTrace = {
    storedPreWriteAccountId: getPrimaryImportBatchAccountId(storedPreWriteAccounts),
    storedWrite: {
      attempted: false,
      succeeded: false,
      accountIdAfterWrite: null,
    },
    legacyWrite: {
      attempted: false,
      succeeded: false,
      accountIdAfterWrite: null,
      updatedTransactionCount: 0,
    },
    storedRollback: {
      attempted: false,
      succeeded: false,
      accountIdAfterRollback: null,
    },
  };

  trace.storedWrite.attempted = true;
  const storedUpdated = await updateStoredBatchAccountBinding(safeBatchId, safeTargetAccountId);
  if (!storedUpdated) {
    throw new TransactionStoreInputError("stored batch meta not found", [
      { field: "batchId", message: "배치를 찾을 수 없습니다." },
    ]);
  }
  trace.storedWrite.succeeded = true;
  trace.storedWrite.accountIdAfterWrite = getPrimaryImportBatchAccountId(storedUpdated.accounts);

  try {
    trace.legacyWrite.attempted = true;
    const legacyUpdated = await updateBatchAccount(safeBatchId, safeTargetAccountId);
    if (!legacyUpdated) {
      throw new TransactionStoreInputError("legacy batch not found", [
        { field: "batchId", message: "배치를 찾을 수 없습니다." },
      ]);
    }

    trace.legacyWrite.succeeded = true;
    trace.legacyWrite.accountIdAfterWrite = asString(legacyUpdated.batch.accountId) || null;
    trace.legacyWrite.updatedTransactionCount = legacyUpdated.updatedTransactionCount;

    return {
      status: "writes-completed",
      batchId: safeBatchId,
      targetAccountId: safeTargetAccountId,
      trace,
    };
  } catch (error) {
    const legacySecondWriteError = summarizeSameIdCoexistenceLegacySecondWriteError(error);
    trace.storedRollback.attempted = true;
    const rollbackMeta = await restoreStoredBatchAccountBindingSnapshot(
      safeBatchId,
      storedPreWriteAccounts,
    ).catch(() => null);
    trace.storedRollback.succeeded = rollbackMeta !== null;
    trace.storedRollback.accountIdAfterRollback = rollbackMeta
      ? getPrimaryImportBatchAccountId(rollbackMeta.accounts)
      : null;

    const secondaryFailureWorkerInput: SameIdCoexistenceSecondaryFailureWorkerInput = {
      batchId: safeBatchId,
      targetAccountId: safeTargetAccountId,
      storedRollbackAttempted: trace.storedRollback.attempted,
      storedRollbackSucceeded: trace.storedRollback.succeeded,
      storedPreWriteAccountId: trace.storedPreWriteAccountId,
    };
    const secondaryFailure = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker(
      secondaryFailureWorkerInput,
    );
    const operatorRepairPayload = buildSameIdCoexistenceOperatorRepairPayload(secondaryFailure);

    return {
      status: "secondary-failure",
      batchId: safeBatchId,
      targetAccountId: safeTargetAccountId,
      trace,
      legacySecondWriteError,
      secondaryFailureWorkerInput,
      secondaryFailure,
      operatorRepairPayload,
    };
  }
}
