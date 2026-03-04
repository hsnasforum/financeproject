import { describe, expect, it } from "vitest";
import { noRecommendationText } from "./guard/noRecommendationText";
import { buildScenarios } from "./scenario";
import { TOPIC_SCENARIO_TEMPLATES } from "./scenario/templates";

function makeDigest() {
  return {
    date: "2026-03-04",
    observation: "관찰: 금리 토픽 강도가 확대되는 흐름이 관찰됩니다.",
    evidence: [
      {
        title: "금리 관련 헤드라인 A",
        url: "https://example.com/a",
        sourceId: "bok_press_all",
        publishedAt: "2026-03-04T08:00:00.000Z",
        topics: ["rates", "inflation"],
      },
      {
        title: "금리 관련 헤드라인 B",
        url: "https://example.com/b",
        sourceId: "bok_mpc_decisions",
        publishedAt: "2026-03-04T09:00:00.000Z",
        topics: ["rates"],
      },
      {
        title: "환율 관련 헤드라인 C",
        url: "https://example.com/c",
        sourceId: "kosis_monthly_trend",
        publishedAt: "2026-03-04T10:00:00.000Z",
        topics: ["fx"],
      },
    ],
    watchlist: ["기준금리", "USDKRW"],
    counterSignals: ["토픽 집중도가 분산되면 현재 관찰은 약화될 수 있습니다."],
  } as const;
}

function makeTrends() {
  return [
    {
      dateKst: "2026-03-04",
      topicId: "rates",
      topicLabel: "금리",
      count: 9,
      scoreSum: 12,
      sourceDiversity: 0.7,
      burstGrade: "High" as const,
    },
    {
      dateKst: "2026-03-04",
      topicId: "inflation",
      topicLabel: "물가",
      count: 6,
      scoreSum: 9,
      sourceDiversity: 0.45,
      burstGrade: "Med" as const,
    },
    {
      dateKst: "2026-03-04",
      topicId: "fx",
      topicLabel: "환율",
      count: 4,
      scoreSum: 7,
      sourceDiversity: 0.3,
      burstGrade: "Low" as const,
    },
  ];
}

describe("planning v3 news scenario engine", () => {
  it("returns deterministic Base/Bull/Bear cards for same input", () => {
    const digest = makeDigest();
    const trends = makeTrends();

    const first = buildScenarios({ digest, trends, generatedAt: "2026-03-04T12:00:00.000Z" });
    const second = buildScenarios({ digest, trends, generatedAt: "2026-03-04T12:00:00.000Z" });

    expect(first).toStrictEqual(second);
    expect(first.cards).toHaveLength(3);
    expect(first.cards.map((card) => card.name)).toEqual(["Base", "Bull", "Bear"]);
  });

  it("generated strings are neutral and pass noRecommendationText", () => {
    const result = buildScenarios({
      digest: makeDigest(),
      trends: makeTrends(),
      generatedAt: "2026-03-04T12:00:00.000Z",
    });

    const lines = result.cards.flatMap((card) => [
      card.observation,
      ...card.invalidation,
      ...card.options,
      ...card.triggers.map((trigger) => trigger.note ?? ""),
    ]);

    for (const line of lines) {
      expect(noRecommendationText(line)).toBe(true);
      expect(line).not.toMatch(/매수|매도|정답|무조건|확실|해야\s*한다/);
    }
  });

  it("keeps linkedTopics bounded and categorical triggers", () => {
    const result = buildScenarios({
      digest: makeDigest(),
      trends: makeTrends(),
      generatedAt: "2026-03-04T12:00:00.000Z",
    });

    for (const card of result.cards) {
      expect(card.linkedTopics.length).toBeGreaterThanOrEqual(1);
      expect(card.linkedTopics.length).toBeLessThanOrEqual(3);
      expect(card.triggers.length).toBeGreaterThan(0);
      expect(card.triggers.every((trigger) => ["high", "med", "low"].includes(trigger.condition))).toBe(true);
      expect(card.indicators.length).toBeGreaterThan(0);
      expect(card.indicators).toContain("kr_base_rate");
      expect(card.indicators.some((seriesId) => seriesId === "kr_usdkrw" || seriesId === "kr_cpi")).toBe(true);
      if (card.quality) {
        for (const label of card.quality.uncertaintyLabels) {
          expect(noRecommendationText(label)).toBe(true);
        }
      }
    }
  });

  it("uses injected scenario library templates when provided", () => {
    const customTemplates = TOPIC_SCENARIO_TEMPLATES.map((row) => (
      row.topicId === "rates"
        ? {
            ...row,
            observation: {
              ...row.observation,
              base: "관찰: 사용자 오버라이드 시나리오 템플릿이 적용되는 조건입니다.",
            },
          }
        : row
    ));

    const result = buildScenarios({
      digest: makeDigest(),
      trends: makeTrends(),
      generatedAt: "2026-03-04T12:00:00.000Z",
      libraryTemplates: customTemplates,
    });

    expect(result.cards[0]?.observation).toContain("사용자 오버라이드 시나리오 템플릿");
  });

  it("adds uncertainty labels when evidence is duplicated and contradictory", () => {
    const result = buildScenarios({
      digest: {
        ...makeDigest(),
        evidence: [
          {
            title: "기준금리 인상 압력 확대",
            url: "https://example.com/dup-1",
            sourceId: "bok_press_all",
            publishedAt: "2026-03-04T08:00:00.000Z",
            topics: ["rates"],
          },
          {
            title: "기준금리 인상 압력 확대",
            url: "https://example.com/dup-2",
            sourceId: "bok_mpc_decisions",
            publishedAt: "2026-03-04T08:30:00.000Z",
            topics: ["rates"],
          },
          {
            title: "기준금리 인하 가능성 부각",
            url: "https://example.com/opp-1",
            sourceId: "kosis_monthly_trend",
            publishedAt: "2026-03-04T09:00:00.000Z",
            topics: ["rates"],
          },
          {
            title: "완화 전환 기대 확대",
            url: "https://example.com/opp-2",
            sourceId: "kostat_press",
            publishedAt: "2026-03-04T09:30:00.000Z",
            topics: ["rates"],
          },
        ],
      },
      trends: makeTrends(),
      generatedAt: "2026-03-04T12:00:00.000Z",
    });

    for (const card of result.cards) {
      expect(card.quality?.uncertaintyLabels.length ?? 0).toBeGreaterThan(0);
      for (const label of card.quality?.uncertaintyLabels ?? []) {
        expect(noRecommendationText(label)).toBe(true);
      }
    }
  });
});
