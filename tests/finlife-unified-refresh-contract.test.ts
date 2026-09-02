import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFinlifeSnapshot: vi.fn(),
  loadFinlifeSyncAttempt: vi.fn(),
  readFinlifeCompletionEvidence: vi.fn(),
  shouldRunFinlifeSync: vi.fn(),
  runFinlifePersistentSync: vi.fn(),
}));

vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: mocks.loadFinlifeSnapshot,
  loadFinlifeSyncAttempt: mocks.loadFinlifeSyncAttempt,
}));

vi.mock("@/lib/finlife/completionEvidence", () => ({
  readFinlifeCompletionEvidence: mocks.readFinlifeCompletionEvidence,
}));

vi.mock("@/lib/finlife/syncPolicy", () => ({
  shouldRunFinlifeSync: mocks.shouldRunFinlifeSync,
}));

vi.mock("@/lib/finlife/persistentSync", () => ({
  runFinlifePersistentSync: mocks.runFinlifePersistentSync,
}));

import { refreshFinlifeSnapshotIfStale } from "../src/lib/sources/unifiedLoaders";

describe("unified FINLIFE refresh persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFinlifeCompletionEvidence.mockResolvedValue({ status: "missing" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not overwrite the snapshot while a DB sync attempt is incomplete", async () => {
    mocks.loadFinlifeSyncAttempt.mockReturnValue({
      status: "failed",
      phase: "db",
      startedAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:01.000Z",
      errorCode: "DB_SYNC_FAILED",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await refreshFinlifeSnapshotIfStale("deposit", true);

    expect(mocks.loadFinlifeSnapshot).not.toHaveBeenCalled();
    expect(mocks.readFinlifeCompletionEvidence).not.toHaveBeenCalled();
    expect(mocks.shouldRunFinlifeSync).not.toHaveBeenCalled();
    expect(mocks.runFinlifePersistentSync).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[unified] finlife snapshot refresh skipped for incomplete DB sync",
      expect.objectContaining({
        kind: "deposit",
        status: "failed",
        phase: "db",
        errorCode: "DB_SYNC_FAILED",
      }),
    );
  });

  it("uses completed DB evidence instead of a newer snapshot for the refresh decision", async () => {
    mocks.loadFinlifeSyncAttempt.mockReturnValue(null);
    mocks.readFinlifeCompletionEvidence.mockResolvedValue({
      status: "found",
      state: "complete",
      lastSyncedAt: new Date("2026-07-01T00:00:01.000Z"),
      ttlMs: 43_200_000,
      meta: {
        source: "finlife",
        fallbackUsed: false,
        truncatedByHardCap: false,
        completionRate: 1,
      },
    });
    mocks.loadFinlifeSnapshot.mockReturnValue({
      meta: {
        generatedAt: "2026-07-10T00:00:00.000Z",
        ttlMs: 43_200_000,
        completionRate: 1,
      },
      items: [{ fin_prdt_cd: "FIN-001" }],
    });
    mocks.shouldRunFinlifeSync.mockReturnValue({ shouldRun: false, reason: "fresh" });

    await refreshFinlifeSnapshotIfStale("deposit", true);

    expect(mocks.shouldRunFinlifeSync).toHaveBeenCalledWith({
      generatedAt: "2026-07-01T00:00:01.000Z",
      completionRate: 1,
    }, expect.any(Number), {
      ttlMs: 43_200_000,
      minCompletionRate: 0.95,
    });
    expect(mocks.runFinlifePersistentSync).not.toHaveBeenCalled();
  });

  it("does not fetch upstream data when completion evidence storage is unavailable", async () => {
    mocks.loadFinlifeSyncAttempt.mockReturnValue(null);
    mocks.readFinlifeCompletionEvidence.mockResolvedValue({
      status: "error",
      error: new Error("database unavailable"),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await refreshFinlifeSnapshotIfStale("saving", true);

    expect(mocks.loadFinlifeSnapshot).not.toHaveBeenCalled();
    expect(mocks.shouldRunFinlifeSync).not.toHaveBeenCalled();
    expect(mocks.runFinlifePersistentSync).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[unified] finlife refresh skipped because completion evidence is unavailable",
      {
        kind: "saving",
        message: "database unavailable",
      },
    );
  });

  it("keeps the unified query flow available when the runner reports an upstream failure", async () => {
    mocks.loadFinlifeSyncAttempt.mockReturnValue(null);
    mocks.loadFinlifeSnapshot.mockReturnValue({
      meta: {
        generatedAt: "2026-07-01T00:00:00.000Z",
        ttlMs: 43_200_000,
        completionRate: 1,
      },
      items: [{ fin_prdt_cd: "FIN-001" }],
    });
    mocks.shouldRunFinlifeSync.mockReturnValue({
      shouldRun: true,
      reason: "stale_snapshot",
    });
    mocks.runFinlifePersistentSync.mockResolvedValue({
      ok: false,
      kind: "deposit",
      error: {
        code: "UPSTREAM_FETCH_FAILED",
        message: "FINLIFE upstream fetch failed",
        upstreamStatus: 503,
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(refreshFinlifeSnapshotIfStale("deposit", true)).resolves.toEqual({ fallbackUsed: true });

    expect(mocks.runFinlifePersistentSync).toHaveBeenCalledWith("deposit");
    expect(consoleError).toHaveBeenCalledWith("[unified] finlife refresh failed", {
      kind: "deposit",
      code: "UPSTREAM_FETCH_FAILED",
      message: "FINLIFE upstream fetch failed",
      upstreamStatus: 503,
    });
  });

  it("keeps the unified query flow available when the refresh runner rejects", async () => {
    mocks.loadFinlifeSyncAttempt.mockReturnValue(null);
    mocks.loadFinlifeSnapshot.mockReturnValue({
      meta: {
        generatedAt: "2026-07-01T00:00:00.000Z",
        ttlMs: 43_200_000,
        completionRate: 1,
      },
      items: [{ fin_prdt_cd: "FIN-001" }],
    });
    mocks.shouldRunFinlifeSync.mockReturnValue({
      shouldRun: true,
      reason: "stale_snapshot",
    });
    mocks.runFinlifePersistentSync.mockRejectedValue(new Error("unexpected runner failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(refreshFinlifeSnapshotIfStale("saving", true)).resolves.toEqual({ fallbackUsed: true });

    expect(consoleError).toHaveBeenCalledWith("[unified] finlife refresh failed", {
      kind: "saving",
      code: "UNEXPECTED_REFRESH_ERROR",
      message: "unexpected runner failure",
      upstreamStatus: null,
    });
  });
});
