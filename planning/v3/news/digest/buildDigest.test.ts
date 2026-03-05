import { describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "../fixtures/sample-items";
import { selectTopFromItems } from "../select/selectTop";
import { buildDigestDay } from "./buildDigest";
import { assertNoRecommendationText, noRecommendationText } from "../guard/noRecommendationText";

function makeBurstFixture() {
  return [
    {
      dateKst: "2026-03-04",
      topicId: "rates",
      topicLabel: "금리",
      count: 9,
      scoreSum: 12,
      sourceDiversity: 0.67,
      baselineMean: 5,
      baselineStddev: 1,
      burstZ: 2.5,
      burstGrade: "High" as const,
    },
    {
      dateKst: "2026-03-04",
      topicId: "inflation",
      topicLabel: "물가",
      count: 7,
      scoreSum: 9,
      sourceDiversity: 0.5,
      baselineMean: 5,
      baselineStddev: 1,
      burstZ: 1.3,
      burstGrade: "Med" as const,
    },
  ];
}

describe("planning v3 digest builder", () => {
  it("generates digest with fixed 4 blocks and neutral text", () => {
    const topResult = selectTopFromItems(FIXTURE_ITEMS, {
      now: new Date(FIXTURE_NOW_ISO),
      windowHours: 72,
      topN: 10,
      topM: 5,
    });

    const digest = buildDigestDay({
      date: "2026-03-04",
      topResult,
      burstTopics: makeBurstFixture(),
    });

    expect(digest.date).toBe("2026-03-04");
    expect(digest.observation.length).toBeGreaterThan(0);
    expect(digest.evidence.length).toBeGreaterThanOrEqual(2);
    expect(digest.evidence.length).toBeLessThanOrEqual(5);
    expect(digest.watchlist.length).toBeGreaterThan(0);
    expect(digest.counterSignals.length).toBeGreaterThan(0);

    expect(() => assertNoRecommendationText([
      digest.observation,
      ...digest.watchlist,
      ...digest.counterSignals,
    ])).not.toThrow();
  });

  it("rejects known recommendation phrases", () => {
    const badSamples = [
      "지금은 매수 타이밍입니다.",
      "정답은 매도입니다.",
      "무조건 오른다고 확실합니다.",
      "지금 사야 한다.",
      "You must buy now",
    ];

    for (const sample of badSamples) {
      expect(noRecommendationText(sample)).toBe(false);
      expect(() => assertNoRecommendationText(sample)).toThrow(/FORBIDDEN_RECOMMENDATION_LANGUAGE/);
    }
  });

  it("is deterministic for identical input", () => {
    const topResult = selectTopFromItems(FIXTURE_ITEMS, {
      now: new Date(FIXTURE_NOW_ISO),
      windowHours: 72,
      topN: 10,
      topM: 5,
    });
    const burstTopics = makeBurstFixture();

    const first = buildDigestDay({ date: "2026-03-04", topResult, burstTopics });
    const second = buildDigestDay({ date: "2026-03-04", topResult, burstTopics });

    expect(first).toEqual(second);
  });
});
