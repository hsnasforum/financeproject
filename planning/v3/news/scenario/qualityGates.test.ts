import { describe, expect, it } from "vitest";
import { type DigestDay } from "../digest/contracts";
import { noRecommendationText } from "../guard/noRecommendationText";
import { computeScenarioQualityGates } from "./qualityGates";

function makeDigest(input: {
  titles: string[];
  topicsByIndex: string[][];
}): DigestDay {
  return {
    schemaVersion: 1,
    date: "2026-03-05",
    observation: "관찰",
    evidence: input.titles.map((title, index) => ({
      title,
      url: `https://example.com/${index + 1}`,
      sourceId: `source_${index + 1}`,
      publishedAt: `2026-03-05T0${Math.min(index, 9)}:00:00.000Z`,
      topics: input.topicsByIndex[index] ?? ["rates"],
    })),
    watchlist: [],
    counterSignals: [],
  };
}

describe("scenario quality gates", () => {
  it("detects high dedupe from repeated evidence titles", () => {
    const digest = makeDigest({
      titles: [
        "기준금리 인상 관측",
        "기준금리 인상 관측",
        "기준금리 인상 관측",
        "환율 상승 관측",
      ],
      topicsByIndex: [["rates"], ["rates"], ["rates"], ["fx"]],
    });

    const result = computeScenarioQualityGates({
      digest,
      linkedTopics: ["rates", "fx"],
    });

    expect(result.dedupeLevel).toBe("high");
    expect(result.uncertaintyLabels.length).toBeGreaterThan(0);
  });

  it("detects contradiction level for linked topics only", () => {
    const digest = makeDigest({
      titles: [
        "기준금리 인상 압력 확대",
        "기준금리 인하 가능성 부각",
        "완화 전환 기대 확산",
        "긴축 기조 재확인",
      ],
      topicsByIndex: [["rates"], ["rates"], ["rates"], ["rates"]],
    });

    const result = computeScenarioQualityGates({
      digest,
      linkedTopics: ["rates"],
    });

    expect(result.contradictionLevel === "high" || result.contradictionLevel === "med").toBe(true);
    for (const label of result.uncertaintyLabels) {
      expect(noRecommendationText(label)).toBe(true);
    }
  });

  it("is deterministic for same input", () => {
    const digest = makeDigest({
      titles: ["환율 상승", "환율 상승", "환율 하락 가능성"],
      topicsByIndex: [["fx"], ["fx"], ["fx"]],
    });

    const first = computeScenarioQualityGates({ digest, linkedTopics: ["fx"] });
    const second = computeScenarioQualityGates({ digest, linkedTopics: ["fx"] });
    expect(first).toStrictEqual(second);
  });
});
