import {
  type SameIdCoexistenceOperatorRepairPayload,
  type SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult,
} from "./sameIdCoexistenceFailureAnalysisTypes";

export type SameIdCoexistenceSecondaryFailureWorkerInput = {
  batchId: string;
  targetAccountId: string;
  storedRollbackAttempted: boolean;
  storedRollbackSucceeded: boolean;
  storedPreWriteAccountId?: string | null;
};

export type SameIdCoexistenceLegacySecondWriteErrorSummary = {
  stage: "legacy-second-write";
  code: "legacy-second-write-failed" | "legacy-batch-missing";
  message: string;
};

export type SameIdCoexistenceRouteLocalSequencingTrace = {
  storedPreWriteAccountId: string | null;
  storedWrite: {
    attempted: boolean;
    succeeded: boolean;
    accountIdAfterWrite: string | null;
  };
  legacyWrite: {
    attempted: boolean;
    succeeded: boolean;
    accountIdAfterWrite: string | null;
    updatedTransactionCount: number;
  };
  storedRollback: {
    attempted: boolean;
    succeeded: boolean;
    accountIdAfterRollback: string | null;
  };
};

export type SameIdCoexistenceRouteLocalSequencingResult =
  | {
      status: "writes-completed";
      batchId: string;
      targetAccountId: string;
      trace: SameIdCoexistenceRouteLocalSequencingTrace;
    }
  | {
      status: "secondary-failure";
      batchId: string;
      targetAccountId: string;
      trace: SameIdCoexistenceRouteLocalSequencingTrace;
      legacySecondWriteError?: SameIdCoexistenceLegacySecondWriteErrorSummary;
      secondaryFailureWorkerInput: SameIdCoexistenceSecondaryFailureWorkerInput;
      secondaryFailure: SameIdCoexistenceSecondaryFailureRouteLocalWorkerResult;
      operatorRepairPayload: SameIdCoexistenceOperatorRepairPayload;
    };

export type SameIdCoexistenceWritesCompletedSequenceResult = Extract<
  SameIdCoexistenceRouteLocalSequencingResult,
  { status: "writes-completed" }
>;
