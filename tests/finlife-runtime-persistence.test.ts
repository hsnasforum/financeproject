import { describe, expect, it, vi } from "vitest";

import { createFinlifePersistentSync } from "../src/lib/finlife/persistentSync";
import type { FinlifeCollectionResult } from "../src/lib/finlife/syncRunner";

function collected(input?: {
  source?: "finlife" | "mock";
  fallbackUsed?: boolean;
}): FinlifeCollectionResult {
  return {
    ok: true,
    kind: "deposit",
    snapshot: {
      meta: {
        generatedAt: "2026-07-10T00:00:00.000Z",
        ttlMs: 43_200_000,
        groupsScanned: ["020000"],
        pagesFetchedByGroup: { "020000": 1 },
        totalProducts: 1,
        totalOptions: 0,
        completionRate: 1,
        truncatedByHardCap: false,
        source: input?.source ?? "finlife",
        fallbackUsed: input?.fallbackUsed ?? false,
      },
      items: [{
        fin_prdt_cd: "FIN-001",
        options: [],
        raw: {},
      }],
    },
  };
}

describe("FINLIFE runtime persistent sync", () => {
  it("persists verified live collection through the shared kind contract", async () => {
    const value = collected();
    const persistSnapshot = vi.fn(async () => undefined);
    const run = createFinlifePersistentSync({
      collectSnapshot: vi.fn(async () => value),
      loadSyncAttempt: vi.fn(() => null),
      persistSnapshot,
    });

    await expect(run("deposit")).resolves.toEqual({
      ok: true,
      kind: "deposit",
      meta: value.ok ? value.snapshot.meta : undefined,
    });
    expect(persistSnapshot).toHaveBeenCalledWith({
      kind: "deposit",
      snapshot: value.ok ? value.snapshot : undefined,
      provenance: { mode: "live" },
    });
  });

  it("does not persist mock or fallback collection into the Product query store", async () => {
    const persistSnapshot = vi.fn(async () => undefined);
    const run = createFinlifePersistentSync({
      collectSnapshot: vi.fn(async () => collected({ source: "mock", fallbackUsed: true })),
      loadSyncAttempt: vi.fn(() => null),
      persistSnapshot,
    });

    await expect(run("deposit")).resolves.toMatchObject({
      ok: false,
      error: { code: "UNVERIFIED_SOURCE" },
    });
    expect(persistSnapshot).not.toHaveBeenCalled();
  });

  it("rechecks the attempt marker after collection before starting persistence", async () => {
    const persistSnapshot = vi.fn(async () => undefined);
    const run = createFinlifePersistentSync({
      collectSnapshot: vi.fn(async () => collected()),
      loadSyncAttempt: vi.fn(() => ({
        status: "running" as const,
        phase: "db" as const,
        startedAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:01.000Z",
      })),
      persistSnapshot,
    });

    await expect(run("deposit")).resolves.toMatchObject({
      ok: false,
      error: { code: "SYNC_ATTEMPT_ACTIVE" },
    });
    expect(persistSnapshot).not.toHaveBeenCalled();
  });

  it("coalesces concurrent refreshes for the same kind", async () => {
    let resolveCollection: ((value: FinlifeCollectionResult) => void) | undefined;
    const pendingCollection = new Promise<FinlifeCollectionResult>((resolve) => {
      resolveCollection = resolve;
    });
    const collectSnapshot = vi.fn(() => pendingCollection);
    const persistSnapshot = vi.fn(async () => undefined);
    const run = createFinlifePersistentSync({
      collectSnapshot,
      loadSyncAttempt: vi.fn(() => null),
      persistSnapshot,
    });

    const first = run("deposit");
    const second = run("deposit");
    expect(first).toBe(second);

    resolveCollection?.(collected());
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(collectSnapshot).toHaveBeenCalledTimes(1);
    expect(persistSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns a safe failure and leaves the persistence marker contract in the shared core", async () => {
    const run = createFinlifePersistentSync({
      collectSnapshot: vi.fn(async () => collected()),
      loadSyncAttempt: vi.fn(() => null),
      persistSnapshot: vi.fn(async () => {
        throw new Error("private database path");
      }),
    });

    await expect(run("deposit")).resolves.toEqual({
      ok: false,
      kind: "deposit",
      error: {
        code: "PERSISTENCE_FAILED",
        message: "FINLIFE refresh persistence failed",
        upstreamStatus: null,
      },
    });
  });
});
