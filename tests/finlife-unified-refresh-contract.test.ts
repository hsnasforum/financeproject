import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFinlifeSnapshot: vi.fn(),
  loadFinlifeSyncAttempt: vi.fn(),
  shouldRunFinlifeSync: vi.fn(),
  runFinlifeSnapshotSync: vi.fn(),
}));

vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: mocks.loadFinlifeSnapshot,
  loadFinlifeSyncAttempt: mocks.loadFinlifeSyncAttempt,
}));

vi.mock("@/lib/finlife/syncPolicy", () => ({
  shouldRunFinlifeSync: mocks.shouldRunFinlifeSync,
}));

vi.mock("@/lib/finlife/syncRunner", () => ({
  runFinlifeSnapshotSync: mocks.runFinlifeSnapshotSync,
}));

import { refreshFinlifeSnapshotIfStale } from "../src/lib/sources/unifiedLoaders";

describe("unified FINLIFE refresh persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.shouldRunFinlifeSync).not.toHaveBeenCalled();
    expect(mocks.runFinlifeSnapshotSync).not.toHaveBeenCalled();
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
});
