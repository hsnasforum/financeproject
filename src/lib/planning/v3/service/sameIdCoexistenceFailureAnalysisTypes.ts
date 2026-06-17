import { type V3ImportBatch } from "../domain/transactions";
import {
  type LegacyBatchAccountAppendVerificationResult,
  type LegacyBatchAccountAppendVerificationStatus,
} from "./transactionStore";

export type SameIdCoexistencePostWriteFailureOutcome =
  | "repair-required"
  | "rollback-recovery-unproven";

export type SameIdCoexistencePostWriteFailureReason =
  | "stored-rollback-not-attempted"
  | "stored-rollback-failed"
  | "legacy-parsed-row-committed"
  | "legacy-malformed-tail"
  | "legacy-no-committed-row-observed";

export type SameIdCoexistencePostWriteFailureClassification = {
  outcome: SameIdCoexistencePostWriteFailureOutcome;
  reason: SameIdCoexistencePostWriteFailureReason;
  successAllowed: false;
};

export type SameIdCoexistenceOperatorEvidenceSnapshot = {
  batchId: string;
  targetAccountId: string;
  outcome: SameIdCoexistencePostWriteFailureOutcome;
  reason: SameIdCoexistencePostWriteFailureReason;
  successAllowed: false;
  rollback: {
    attempted: boolean;
    succeeded: boolean;
  };
  legacyVerification: {
    status: LegacyBatchAccountAppendVerificationStatus;
    noWriteProof: "not-proven";
    latestParsedBatch?: Pick<V3ImportBatch, "id" | "createdAt" | "accountId" | "accountHint">;
  };
  storedCurrentBinding?: {
    accountId: string | null;
  };
};

export type StoredCurrentBindingEvidenceSummary = {
  accountId: string | null;
};

export type StoredPreWriteSnapshotCompareStatus =
  | "matched-prewrite"
  | "drifted-from-prewrite"
  | "snapshot-missing";

export type StoredPreWriteSnapshotCompareResult = {
  status: StoredPreWriteSnapshotCompareStatus;
  preWriteAccountId: string | null;
  currentAccountId: string | null;
};

export type SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult = {
  legacyVerification: LegacyBatchAccountAppendVerificationResult;
  failure: SameIdCoexistencePostWriteFailureClassification;
  operatorEvidence: SameIdCoexistenceOperatorEvidenceSnapshot;
  storedPreWriteCompare?: StoredPreWriteSnapshotCompareResult;
};

export type SameIdCoexistenceOperatorRepairPayload = {
  batchId: string;
  targetAccountId: string;
  outcome: SameIdCoexistencePostWriteFailureOutcome;
  reason: SameIdCoexistencePostWriteFailureReason;
  successAllowed: false;
  rollback: {
    attempted: boolean;
    succeeded: boolean;
  };
  legacyVerification: SameIdCoexistenceOperatorEvidenceSnapshot["legacyVerification"];
  storedCurrentBinding?: SameIdCoexistenceOperatorEvidenceSnapshot["storedCurrentBinding"];
  storedPreWriteCompare?: StoredPreWriteSnapshotCompareResult;
};
