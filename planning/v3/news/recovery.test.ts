import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { previewRecoveryAction, runRecoveryAction, NEWS_RECOVERY_RECOMPUTE_DAYS } from "./recovery";
import {
  readDailyStats,
  readScenariosCache,
  readTodayCache,
  readTrendsCache,
  upsertItems,
} from "./store";
import { shiftKstDay, toKstDayKey } from "./trend";

describe("planning v3 news recovery", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds preview summary for both actions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-recovery-preview-"));
    roots.push(root);
    upsertItems(FIXTURE_ITEMS, root);

    const now = new Date(FIXTURE_NOW_ISO);
    const cachePreview = previewRecoveryAction("rebuild_caches", { rootDir: root, now });
    const trendPreview = previewRecoveryAction("recompute_trends", { rootDir: root, now });

    expect(cachePreview.action).toBe("rebuild_caches");
    expect(cachePreview.writeTargets.length).toBeGreaterThanOrEqual(5);
    expect(cachePreview.notes.length).toBeGreaterThan(0);

    expect(trendPreview.action).toBe("recompute_trends");
    expect(trendPreview.dailyDays).toBe(NEWS_RECOVERY_RECOMPUTE_DAYS);
    expect(trendPreview.writeTargets.length).toBeGreaterThanOrEqual(3);
  });

  it("rebuilds today/scenario/trend caches without touching primary items", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-recovery-cache-"));
    roots.push(root);
    upsertItems(FIXTURE_ITEMS, root);

    const now = new Date(FIXTURE_NOW_ISO);
    const result = runRecoveryAction("rebuild_caches", { rootDir: root, now });

    expect(result.action).toBe("rebuild_caches");
    expect(result.wroteCount).toBeGreaterThanOrEqual(6);

    const today = readTodayCache(root);
    expect(today?.date).toBe(toKstDayKey(now));
    expect(today?.scenarios.cards.length).toBe(3);

    const scenarios = readScenariosCache(root);
    expect(scenarios?.scenarios.cards.length).toBe(3);

    const trends7 = readTrendsCache(7, root);
    expect(trends7).not.toBeNull();
  });

  it("recomputes rolling daily stats and updates trend caches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-recovery-trend-"));
    roots.push(root);
    upsertItems(FIXTURE_ITEMS, root);

    const now = new Date(FIXTURE_NOW_ISO);
    const result = runRecoveryAction("recompute_trends", { rootDir: root, now });
    const todayKst = toKstDayKey(now);
    const firstKst = shiftKstDay(todayKst, -(NEWS_RECOVERY_RECOMPUTE_DAYS - 1));

    expect(result.action).toBe("recompute_trends");
    expect(result.dailyDays).toBe(NEWS_RECOVERY_RECOMPUTE_DAYS);
    expect(result.wroteCount).toBe(NEWS_RECOVERY_RECOMPUTE_DAYS + 2);

    const firstDay = readDailyStats(firstKst, root);
    const todayDay = readDailyStats(todayKst, root);
    expect(Array.isArray(firstDay)).toBe(true);
    expect(Array.isArray(todayDay)).toBe(true);

    const trends30 = readTrendsCache(30, root);
    expect(trends30?.date).toBe(todayKst);
  });
});
