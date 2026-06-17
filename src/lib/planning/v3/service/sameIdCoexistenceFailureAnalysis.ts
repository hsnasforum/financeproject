import { sanitizeRecordId } from "../../store/paths";
import { type V3ImportBatch } from "../domain/transactions";
import { getBatchMeta } from "../store/batchesStore";
import {
  type LegacyBatchAccountAppendVerificationResult,
  TransactionStoreInputError,
  verifyLegacyBatchAccountAppendPostWrite,
} from "./transactionStore";
import {
  type SameIdCoexistenceOperatorEvidenceSnapshot,
  type SameIdCoexistenceOperatorRepairPayload,
  type SameIdCoexistencePostWriteFailureClassification,
  type SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult,
  type StoredCurrentBindingEvidenceSummary,
  type StoredPreWriteSnapshotCompareResult,
} from "./sameIdCoexistenceFailureAnalysisTypes";

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

export function classifySameIdCoexistencePostWriteFailure(input: {
  storedRollbackAttempted: boolean;
  storedRollbackSucceeded: boolean;
  legacyVerification: LegacyBatchAccountAppendVerificationResult;
}): SameIdCoexistencePostWriteFailureClassification {
  if (!input.storedRollbackAttempted) {
    return {
      outcome: "repair-required",
      reason: "stored-rollback-not-attempted",
      successAllowed: false,
    };
  }

  if (!input.storedRollbackSucceeded) {
    return {
      outcome: "repair-required",
      reason: "stored-rollback-failed",
      successAllowed: false,
    };
  }

  if (input.legacyVerification.status === "parsed-row-committed") {
    return {
      outcome: "repair-required",
      reason: "legacy-parsed-row-committed",
      successAllowed: false,
    };
  }

  if (input.legacyVerification.status === "malformed-tail") {
    return {
      outcome: "repair-required",
      reason: "legacy-malformed-tail",
      successAllowed: false,
    };
  }

  return {
    outcome: "rollback-recovery-unproven",
    reason: "legacy-no-committed-row-observed",
    successAllowed: false,
  };
}

function toLegacyBatchEvidenceSummary(
  batch: V3ImportBatch | undefined,
): SameIdCoexistenceOperatorEvidenceSnapshot["legacyVerification"]["latestParsedBatch"] | undefined {
  if (!batch) return undefined;
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    ...(asString(batch.accountId) ? { accountId: asString(batch.accountId) } : {}),
    ...(asString(batch.accountHint) ? { accountHint: asString(batch.accountHint) } : {}),
  };
}

export function buildSameIdCoexistenceOperatorEvidenceSnapshot(input: {
  batchId: string;
  targetAccountId: string;
  storedRollbackAttempted: boolean;
  storedRollbackSucceeded: boolean;
  legacyVerification: LegacyBatchAccountAppendVerificationResult;
  storedCurrentBindingAccountId?: string | null;
}): SameIdCoexistenceOperatorEvidenceSnapshot {
  const classification = classifySameIdCoexistencePostWriteFailure({
    storedRollbackAttempted: input.storedRollbackAttempted,
    storedRollbackSucceeded: input.storedRollbackSucceeded,
    legacyVerification: input.legacyVerification,
  });
  const safeBatchId = sanitizeRecordId(input.batchId);
  const safeTargetAccountId = normalizeAccountId(input.targetAccountId);
  const storedCurrentBindingProvided = input.storedCurrentBindingAccountId !== undefined;
  const storedCurrentBindingAccountId = asString(input.storedCurrentBindingAccountId);
  const latestParsedBatch = toLegacyBatchEvidenceSummary(input.legacyVerification.latestParsedBatch);

  return {
    batchId: safeBatchId,
    targetAccountId: safeTargetAccountId,
    outcome: classification.outcome,
    reason: classification.reason,
    successAllowed: false,
    rollback: {
      attempted: input.storedRollbackAttempted,
      succeeded: input.storedRollbackSucceeded,
    },
    legacyVerification: {
      status: input.legacyVerification.status,
      noWriteProof: "not-proven",
      ...(latestParsedBatch ? { latestParsedBatch } : {}),
    },
    ...(storedCurrentBindingProvided
      ? {
          storedCurrentBinding: {
            accountId: storedCurrentBindingAccountId || null,
          },
        }
      : {}),
  };
}

