import { describe, expect, it, vi } from "vitest";
import {
  FinlifeSyncPersistenceError,
  persistFinlifeSyncKind,
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

describe("FINLIFE sync persistence contract", () => {
  it("writes the snapshot only after the DB sync completes", async () => {
    const calls: string[] = [];
    const dbSync = {
      providersUpserted: 1,
      productsUpserted: 1,
      optionsWritten: 0,
      skippedCrossKindDuplicates: 0,
      replacedCrossKindDuplicates: 0,
    };
    const syncProductsToDb = vi.fn(async () => {
      calls.push("db");
      return dbSync;
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
      "attempt:running:snapshot",
      "snapshot",
      "attempt:clear",
    ]);
    expect(syncProductsToDb).toHaveBeenCalledWith("deposit", value.items, expect.objectContaining({
      priorityByKind: expect.any(Map),
    }));
    expect(writeSnapshot).toHaveBeenCalledWith("deposit", value);
  });

  it("keeps the previous snapshot when the DB sync fails", async () => {
    const writeSnapshot = vi.fn();
    const writeSyncAttempt = vi.fn();
    const clearSyncAttempt = vi.fn();

    const rejected = persistFinlifeSyncKind({
      kind: "saving",
      snapshot: snapshot(),
    }, {
      syncProductsToDb: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
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
});
