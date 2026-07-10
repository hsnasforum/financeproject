import { prisma } from "@/lib/db/prisma";
import {
  clearFinlifeSyncAttempt,
  loadFinlifeSyncAttempt,
  saveFinlifeSnapshot,
  saveFinlifeSyncAttempt,
  type FinlifeSnapshot,
  type FinlifeSnapshotKind,
} from "@/lib/finlife/snapshot";
import {
  collectFinlifeSnapshot,
  type FinlifeCollectionResult,
  type FinlifeSyncResult,
} from "@/lib/finlife/syncRunner";
import {
  persistFinlifeSyncKind,
  syncFinlifeProductsToDb,
  writeFinlifeCompletionEvidence,
  type FinlifePersistenceInput,
} from "../../../scripts/finlife_persistence.mjs";

type PersistentSyncDependencies = {
  collectSnapshot: (kind: FinlifeSnapshotKind) => Promise<FinlifeCollectionResult>;
  loadSyncAttempt: typeof loadFinlifeSyncAttempt;
  persistSnapshot: (input: FinlifePersistenceInput) => Promise<unknown>;
};

function failure(
  kind: FinlifeSnapshotKind,
  code: string,
  message: string,
): FinlifeSyncResult {
  return {
    ok: false,
    kind,
    error: {
      code,
      message,
      upstreamStatus: null,
    },
  };
}

async function persistWithRuntimeAdapters(input: FinlifePersistenceInput): Promise<unknown> {
  return persistFinlifeSyncKind(input, {
    syncProductsToDb: (kind, items, options) => syncFinlifeProductsToDb(kind, items, {
      ...options,
      getPrismaClient: () => prisma,
    }),
    writeCompletionEvidence: (evidence) => writeFinlifeCompletionEvidence(evidence, {
      getPrismaClient: () => prisma,
    }),
    writeSnapshot: saveFinlifeSnapshot,
    writeSyncAttempt: saveFinlifeSyncAttempt,
    clearSyncAttempt: clearFinlifeSyncAttempt,
  });
}

export function createFinlifePersistentSync(
  dependencies: PersistentSyncDependencies,
): (kind: FinlifeSnapshotKind) => Promise<FinlifeSyncResult> {
  const inFlight = new Map<FinlifeSnapshotKind, Promise<FinlifeSyncResult>>();

  return function run(kind) {
    const existing = inFlight.get(kind);
    if (existing) return existing;

    const pending = (async (): Promise<FinlifeSyncResult> => {
      const collected = await dependencies.collectSnapshot(kind);
      if (!collected.ok) return collected;

      const { snapshot } = collected;
      if (snapshot.meta.source !== "finlife" || snapshot.meta.fallbackUsed === true) {
        return failure(
          kind,
          "UNVERIFIED_SOURCE",
          "FINLIFE refresh did not return verified live data",
        );
      }

      if (dependencies.loadSyncAttempt(kind)) {
        return failure(
          kind,
          "SYNC_ATTEMPT_ACTIVE",
          "FINLIFE sync attempt is already active or awaiting recovery",
        );
      }

      try {
        await dependencies.persistSnapshot({
          kind,
          snapshot: snapshot as FinlifeSnapshot,
          provenance: { mode: "live" },
        });
      } catch {
        return failure(
          kind,
          "PERSISTENCE_FAILED",
          "FINLIFE refresh persistence failed",
        );
      }

      return {
        ok: true,
        kind,
        meta: snapshot.meta,
      };
    })().finally(() => {
      inFlight.delete(kind);
    });

    inFlight.set(kind, pending);
    return pending;
  };
}

export const runFinlifePersistentSync = createFinlifePersistentSync({
  collectSnapshot: collectFinlifeSnapshot,
  loadSyncAttempt: loadFinlifeSyncAttempt,
  persistSnapshot: persistWithRuntimeAdapters,
});
