import { describe, expect, it } from "vitest";
import { shouldSyncSnapshot } from "../../../src/lib/planning/ops/shouldSyncSnapshot";

describe("shouldSyncSnapshot", () => {
  it("attempts sync when snapshot is missing", () => {
    const result = shouldSyncSnapshot({
      snapshot: null,
      nowIso: "2026-02-28T00:00:00.000Z",
      staleThresholdDays: 45,
    });
    expect(result.attempt).toBe(true);
    expect(result.reason).toBe("SNAPSHOT_MISSING");
  });

  it("skips sync when snapshot is fresh", () => {
    const result = shouldSyncSnapshot({
      snapshot: { fetchedAt: "2026-02-18T00:00:00.000Z" },
      nowIso: "2026-02-28T00:00:00.000Z",
      staleThresholdDays: 45,
    });
    expect(result.attempt).toBe(false);
    expect(result.staleDays).toBe(10);
  });

  it("attempts sync when snapshot is stale", () => {
    const result = shouldSyncSnapshot({
      snapshot: { fetchedAt: "2025-12-30T00:00:00.000Z" },
      nowIso: "2026-02-28T00:00:00.000Z",
      staleThresholdDays: 45,
    });
    expect(result.attempt).toBe(true);
    expect(result.staleDays).toBe(60);
  });
});
