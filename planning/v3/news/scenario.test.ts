import { describe, expect, it } from "vitest";
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

describe("planning v3 news scenario", () => {
  it("returns deterministic base/bull/bear cards", () => {
    const digest = makeFixtureDigest();
    const trends = makeFixtureTrends();

    const first = buildScenarios({ digest, trends, generatedAt: FIXTURE_NOW_ISO });
    const second = buildScenarios({ digest, trends, generatedAt: FIXTURE_NOW_ISO });

    expect(first).toStrictEqual(second);
    expect(first.cards).toHaveLength(3);
    expect(first.cards.map((card) => card.name)).toEqual(["Base", "Bull", "Bear"]);

    for (const card of first.cards) {
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
    const result = buildScenarios({ digest, trends, generatedAt: FIXTURE_NOW_ISO });

    const lines = result.cards.flatMap((card) => [
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
