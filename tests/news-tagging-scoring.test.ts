import { describe, expect, it } from "vitest";
import { tagNewsItems } from "../src/lib/news/tagging";
import { countByPrimaryTopic, scoreNewsItems } from "../src/lib/news/scoring";
import { type BurstLevel, type NewsItem, type NewsScoringConfig, type NewsTopicDictionary } from "../src/lib/news/types";

const DICT: NewsTopicDictionary = {
  version: 1,
  topics: [
    { id: "rates", label: "금리", keywords: ["금리", "연준"], entities: ["fomc"] },
    { id: "fx", label: "환율", keywords: ["환율", "원달러"], entities: [] },
  ],
  fallbackTopic: { id: "general", label: "일반" },
};

const SCORE: NewsScoringConfig = {
  version: 1,
  weights: { sourceMax: 30, keywordMax: 35, recencyMax: 20, focusMax: 10 },
  recencyBuckets: [
    { maxHours: 6, score: 20 },
    { maxHours: 24, score: 16 },
  ],
  defaults: {
    topN: 10,
    topM: 3,
    clusterWindowHours: 36,
    clusterMinJaccard: 0.55,
    retentionDays: 45,
    evidenceLinksMin: 2,
    evidenceLinksMax: 5,
    burstWindowDays: 7,
    burstHistoryMinDays: 3,
  },
  relativeScore: {
    recencyBoost: {
      within24h: 1.0,
      within48h: 0.6,
      within7d: 0.2,
      otherwise: 0,
    },
    keywordBoostCap: 1.2,
    topicBurstBoost: {
      high: 0.4,
      mid: 0.2,
      low: 0,
    },
    duplicatePenalty: 0.7,
    diversityPenaltySlope: 0.6,
    diversityPenaltyStart: 0.5,
  },
  burst: {
    highThreshold: 2,
    midThreshold: 1,
  },
};

function mk(id: string, topic: "rates" | "fx", publishedAt: string, sourceId: string, sourceWeight: number): NewsItem & { sourceWeight: number } {
  const title = topic === "rates" ? "연준 금리 동결" : "원달러 환율 상승";
  const snippet = topic === "rates" ? "fomc 금리 뉴스" : "환율 기사";
  return {
    id,
    sourceId,
    sourceName: sourceId,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title,
    snippet,
    description: snippet,
    publishedAt,
    fetchedAt: "2026-03-04T00:00:00.000Z",
    contentHash: `h-${id}`,
    dedupeKey: `d-${id}`,
    sourceWeight,
  };
}

describe("news tagging/scoring", () => {
  it("tags and scores deterministically with burst and diversity penalty", () => {
    const items = [
      mk("a", "rates", "2026-03-04T00:00:00.000Z", "src-a", 80),
      mk("b", "rates", "2026-03-04T00:10:00.000Z", "src-a", 80),
      mk("c", "fx", "2026-03-03T12:00:00.000Z", "src-b", 60),
    ];
    const tagged = tagNewsItems(items, DICT);
    expect(tagged[0]?.primaryTopicId).toBe("rates");
    expect(tagged[2]?.primaryTopicId).toBe("fx");

    const burstLevels = new Map<string, BurstLevel>([
      ["rates", "상"],
      ["fx", "하"],
    ]);
    const scored = scoreNewsItems(tagged, SCORE, {
      nowIso: "2026-03-04T01:00:00.000Z",
      topicCounts: countByPrimaryTopic(tagged),
      burstLevelsByTopic: burstLevels,
      duplicateCountsByKey: new Map<string, number>([["d-a", 2]]),
    });

    expect(scored).toHaveLength(3);
    expect(scored[0]?.relativeScore).toBeGreaterThanOrEqual(scored[1]?.relativeScore ?? 0);
    expect(scored[0]?.scoreParts.source).toBeGreaterThan(0);
    expect(scored.some((row) => row.scoreParts.burst > 0)).toBe(true);
    expect(scored.some((row) => row.scoreParts.diversityPenalty > 0)).toBe(true);
  });
});
