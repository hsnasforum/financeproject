import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheStats,
  getCache,
  getCacheUsageStats,
  purgeExpired,
  recordCacheUsage,
  setCache,
} from "../../src/lib/planning/cache/storage";
import { type PlanningCacheEntry } from "../../src/lib/planning/cache/types";

const env = process.env as Record<string, string | undefined>;
const originalDir = process.env.PLANNING_CACHE_DIR;

describe("planning cache storage", () => {
  const root = path.join(process.cwd(), "tmp", "planning-cache-test");

  beforeEach(() => {
    env.PLANNING_CACHE_DIR = root;
    fs.rmSync(root, { recursive: true, force: true });
  });

  afterEach(() => {
    if (typeof originalDir === "string") env.PLANNING_CACHE_DIR = originalDir;
    else delete env.PLANNING_CACHE_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports set/get for valid non-expired entries", async () => {
    const entry: PlanningCacheEntry<{ value: number }> = {
      version: 1,
      kind: "simulate",
      key: "a".repeat(64),
      createdAt: "2026-02-28T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      meta: {
        horizonMonths: 120,
        assumptionsHash: "b".repeat(64),
        optionsHash: "c".repeat(64),
      },
      data: { value: 1 },
    };

    await setCache(entry);
    const loaded = await getCache<{ value: number }>("simulate", entry.key);

    expect(loaded?.data).toEqual({ value: 1 });
    expect((await cacheStats()).total).toBe(1);
  });

  it("treats expired entries as miss and purgeExpired removes them", async () => {
    await setCache({
      version: 1,
      kind: "actions",
      key: "d".repeat(64),
      createdAt: "2026-02-28T00:00:00.000Z",
      expiresAt: "2000-01-01T00:00:00.000Z",
      meta: {
        horizonMonths: 60,
        assumptionsHash: "e".repeat(64),
        optionsHash: "f".repeat(64),
      },
      data: { ok: true },
    });

    const loaded = await getCache("actions", "d".repeat(64));
    expect(loaded).toBeNull();

    const purgeResult = await purgeExpired();
    expect(purgeResult.purged).toBeGreaterThanOrEqual(0);
  });

  it("tracks cache usage stats for hit/miss", async () => {
    await recordCacheUsage("simulate", true);
    await recordCacheUsage("simulate", false);
    await recordCacheUsage("monteCarlo", true);

    const usage = await getCacheUsageStats();
    expect(usage.totals.hits).toBe(2);
    expect(usage.totals.misses).toBe(1);
    expect(usage.byKind.simulate.hits).toBe(1);
    expect(usage.byKind.simulate.misses).toBe(1);
    expect(usage.byKind.monteCarlo.hits).toBe(1);
  });
});
