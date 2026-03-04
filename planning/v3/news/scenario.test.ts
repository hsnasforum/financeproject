import { describe, expect, it } from "vitest";
import { type SeriesSnapshot } from "../indicators/contracts";
import { type TopicDailyStat } from "./contracts";
import { buildDigestFromInputs, noRecommendationText } from "./digest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { buildScenarios } from "./scenario";
import { selectTopFromItems } from "./selectTop";

function makeFixtureTrends(): TopicDailyStat[] {
  return [
    {
      dateKst: "2026-03-04",
      topicId: "rates",
      topicLabel: "금리",
      count: 5,
      baselineMean: 1.8,
      baselineStddev: 0.9,
      burstZ: 2.4,
      burstGrade: "상",
    },
    {
      dateKst: "2026-03-04",
      topicId: "fx",
      topicLabel: "환율",
      count: 3,
      baselineMean: 1.5,
      baselineStddev: 0.8,
      burstZ: 1.2,
      burstGrade: "중",
    },
  ];
}

function makeFixtureDigest() {
  const topResult = selectTopFromItems(FIXTURE_ITEMS, {
    now: new Date(FIXTURE_NOW_ISO),
    windowHours: 72,
    topN: 10,
    topM: 3,
  });

  return buildDigestFromInputs({
    generatedAt: FIXTURE_NOW_ISO,
    dateRange: {
      fromKst: "2026-03-02",
      toKst: "2026-03-04",
    },
    topResult,
    burstTopics: makeFixtureTrends(),
  });
}

function makeFixtureSeriesSnapshots(): SeriesSnapshot[] {
  return [
    {
      seriesId: "kr_base_rate",
      asOf: FIXTURE_NOW_ISO,
      observations: [
        { date: "2025-11", value: 3.5 },
        { date: "2025-12", value: 3.5 },
        { date: "2026-01", value: 3.25 },
        { date: "2026-02", value: 3.25 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_base_rate",
        frequency: "M",
      },
    },
    {
      seriesId: "kr_usdkrw",
      asOf: FIXTURE_NOW_ISO,
      observations: [
        { date: "2026-03-01", value: 1341.1 },
        { date: "2026-03-02", value: 1347.8 },
        { date: "2026-03-03", value: 1344.3 },
        { date: "2026-03-04", value: 1342.9 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_usdkrw",
        frequency: "D",
      },
    },
    {
      seriesId: "kr_cpi",
      asOf: FIXTURE_NOW_ISO,
      observations: [
        { date: "2025-10", value: 113.1 },
        { date: "2025-11", value: 113.3 },
        { date: "2025-12", value: 113.6 },
        { date: "2026-01", value: 113.9 },
        { date: "2026-02", value: 114.0 },
        { date: "2026-03", value: 114.3 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_cpi",
        frequency: "M",
      },
    },
  ];
}

describe("planning v3 news scenario", () => {
  it("returns deterministic base/bull/bear cards", () => {
    const digest = makeFixtureDigest();
    const trends = makeFixtureTrends();
    const seriesSnapshots = makeFixtureSeriesSnapshots();

    const first = buildScenarios({ digest, trends, seriesSnapshots, generatedAt: FIXTURE_NOW_ISO });
    const second = buildScenarios({ digest, trends, seriesSnapshots, generatedAt: FIXTURE_NOW_ISO });

    expect(first).toStrictEqual(second);
    expect(first.cards).toHaveLength(3);
    expect(first.cards.map((card) => card.name)).toEqual(["Base", "Bull", "Bear"]);

    for (const card of first.cards) {
      expect(["met", "not_met", "unknown"]).toContain(card.triggerStatus);
      expect(card.triggerRationale.length).toBeGreaterThan(0);
      expect(card.triggerEvaluations.length).toBeGreaterThan(0);
      expect(card.assumptions.length).toBeGreaterThan(0);
      expect(card.triggers.length).toBeGreaterThan(0);
      expect(card.invalidation.length).toBeGreaterThan(0);
      expect(card.indicators.length).toBeGreaterThan(0);
      expect(card.impactPath.length).toBeGreaterThan(0);
      expect(card.linkedTopics.length).toBeGreaterThan(0);
    }
  });

  it("generated scenario text is conditional and recommendation-safe", () => {
    const digest = makeFixtureDigest();
    const trends = makeFixtureTrends();
    const result = buildScenarios({ digest, trends, seriesSnapshots: makeFixtureSeriesSnapshots(), generatedAt: FIXTURE_NOW_ISO });

    const lines = result.cards.flatMap((card) => [
      card.triggerRationale,
      ...card.triggerEvaluations.map((row) => row.rationale),
      ...card.assumptions,
      ...card.triggers,
      ...card.invalidation,
      ...card.impactPath,
    ]);

    for (const line of lines) {
      expect(noRecommendationText(line)).toBe(true);
      expect(line).not.toMatch(/매수|매도|정답|무조건|확실|해야\s*한다/);
    }
  });
});
