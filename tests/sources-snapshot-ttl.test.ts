import { describe, expect, it } from "vitest";
import { evaluateFreshness } from "../src/lib/sources/ttl";

describe("evaluateFreshness", () => {
  it("treats snapshot as stale once age exceeds ttl", () => {
    const nowMs = Date.UTC(2026, 1, 23, 10, 0, 0);
    const syncedAt = new Date(nowMs - 3_601_000);

    const fresh = evaluateFreshness(syncedAt, 3_600_000, nowMs);
    expect(fresh.isFresh).toBe(false);
    expect(fresh.ageMs).toBe(3_601_000);
  });

  it("applies minimum 60s ttl guard", () => {
    const nowMs = Date.UTC(2026, 1, 23, 10, 0, 0);
    const syncedAt = new Date(nowMs - 45_000);

    const fresh = evaluateFreshness(syncedAt, 10_000, nowMs);
    expect(fresh.isFresh).toBe(true);
  });
});
