import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/api/planning/v3/news/search/route";
import { closeNewsDatabase, openNewsDatabase, resolveNewsDbPath } from "../src/lib/news/storageSqlite";
import { writeNewsSearchIndex } from "../src/lib/news/searchIndex";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

let root = "";

function requestGet(pathname: string, host = LOCAL_HOST): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: { host },
  });
}

function seedSearchIndex() {
  const db = openNewsDatabase(resolveNewsDbPath());
  try {
    db.prepare(`
      INSERT INTO news_items (
        id, sourceId, sourceName, feedItemId, url, canonicalUrl, title, snippet, description,
        publishedAt, fetchedAt, contentHash, dedupeKey,
        sourceWeight, sourceScore, keywordScore, recencyScore, focusScore, totalScore,
        relativeScore, scorePartsJson, primaryTopicId, primaryTopicLabel, createdAt
      ) VALUES
      (
        'id-1', 'bok_press_all', '한국은행', 'f-1', 'https://example.com/1', 'https://example.com/1', 'A 기준금리 동결', '', '',
        '2026-03-04T00:00:00.000Z', '2026-03-04T00:00:00.000Z', 'hash-1', 'dedupe-1',
        1, 0.4, 0.3, 0.2, 0.1, 2.0,
        2.0, '{"source":0.4,"recency":0.2,"keyword":0.3,"burst":0.1,"diversityPenalty":0,"duplicatePenalty":0}', 'rates', '금리/통화정책', '2026-03-04T00:00:00.000Z'
      ),
      (
        'id-2', 'bok_press_all', '한국은행', 'f-2', 'https://example.com/2', 'https://example.com/2', 'B 기준금리 인상', '', '',
        '2026-03-04T00:00:00.000Z', '2026-03-04T00:00:00.000Z', 'hash-2', 'dedupe-2',
        1, 0.4, 0.3, 0.2, 0.1, 2.0,
        2.0, '{"source":0.4,"recency":0.2,"keyword":0.3,"burst":0.1,"diversityPenalty":0,"duplicatePenalty":0}', 'rates', '금리/통화정책', '2026-03-04T00:00:00.000Z'
      ),
      (
        'id-3', 'kosis_monthly_trend', 'KOSIS', 'f-3', 'https://example.com/3', 'https://example.com/3', '환율 점검', '', '',
        '2026-03-03T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 'hash-3', 'dedupe-3',
        1, 0.3, 0.1, 0.1, 0.1, 1.1,
        1.1, '{"source":0.3,"recency":0.1,"keyword":0.1,"burst":0,"diversityPenalty":0,"duplicatePenalty":0}', 'fx', '환율/대외', '2026-03-03T00:00:00.000Z'
      )
    `).run();

    db.prepare(`
      INSERT INTO news_item_topics (
        itemId, topicId, topicLabel, score, isPrimary, keywordMatches, entityMatches, tfidfBoost
      ) VALUES
      ('id-1','rates','금리/통화정책',2.0,1,'["기준금리"]','["bok"]',0),
      ('id-2','rates','금리/통화정책',2.0,1,'["기준금리"]','["bok"]',0),
      ('id-3','fx','환율/대외',1.1,1,'["환율"]','["kosis"]',0)
    `).run();

    writeNewsSearchIndex({ generatedAt: "2026-03-04T09:00:00.000Z", db });
  } finally {
    closeNewsDatabase(db);
  }
}

describe("planning v3 news search api", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-news-search-api-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.NODE_ENV = "test";
    seedSearchIndex();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks non-local host", async () => {
    const response = await GET(requestGet("/api/planning/v3/news/search", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("filters and ranks deterministically", async () => {
    const response = await GET(requestGet("/api/planning/v3/news/search?q=%EA%B8%B0%EC%A4%80%EA%B8%88%EB%A6%AC&topics=rates&sources=bok_press_all&minScore=1.9&days=30&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        total?: number;
        items?: Array<Record<string, unknown>>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.total).toBe(2);
    const items = payload.data?.items ?? [];
    expect(items.length).toBe(2);
    expect(items[0]?.id).toBe("id-1");
    expect(items[1]?.id).toBe("id-2");
    expect("snippet" in (items[0] ?? {})).toBe(false);
    expect("description" in (items[0] ?? {})).toBe(false);
    expect("fullText" in (items[0] ?? {})).toBe(false);
  });
});
