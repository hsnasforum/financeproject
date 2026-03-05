import { describe, expect, it } from "vitest";
import { clusterNewsItems } from "../src/lib/news/cluster";
import { type ScoredNewsItem } from "../src/lib/news/types";

function mk(id: string, title: string, dedupeKey: string, publishedAt: string): ScoredNewsItem {
  return {
    id,
    sourceId: "feed",
    sourceName: "feed",
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title,
    snippet: title,
    description: title,
    publishedAt,
    fetchedAt: publishedAt,
    contentHash: `h-${id}`,
    dedupeKey,
    tokens: ["금리", "연준"],
    tags: [],
    primaryTopicId: "rates",
    primaryTopicLabel: "금리",
    primaryTopicScore: 2,
    sourceWeight: 70,
    sourceScore: 20,
    keywordScore: 20,
    recencyScore: 10,
    focusScore: 5,
    relativeScore: id === "c" ? 70 : 80,
    scoreParts: {
      source: 0.7,
      recency: 1,
      keyword: 0.8,
      burst: 0,
      diversityPenalty: 0,
      duplicatePenalty: 0,
    },
    totalScore: id === "c" ? 70 : 80,
  };
}

describe("news cluster", () => {
  it("clusters by topic + similarity or dedupe key", () => {
    const rows = [
      mk("a", "연준 금리 동결", "same", "2026-03-04T00:00:00.000Z"),
      mk("b", "연준 금리 동결 전망", "same", "2026-03-04T02:00:00.000Z"),
      mk("c", "다른 제목", "diff", "2026-03-01T00:00:00.000Z"),
    ];
    const clusters = clusterNewsItems(rows, { windowHours: 36, minJaccard: 0.55 });
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters[0]?.count).toBeGreaterThanOrEqual(1);
  });
});
