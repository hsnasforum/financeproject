import { describe, expect, it, vi } from "vitest";
import {
  FinlifeSyncPersistenceError,
  persistFinlifeSyncKind,
  writeFinlifeCompletionEvidence,
} from "../scripts/finlife_sync.mjs";

function snapshot() {
  return {
    meta: {
      generatedAt: "2026-07-10T00:00:00.000Z",
      ttlMs: 43_200_000,
      groupsScanned: ["020000"],
      pagesFetchedByGroup: { "020000": 1 },
      totalProducts: 1,
      totalOptions: 0,
      completionRate: 1,
      truncatedByHardCap: false,
      source: "finlife",
    },
    items: [{ fin_prdt_cd: "FIN-001", options: [], raw: {} }],
  };
}

function dbSyncResult() {
  return {
    providersUpserted: 1,
    productsUpserted: 1,
    optionsWritten: 0,
    skippedCrossKindDuplicates: 0,
    replacedCrossKindDuplicates: 0,
  };
}

describe("FINLIFE sync persistence contract", () => {
  it("writes the snapshot only after the DB sync and completion evidence finish", async () => {
    const calls: string[] = [];
    const dbSync = dbSyncResult();
    const syncProductsToDb = vi.fn(async () => {
      calls.push("db");
      return dbSync;
    });
    const writeCompletionEvidence = vi.fn(async (input: { state: string }) => {
      calls.push(`evidence:${input.state}`);
    });
    const writeSnapshot = vi.fn(() => {
      calls.push("snapshot");
    });
    const writeSyncAttempt = vi.fn((_kind: string, attempt: { status: string; phase: string }) => {
      calls.push(`attempt:${attempt.status}:${attempt.phase}`);
    });
    const clearSyncAttempt = vi.fn(() => {
      calls.push("attempt:clear");
    });
    const value = snapshot();

    await expect(persistFinlifeSyncKind({
      kind: "deposit",
      snapshot: value,
    }, {
      syncProductsToDb,
      writeCompletionEvidence,
      writeSnapshot,
      writeSyncAttempt,
      clearSyncAttempt,
    })).resolves.toEqual({
      dbSync,
      snapshotWritten: true,
    });

    expect(calls).toEqual([
      "attempt:running:db",
      "db",
      "evidence:db-complete",
      "attempt:running:snapshot",
      "snapshot",
      "attempt:running:completion",
      "evidence:complete",
      "attempt:clear",
    ]);
    expect(syncProductsToDb).toHaveBeenCalledWith("deposit", value.items, expect.objectContaining({
      priorityByKind: expect.any(Map),
    }));
    expect(writeCompletionEvidence).toHaveBeenNthCalledWith(1, expect.objectContaining({
      state: "db-complete",
      kind: "deposit",
      ttlMs: value.meta.ttlMs,
      fetchedItems: value.items.length,
      snapshotGeneratedAt: value.meta.generatedAt,
      completionRate: value.meta.completionRate,
      truncatedByHardCap: value.meta.truncatedByHardCap,
      source: value.meta.source,
      dbSync,
    }));
    expect(writeCompletionEvidence).toHaveBeenNthCalledWith(2, expect.objectContaining({
      state: "complete",
      kind: "deposit",
      dbCompletedAt: expect.any(String),
      snapshotCompletedAt: expect.any(String),
      dbSync,
    }));
    expect(writeSnapshot).toHaveBeenCalledWith("deposit", value);
  });

  it("keeps the previous snapshot when the DB sync fails", async () => {
    const writeSnapshot = vi.fn();
    const writeCompletionEvidence = vi.fn();
    const writeSyncAttempt = vi.fn();
    const clearSyncAttempt = vi.fn();

    const rejected = persistFinlifeSyncKind({
      kind: "saving",
      snapshot: snapshot(),
    }, {
      syncProductsToDb: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      writeCompletionEvidence,
      writeSnapshot,
      writeSyncAttempt,
      clearSyncAttempt,
    });

    await expect(rejected).rejects.toMatchObject({
      name: "FinlifeSyncPersistenceError",
      kind: "saving",
      phase: "db",
      message: expect.stringContaining("phase=db"),
    } satisfies Partial<FinlifeSyncPersistenceError>);
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(writeCompletionEvidence).not.toHaveBeenCalled();
    expect(writeSyncAttempt).toHaveBeenNthCalledWith(1, "saving", expect.objectContaining({
      status: "running",
      phase: "db",
    }));
    expect(writeSyncAttempt).toHaveBeenNthCalledWith(2, "saving", expect.objectContaining({
      status: "failed",
      phase: "db",
      errorCode: "DB_SYNC_FAILED",
    }));
    expect(clearSyncAttempt).not.toHaveBeenCalled();
  });

  it("keeps the previous snapshot when DB completion evidence cannot be recorded", async () => {
    const calls: string[] = [];
    const writeSyncAttempt = vi.fn((_kind: string, attempt: { status: string; phase: string }) => {
      calls.push(`attempt:${attempt.status}:${attempt.phase}`);
    });
    const writeSnapshot = vi.fn();
    const clearSyncAttempt = vi.fn();

    const rejected = persistFinlifeSyncKind({
      kind: "deposit",
      snapshot: snapshot(),
    }, {
      syncProductsToDb: vi.fn(async () => {
        calls.push("db");
        return dbSyncResult();
      }),
      writeCompletionEvidence: vi.fn(async (input: { state: string }) => {
        calls.push(`evidence:${input.state}`);
        throw new Error("completion evidence unavailable");
      }),
      writeSnapshot,
      writeSyncAttempt,
      clearSyncAttempt,
    });

    await expect(rejected).rejects.toMatchObject({
      name: "FinlifeSyncPersistenceError",
      kind: "deposit",
      phase: "db",
      message: expect.stringContaining("phase=db"),
    } satisfies Partial<FinlifeSyncPersistenceError>);
    expect(calls).toEqual([
      "attempt:running:db",
      "db",
      "evidence:db-complete",
      "attempt:failed:db",
    ]);
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(writeSyncAttempt).toHaveBeenLastCalledWith("deposit", expect.objectContaining({
      status: "failed",
      phase: "db",
      errorCode: "DB_SYNC_FAILED",
    }));
    expect(clearSyncAttempt).not.toHaveBeenCalled();
  });

  it("reports snapshot failure after a completed DB sync", async () => {
    const calls: string[] = [];
    const writeSyncAttempt = vi.fn((_kind: string, attempt: { status: string; phase: string }) => {
      calls.push(`attempt:${attempt.status}:${attempt.phase}`);
    });
    const clearSyncAttempt = vi.fn();

    const rejected = persistFinlifeSyncKind({
      kind: "deposit",
      snapshot: snapshot(),
    }, {
      syncProductsToDb: vi.fn(async () => {
        calls.push("db");
        return { productsUpserted: 1 };
      }),
      writeCompletionEvidence: vi.fn(async (input: { state: string }) => {
        calls.push(`evidence:${input.state}`);
      }),
      writeSnapshot: vi.fn(() => {
        calls.push("snapshot");
        throw new Error("snapshot disk full");
      }),
      writeSyncAttempt,
      clearSyncAttempt,
    });

    await expect(rejected).rejects.toMatchObject({
      name: "FinlifeSyncPersistenceError",
      kind: "deposit",
      phase: "snapshot",
      message: expect.stringContaining("phase=snapshot"),
    } satisfies Partial<FinlifeSyncPersistenceError>);
    expect(calls).toEqual([
      "attempt:running:db",
      "db",
      "evidence:db-complete",
      "attempt:running:snapshot",
      "snapshot",
      "attempt:failed:snapshot",
    ]);
    expect(writeSyncAttempt).toHaveBeenLastCalledWith("deposit", expect.objectContaining({
      status: "failed",
      phase: "snapshot",
      errorCode: "SNAPSHOT_WRITE_FAILED",
    }));
    expect(clearSyncAttempt).not.toHaveBeenCalled();
  });

  it("keeps an incomplete marker when final completion evidence cannot be recorded", async () => {
    const calls: string[] = [];
    const writeSyncAttempt = vi.fn((_kind: string, attempt: { status: string; phase: string }) => {
      calls.push(`attempt:${attempt.status}:${attempt.phase}`);
    });
    const clearSyncAttempt = vi.fn();

    const rejected = persistFinlifeSyncKind({
      kind: "saving",
      snapshot: snapshot(),
    }, {
      syncProductsToDb: vi.fn(async () => {
        calls.push("db");
        return dbSyncResult();
      }),
      writeCompletionEvidence: vi.fn(async (input: { state: string }) => {
        calls.push(`evidence:${input.state}`);
        if (input.state === "complete") throw new Error("final evidence unavailable");
      }),
      writeSnapshot: vi.fn(() => {
        calls.push("snapshot");
      }),
      writeSyncAttempt,
      clearSyncAttempt,
    });

    await expect(rejected).rejects.toMatchObject({
      name: "FinlifeSyncPersistenceError",
      kind: "saving",
      phase: "completion",
      message: expect.stringContaining("phase=completion"),
    } satisfies Partial<FinlifeSyncPersistenceError>);
    expect(calls).toEqual([
      "attempt:running:db",
      "db",
      "evidence:db-complete",
      "attempt:running:snapshot",
      "snapshot",
      "attempt:running:completion",
      "evidence:complete",
      "attempt:failed:completion",
    ]);
    expect(writeSyncAttempt).toHaveBeenLastCalledWith("saving", expect.objectContaining({
      status: "failed",
      phase: "completion",
      errorCode: "COMPLETION_WRITE_FAILED",
    }));
    expect(clearSyncAttempt).not.toHaveBeenCalled();
  });

  it("keeps generic freshness stale until snapshot completion and preserves replay provenance", async () => {
    const upsert = vi.fn(async () => ({ id: 1 }));
    const dbCompletedAt = "2026-07-10T00:05:00.000Z";
    const snapshotCompletedAt = "2026-07-10T00:06:00.000Z";
    const getPrismaClient = vi.fn(async () => ({
      externalSourceSnapshot: { upsert },
    }));

    const input = {
      kind: "pension",
      ttlMs: 43_200_000,
      startedAt: "2026-07-10T00:04:00.000Z",
      dbCompletedAt,
      fetchedItems: 3,
      snapshotGeneratedAt: "2026-07-10T00:03:00.000Z",
      completionRate: 0.97,
      truncatedByHardCap: false,
      source: "finlife",
      fallbackUsed: false,
      provenance: {
        mode: "replay",
        replayFile: "/private/source/finlife-pension.json",
        dumpSchemaVersion: 1,
      },
      dbSync: {
        providersUpserted: 2,
        productsUpserted: 3,
        optionsWritten: 4,
        skippedCrossKindDuplicates: 1,
        replacedCrossKindDuplicates: 0,
      },
    };

    await expect(writeFinlifeCompletionEvidence({
      ...input,
      state: "db-complete",
    }, { getPrismaClient })).resolves.toEqual({ id: 1 });
    await expect(writeFinlifeCompletionEvidence({
      ...input,
      state: "complete",
      snapshotCompletedAt,
    }, { getPrismaClient })).resolves.toEqual({ id: 1 });

    const baseMeta = {
      evidenceType: "finlife-prisma-product-sync",
      source: "finlife",
      fallbackUsed: false,
      snapshotGeneratedAt: "2026-07-10T00:03:00.000Z",
      completionRate: 0.97,
      truncatedByHardCap: false,
      provenance: {
        mode: "replay",
        replayFile: "finlife-pension.json",
        dumpSchemaVersion: 1,
      },
    };
    const runMeta = {
      startedAt: "2026-07-10T00:04:00.000Z",
      fetchedItems: 3,
      upsertedItems: 3,
      touchedItems: 3,
      totalCount: 3,
      providersUpserted: 2,
      optionsWritten: 4,
      skippedCrossKindDuplicates: 1,
      replacedCrossKindDuplicates: 0,
    };
    const dbMetaJson = expect.objectContaining({
      ...baseMeta,
      completionState: "db-complete",
      dbCompletedAt,
      snapshotCompletedAt: null,
      lastAttemptAt: dbCompletedAt,
      lastRun: expect.objectContaining({
        ...runMeta,
        resultCode: "DB_COMPLETED",
      }),
    });
    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind: "pension",
        },
      },
      update: {
        ttlMs: 43_200_000,
        metaJson: dbMetaJson,
      },
      create: {
        sourceId: "finlife",
        kind: "pension",
        lastSyncedAt: new Date(0),
        ttlMs: 43_200_000,
        metaJson: dbMetaJson,
      },
    });

    const completedMetaJson = expect.objectContaining({
      ...baseMeta,
      completionState: "complete",
      dbCompletedAt,
      snapshotCompletedAt,
      lastAttemptAt: snapshotCompletedAt,
      lastError: null,
      lastRun: expect.objectContaining({
        ...runMeta,
        finishedAt: snapshotCompletedAt,
        resultCode: "OK",
      }),
    });
    expect(upsert).toHaveBeenNthCalledWith(2, {
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind: "pension",
        },
      },
      update: {
        ttlMs: 43_200_000,
        metaJson: completedMetaJson,
        lastSyncedAt: new Date(snapshotCompletedAt),
      },
      create: {
        sourceId: "finlife",
        kind: "pension",
        lastSyncedAt: new Date(snapshotCompletedAt),
        ttlMs: 43_200_000,
        metaJson: completedMetaJson,
      },
    });
  });
});
