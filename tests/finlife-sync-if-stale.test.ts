import { describe, expect, it, vi } from "vitest";
import { evaluateFinlifeSyncNeed } from "../scripts/finlife_sync_if_stale.mjs";

describe("FINLIFE sync-if-stale incomplete attempt contract", () => {
  it("retries an incomplete attempt even while the previous snapshot is fresh", () => {
    const now = Date.now();
    const readSnapshot = vi.fn(() => ({
      meta: {
        generatedAt: new Date(now).toISOString(),
        completionRate: 1,
      },
    }));
    const readSyncAttempt = vi.fn(() => ({
      status: "failed",
      phase: "snapshot",
      startedAt: new Date(now - 1_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      errorCode: "SNAPSHOT_WRITE_FAILED",
    }));

    expect(evaluateFinlifeSyncNeed("deposit", 43_200_000, {
      readSnapshot,
      readSyncAttempt,
    })).toMatchObject({
      shouldRun: true,
      reason: "failed_attempt",
      attempt: {
        status: "failed",
        phase: "snapshot",
      },
    });
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("does not overlap an existing running sync attempt", () => {
    const readSnapshot = vi.fn();
    const attempt = {
      status: "running",
      phase: "db",
      startedAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:01.000Z",
    };

    expect(evaluateFinlifeSyncNeed("deposit", 43_200_000, {
      readSnapshot,
      readSyncAttempt: vi.fn(() => attempt),
    })).toEqual({
      shouldRun: false,
      reason: "running_attempt",
      attempt,
    });
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("keeps the existing snapshot freshness policy without an incomplete attempt", () => {
    const readSnapshot = vi.fn(() => ({
      meta: {
        generatedAt: new Date().toISOString(),
        completionRate: 1,
      },
    }));

    expect(evaluateFinlifeSyncNeed("saving", 43_200_000, {
      readSnapshot,
      readSyncAttempt: vi.fn(() => null),
    })).toEqual({
      shouldRun: false,
      reason: "snapshot_policy",
      attempt: null,
    });
  });
});
