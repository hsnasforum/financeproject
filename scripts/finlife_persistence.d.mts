import type {
  FinlifeSnapshot,
  FinlifeSnapshotKind,
  FinlifeSyncAttempt,
} from "../src/lib/finlife/snapshot";
import type { NormalizedProduct } from "../src/lib/finlife/types";

export type FinlifeDbSyncResult = {
  providersUpserted: number;
  productsUpserted: number;
  optionsWritten: number;
  skippedCrossKindDuplicates: number;
  replacedCrossKindDuplicates: number;
  candidateItems: number;
  inventoryItems: number | null;
  inventoryDeltaItems: number | null;
  staleCandidateItems: number | null;
};

export type FinlifePersistenceInput = {
  kind: FinlifeSnapshotKind;
  snapshot: FinlifeSnapshot;
  priorityByKind?: Map<string, number>;
  provenance?: {
    mode: "live" | "replay";
    replayFile?: string;
    dumpSchemaVersion?: number;
  };
};

export type FinlifeCompletionEvidenceInput = {
  state: "db-complete" | "complete";
  kind: string;
  ttlMs: number;
  startedAt: string;
  dbCompletedAt: string;
  snapshotCompletedAt?: string;
  fetchedItems: number;
  snapshotGeneratedAt?: string;
  completionRate?: number;
  truncatedByHardCap?: boolean;
  source?: string;
  fallbackUsed?: boolean;
  provenance?: FinlifePersistenceInput["provenance"];
  dbSync?: Partial<FinlifeDbSyncResult>;
};

type GetPrismaClient = () => Promise<unknown> | unknown;

export const PRIORITY_KIND_ORDER: string[];
export const KIND_PRIORITY: Map<string, number>;

export class FinlifeSyncPersistenceError extends Error {
  kind: string;
  phase: string;
}

export function syncFinlifeProductsToDb(
  kind: FinlifeSnapshotKind,
  items: NormalizedProduct[],
  options: {
    getPrismaClient: GetPrismaClient;
    priorityByKind?: Map<string, number>;
  },
): Promise<FinlifeDbSyncResult>;

export function writeFinlifeCompletionEvidence(
  input: FinlifeCompletionEvidenceInput,
  dependencies: { getPrismaClient: GetPrismaClient },
): Promise<unknown>;

export function persistFinlifeSyncKind(
  input: FinlifePersistenceInput,
  dependencies: {
    syncProductsToDb: (
      kind: FinlifeSnapshotKind,
      items: NormalizedProduct[],
      options: { priorityByKind: Map<string, number> },
    ) => Promise<FinlifeDbSyncResult>;
    writeCompletionEvidence: (input: FinlifeCompletionEvidenceInput) => Promise<unknown>;
    writeSnapshot: (kind: FinlifeSnapshotKind, snapshot: FinlifeSnapshot) => void;
    writeSyncAttempt: (kind: FinlifeSnapshotKind, attempt: FinlifeSyncAttempt) => void;
    clearSyncAttempt: (kind: FinlifeSnapshotKind) => void;
    nowIso?: () => string;
  },
): Promise<{ dbSync: FinlifeDbSyncResult; snapshotWritten: true }>;
