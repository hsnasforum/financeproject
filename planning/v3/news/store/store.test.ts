import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NewsItem, type RuntimeState } from "../contracts";
import {
  hasItem,
  readDailyStatsLastNDays,
  readScenariosCache,
  readState,
  readTodayCache,
  readTrendsCache,
  resolveItemsDir,
  resolveStatePath,
  upsertItems,
  writeDailyStats,
  writeScenariosCache,
  writeState,
  writeTodayCache,
  writeTrendsCache,
} from "./index";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function makeItem(id: string): NewsItem {
  return {
    id,
    sourceId: "test-source",
    title: `title-${id}`,
    url: `https://example.com/${id}`,
    fetchedAt: "2026-03-04T10:00:00.000Z",
  };
}

describe("planning v3 news store", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
  });

  it("writes items and state in .data/news-compatible layout", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-store-"));
    roots.push(root);

    expect(hasItem("a1", root)).toBe(false);

    const first = upsertItems([makeItem("a1"), makeItem("a2"), makeItem("a1")], root);
    expect(first.itemsNew).toBe(2);
    expect(first.itemsDeduped).toBe(1);

    expect(hasItem("a1", root)).toBe(true);
    expect(hasItem("a2", root)).toBe(true);

    const second = upsertItems([makeItem("a1")], root);
    expect(second.itemsNew).toBe(0);
    expect(second.itemsDeduped).toBe(1);

    const itemsDir = resolveItemsDir(root);
    const files = fs.readdirSync(itemsDir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBe(2);
    const stored = JSON.parse(fs.readFileSync(path.join(itemsDir, files[0]), "utf-8")) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["fetchedAt", "id", "sourceId", "title", "url"]);

    const state: RuntimeState = {
      lastRunAt: "2026-03-04T10:00:00.000Z",
      sources: {
        "test-source": {
          etag: 'W/"etag"',
          lastModified: "Wed, 04 Mar 2026 10:00:00 GMT",
          lastRunAt: "2026-03-04T10:00:00.000Z",
        },
      },
    };

    writeState(state, root);
    expect(fs.existsSync(resolveStatePath(root))).toBe(true);

    const reloaded = readState(root);
    expect(reloaded.lastRunAt).toBe("2026-03-04T10:00:00.000Z");
    expect(reloaded.sources["test-source"]?.etag).toBe('W/"etag"');

    writeDailyStats("2026-03-03", [{
      dateKst: "2026-03-03",
      topicId: "rates",
      topicLabel: "금리",
      count: 1,
      scoreSum: 1,
      sourceDiversity: 1,
      baselineMean: 0,
      baselineStddev: 0,
      burstZ: 0,
      burstGrade: "Low",
    }], root);
    writeDailyStats("2026-03-04", [{
      dateKst: "2026-03-04",
      topicId: "rates",
      topicLabel: "금리",
      count: 2,
      scoreSum: 3,
      sourceDiversity: 0.5,
      baselineMean: 1,
      baselineStddev: 0,
      burstZ: 1,
      burstGrade: "Med",
    }], root);
    const recent = readDailyStatsLastNDays({
      toDateKst: "2026-03-04",
      days: 2,
      rootDir: root,
    });
    expect(recent).toHaveLength(2);
  });

  it("writes and reads today/trends/scenarios caches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-cache-"));
    roots.push(root);

    writeTodayCache({
      generatedAt: "2026-03-04T10:00:00.000Z",
      date: "2026-03-04",
      lastRefreshedAt: "2026-03-04T10:00:00.000Z",
      digest: {
        date: "2026-03-04",
        observation: "관찰",
        evidence: [{
          title: "기사",
          url: "https://example.com/a",
          sourceId: "fixture",
          publishedAt: null,
          topics: ["rates"],
        }],
        watchlist: ["USDKRW"],
        counterSignals: ["완화 신호"],
      },
      scenarios: {
        generatedAt: "2026-03-04T10:00:00.000Z",
        cards: [{
          name: "Base",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "med", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }, {
          name: "Bull",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "low", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }, {
          name: "Bear",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "high", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }],
      },
    }, root);

    writeTrendsCache({
      generatedAt: "2026-03-04T10:00:00.000Z",
      date: "2026-03-04",
      windowDays: 7,
      topics: [{
        topicId: "rates",
        topicLabel: "금리",
        count: 3,
        burstGrade: "Med",
        sourceDiversity: 0.5,
      }],
    }, root);

    writeScenariosCache({
      generatedAt: "2026-03-04T10:00:00.000Z",
      lastRefreshedAt: "2026-03-04T10:00:00.000Z",
      scenarios: {
        generatedAt: "2026-03-04T10:00:00.000Z",
        cards: [{
          name: "Base",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "med", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }, {
          name: "Bull",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "low", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }, {
          name: "Bear",
          observation: "관찰",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "high", note: "rates" }],
          invalidation: ["무효화"],
          indicators: ["rates"],
          options: ["옵션"],
          linkedTopics: ["rates"],
        }],
      },
    }, root);

    const today = readTodayCache(root);
    expect(today?.date).toBe("2026-03-04");
    expect(today?.digest.watchlist[0]).toBe("USDKRW");

    const trends = readTrendsCache(7, root);
    expect(trends?.topics[0]?.topicId).toBe("rates");

    const scenarios = readScenariosCache(root);
    expect(scenarios?.scenarios.cards).toHaveLength(3);
  });

  it("uses PLANNING_DATA_DIR for default root at call time", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-env-default-"));
    roots.push(root);
    env.PLANNING_DATA_DIR = path.join(root, "planning");

    expect(resolveItemsDir()).toBe(path.join(root, "news", "items"));
    expect(resolveStatePath()).toBe(path.join(root, "news", "state.json"));

    const state: RuntimeState = {
      lastRunAt: "2026-03-05T09:00:00.000Z",
      sources: {},
    };

    upsertItems([makeItem("env-default")]);
    writeState(state);

    expect(hasItem("env-default")).toBe(true);
    expect(readState().lastRunAt).toBe("2026-03-05T09:00:00.000Z");
    expect(fs.existsSync(path.join(root, "news", "items", "env-default.json"))).toBe(true);
  });
});
