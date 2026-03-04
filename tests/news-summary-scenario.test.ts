import { describe, expect, it } from "vitest";
import { buildDigestDay, buildNewsBrief, buildRisingTopics, hasForbiddenDirective } from "../src/lib/news/summary";
import { buildNewsScenarios, toScenarioCards } from "../src/lib/news/scenarioEngine";
import { type NewsCluster, type ScoredNewsItem, type TopicTrend } from "../src/lib/news/types";

function item(id: string): ScoredNewsItem {
  return {
    id,
    sourceId: "feed",
    sourceName: "feed",
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `title-${id}`,
    snippet: `snippet-${id}`,
    description: `snippet-${id}`,
    publishedAt: "2026-03-04T00:00:00.000Z",
    fetchedAt: "2026-03-04T00:00:00.000Z",
    contentHash: `h-${id}`,
    dedupeKey: `d-${id}`,
    tokens: [],
    tags: [],
    primaryTopicId: "rates",
    primaryTopicLabel: "금리",
    primaryTopicScore: 1,
    sourceWeight: 50,
    sourceScore: 10,
    keywordScore: 10,
    recencyScore: 10,
    focusScore: 5,
    relativeScore: 2.1,
    scoreParts: {
      source: 0.5,
      recency: 1,
      keyword: 0.2,
      burst: 0.4,
      diversityPenalty: 0,
      duplicatePenalty: 0,
    },
    totalScore: 2.1,
  };
}

function cluster(id: string): NewsCluster {
  const rep = item(id);
  return {
    clusterId: `cluster-${id}`,
    topicId: rep.primaryTopicId,
    topicLabel: rep.primaryTopicLabel,
    count: 1,
    representative: rep,
    representativeUrl: rep.url,
    representativeTitle: rep.title,
    representativePublishedAt: rep.publishedAt,
    clusterScore: rep.totalScore,
    items: [rep],
  };
}

function trend(topicId: string, label: string): TopicTrend {
  return {
    topicId,
    topicLabel: label,
    todayCount: 6,
    yesterdayCount: 2,
    delta: 4,
    ratio: 3,
    avgLast7d: 2,
    stddevLast7d: 1,
    burstZ: 4,
    burstLevel: "상",
    lowHistory: false,
    sourceDiversity: 0.6,
    topSourceShare: 0.4,
    consensusGrade: "high",
    scoreSum: 15,
    series: [
      { date: "2026-03-03", count: 2, scoreSum: 4 },
      { date: "2026-03-04", count: 6, scoreSum: 15 },
    ],
  };
}

describe("news summary and scenario", () => {
  it("builds digest and scenario with non-numeric confidence and no forbidden directives", () => {
    const rising = buildRisingTopics([
      { topicId: "rates", topicLabel: "금리", todayCount: 6, yesterdayCount: 2 },
      { topicId: "fx", topicLabel: "환율", todayCount: 1, yesterdayCount: 1 },
    ]);
    expect(rising).toHaveLength(1);

    const brief = buildNewsBrief({
      generatedAt: "2026-03-04T00:00:00.000Z",
      scoredItems: [item("1")],
      clusters: [cluster("1")],
      feeds: 1,
      dedupedCount: 0,
      topN: 10,
      topM: 3,
      risingTopics: rising,
      evidenceLinksMin: 2,
      evidenceLinksMax: 5,
    });

    const pack = buildNewsScenarios({
      generatedAt: "2026-03-04T00:00:00.000Z",
      risingTopics: brief.risingTopics,
      topClusters: brief.topToday,
      topicTrends: [trend("rates", "금리")],
      macroSnapshot: {
        asOf: "2026-03-04",
        source: "test",
        values: {
          policyRatePct: 3.5,
          fxUsdKrw: 1370,
        },
      },
    });
    const cards = toScenarioCards(pack);
    const digest = buildDigestDay({
      generatedAt: "2026-03-04T00:00:00.000Z",
      dateKst: "2026-03-04",
      brief,
      trends: [trend("rates", "금리")],
      scenarioCards: cards,
    });

    expect(pack.scenarios).toHaveLength(3);
    expect(pack.scenarios.map((row) => row.confidence)).toEqual(["중", "하", "하"]);
    expect(pack.scenarios.every((row) => row.consensusGrade === "high")).toBe(true);
    expect(pack.scenarios.every((row) => (row.uncertaintyLabel ?? "").includes("불확실성 낮음"))).toBe(true);
    expect(pack.scenarios.every((row) => !row.confidence.includes("%"))).toBe(true);
    expect(pack.scenarios.every((row) => row.observation.length > 0)).toBe(true);
    expect(pack.scenarios.every((row) => row.interpretations.length >= 2)).toBe(true);
    expect(pack.scenarios.every((row) => row.options.length >= 3)).toBe(true);
    expect(digest.scenarioCards).toHaveLength(3);
    expect(hasForbiddenDirective(digest.summary.observation)).toBe(false);
    expect(pack.scenarios.flatMap((row) => [
      row.observation,
      ...row.interpretations,
      ...row.options,
      ...row.invalidation,
      row.impact,
      ...row.monitoringOptions,
    ]).every((text) => !hasForbiddenDirective(text))).toBe(true);
  });
});
