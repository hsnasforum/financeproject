import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openNewsDatabase, closeNewsDatabase, resolveNewsDbPath, resolveNewsSearchIndexPath } from "../src/lib/news/storageSqlite";
import { searchNewsIndex, writeNewsSearchIndex } from "../src/lib/news/searchIndex";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

let root = "";

function insertItem(db: ReturnType<typeof openNewsDatabase>, row: {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  topicId: string;
  topicLabel: string;
  publishedAt: string;
  score: number;
}) {
  db.prepare(`
    INSERT INTO news_items (
      id, sourceId, sourceName, feedItemId, url, canonicalUrl, title, snippet, description,
      publishedAt, fetchedAt, contentHash, dedupeKey,
      sourceWeight, sourceScore, keywordScore, recencyScore, focusScore, totalScore,
      relativeScore, scorePartsJson, primaryTopicId, primaryTopicLabel, createdAt
    ) VALUES (
      @id, @sourceId, @sourceName, @feedItemId, @url, @canonicalUrl, @title, @snippet, @description,
      @publishedAt, @fetchedAt, @contentHash, @dedupeKey,
      @sourceWeight, @sourceScore, @keywordScore, @recencyScore, @focusScore, @totalScore,
      @relativeScore, @scorePartsJson, @primaryTopicId, @primaryTopicLabel, @createdAt
    )
  `).run({
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    feedItemId: `${row.id}-feed`,
    url: row.url,
    canonicalUrl: row.url,
    title: row.title,
    snippet: "",
    description: "",
    publishedAt: row.publishedAt,
    fetchedAt: row.publishedAt,
    contentHash: `${row.id}-hash`,
    dedupeKey: `${row.id}-dedupe`,
    sourceWeight: 1,
    sourceScore: 0.4,
    keywordScore: 0.3,
    recencyScore: 0.2,
    focusScore: 0.1,
    totalScore: row.score,
    relativeScore: row.score,
    scorePartsJson: JSON.stringify({
      source: 0.4,
      recency: 0.2,
      keyword: 0.3,
      burst: 0.1,
      diversityPenalty: 0,
      duplicatePenalty: 0,
    }),
    primaryTopicId: row.topicId,
    primaryTopicLabel: row.topicLabel,
    createdAt: row.publishedAt,
  });

  db.prepare(`
    INSERT INTO news_item_topics (
      itemId, topicId, topicLabel, score, isPrimary, keywordMatches, entityMatches, tfidfBoost
    ) VALUES (
      @itemId, @topicId, @topicLabel, @score, @isPrimary, @keywordMatches, @entityMatches, @tfidfBoost
    )
  `).run({
    itemId: row.id,
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    score: row.score,
    isPrimary: 1,
    keywordMatches: JSON.stringify(["기준금리"]),
    entityMatches: JSON.stringify(["bok"]),
    tfidfBoost: 0,
  });
}

describe("news search index", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-search-index-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes index and returns deterministic ranking", () => {
    const db = openNewsDatabase(resolveNewsDbPath());
    try {
      const published = "2026-03-04T00:00:00.000Z";
      insertItem(db, {
        id: "item-a",
        title: "A 기준금리 동결",
        url: "https://example.com/a",
        sourceId: "bok_press_all",
        sourceName: "한국은행",
        topicId: "rates",
        topicLabel: "금리/통화정책",
        publishedAt: published,
        score: 2.0,
      });
      insertItem(db, {
        id: "item-b",
        title: "B 기준금리 인상",
        url: "https://example.com/b",
        sourceId: "bok_press_all",
        sourceName: "한국은행",
        topicId: "rates",
        topicLabel: "금리/통화정책",
        publishedAt: published,
        score: 2.0,
      });
      insertItem(db, {
        id: "item-c",
        title: "환율 동향",
        url: "https://example.com/c",
        sourceId: "kosis_monthly_trend",
        sourceName: "KOSIS",
        topicId: "fx",
        topicLabel: "환율/대외",
        publishedAt: "2026-03-03T00:00:00.000Z",
        score: 1.2,
      });

      const index = writeNewsSearchIndex({ generatedAt: "2026-03-04T01:00:00.000Z", db });
      expect(index.itemCount).toBe(3);
      expect(fs.existsSync(resolveNewsSearchIndexPath())).toBe(true);

      const result = searchNewsIndex(index, {
        q: "기준금리",
        topics: ["rates"],
        minScore: 1.9,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      });
      expect(result.total).toBe(2);
      expect(result.items.map((row) => row.id)).toEqual(["item-a", "item-b"]);
      expect(result.items[0]?.rationale).toContain("최근성");
    } finally {
      closeNewsDatabase(db);
    }
  });

  it("filters by source deterministically", () => {
    const db = openNewsDatabase(resolveNewsDbPath());
    try {
      insertItem(db, {
        id: "item-rates",
        title: "기준금리 관련",
        url: "https://example.com/rates",
        sourceId: "bok_press_all",
        sourceName: "한국은행",
        topicId: "rates",
        topicLabel: "금리/통화정책",
        publishedAt: "2026-03-04T00:00:00.000Z",
        score: 1.4,
      });
      insertItem(db, {
        id: "item-fx",
        title: "환율 관련",
        url: "https://example.com/fx",
        sourceId: "kosis_monthly_trend",
        sourceName: "KOSIS",
        topicId: "fx",
        topicLabel: "환율/대외",
        publishedAt: "2026-03-04T00:00:00.000Z",
        score: 1.1,
      });
      const index = writeNewsSearchIndex({ generatedAt: "2026-03-04T01:00:00.000Z", db });
      const result = searchNewsIndex(index, {
        sources: ["bok_press_all"],
        days: 30,
      });
      expect(result.total).toBe(1);
      expect(result.items[0]?.sourceId).toBe("bok_press_all");
    } finally {
      closeNewsDatabase(db);
    }
  });
});