export async function readStoredCurrentBatchBindingEvidence(
  batchId: string,
): Promise<StoredCurrentBindingEvidenceSummary | null> {
  const meta = await getBatchMeta(batchId).catch(() => null);
  if (!meta) return null;
  return {
    accountId: asString(meta.accounts?.[0]?.id) || null,
  };
}

export function compareStoredPreWriteSnapshotToCurrentBinding(input: {
  preWriteAccountId?: string | null;
  currentBinding?: StoredCurrentBindingEvidenceSummary | null;
}): StoredPreWriteSnapshotCompareResult {
  const preWriteAccountId = asString(input.preWriteAccountId);
  if (!preWriteAccountId) {
    return {
      status: "snapshot-missing",
      preWriteAccountId: null,
      currentAccountId: input.currentBinding?.accountId ?? null,
    };
  }

  const currentAccountId = asString(input.currentBinding?.accountId);
  if (preWriteAccountId === currentAccountId) {
    return {
      status: "matched-prewrite",
      preWriteAccountId,
      currentAccountId: currentAccountId || null,
    };
  }

  return {
    status: "drifted-from-prewrite",
    preWriteAccountId,
    currentAccountId: currentAccountId || null,
  };
}

export async function runSameIdCoexistenceSecondaryFailureRouteLocalWorker(input: {
  batchId: string;
  targetAccountId: string;
  storedRollbackAttempted: boolean;
  storedRollbackSucceeded: boolean;
  storedCurrentBindingAccountId?: string | null;
  storedPreWriteAccountId?: string | null;
}): Promise<SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult> {
  const legacyVerification = await verifyLegacyBatchAccountAppendPostWrite({
    batchId: input.batchId,
    accountId: input.targetAccountId,
  });
  const storedCurrentBinding = input.storedCurrentBindingAccountId !== undefined
    ? { accountId: asString(input.storedCurrentBindingAccountId) || null }
    : await readStoredCurrentBatchBindingEvidence(input.batchId);
  const failure = classifySameIdCoexistencePostWriteFailure({
    storedRollbackAttempted: input.storedRollbackAttempted,
    storedRollbackSucceeded: input.storedRollbackSucceeded,
    legacyVerification,
  });
  const operatorEvidence = buildSameIdCoexistenceOperatorEvidenceSnapshot({
    batchId: input.batchId,
    targetAccountId: input.targetAccountId,
    storedRollbackAttempted: input.storedRollbackAttempted,
    storedRollbackSucceeded: input.storedRollbackSucceeded,
    storedCurrentBindingAccountId: storedCurrentBinding?.accountId,
    legacyVerification,
  });
  const storedPreWriteCompare = input.storedPreWriteAccountId !== undefined
    ? compareStoredPreWriteSnapshotToCurrentBinding({
      preWriteAccountId: input.storedPreWriteAccountId,
      currentBinding: storedCurrentBinding,
    })
    : undefined;

  return {
    legacyVerification,
    failure,
    operatorEvidence,
    ...(storedPreWriteCompare ? { storedPreWriteCompare } : {}),
  };
}

export function buildSameIdCoexistenceOperatorRepairPayload(
  input: SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult,
): SameIdCoexistenceOperatorRepairPayload {
  return {
    batchId: input.operatorEvidence.batchId,
    targetAccountId: input.operatorEvidence.targetAccountId,
    outcome: input.failure.outcome,
    reason: input.failure.reason,
    successAllowed: false,
    rollback: {
      attempted: input.operatorEvidence.rollback.attempted,
      succeeded: input.operatorEvidence.rollback.succeeded,
    },
    legacyVerification: input.operatorEvidence.legacyVerification,
    ...(input.operatorEvidence.storedCurrentBinding
      ? { storedCurrentBinding: input.operatorEvidence.storedCurrentBinding }
      : {}),
    ...(input.storedPreWriteCompare ? { storedPreWriteCompare: input.storedPreWriteCompare } : {}),
  };
}
