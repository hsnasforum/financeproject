import { describe, expect, it } from "vitest";
import { matchBenefitTopics } from "../src/lib/publicApis/benefitsTopicMatch";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeItem(partial: Partial<BenefitCandidate>): BenefitCandidate {
  return {
    id: partial.id ?? "1",
    title: partial.title ?? "기본 제목",
    summary: partial.summary ?? "기본 요약",
    eligibilityHints: partial.eligibilityHints ?? [],
    eligibilityText: partial.eligibilityText,
    applyHow: partial.applyHow,
    org: partial.org,
    region: partial.region ?? { scope: "NATIONWIDE", tags: ["전국"] },
    source: "test",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits topic match", () => {
  it("matches jeonse by synonyms in summary", () => {
    const item = makeItem({ summary: "청년 임차보증금 및 전세자금 지원" });
    const matched = matchBenefitTopics(item, ["jeonse"]);
    expect(matched.matchedTopics).toEqual(["jeonse"]);
    expect(matched.evidence[0]?.field).toBeDefined();
    expect(matched.evidence[0]?.synonym).toBeDefined();
  });

  it("matches wolse and keeps evidence field/topic/synonym", () => {
    const item = makeItem({ title: "월세지원 바우처", eligibilityText: "월세 부담 완화" });
    const matched = matchBenefitTopics(item, ["wolse"]);
    expect(matched.matchedTopics).toContain("wolse");
    expect(matched.evidence[0]).toMatchObject({ topic: "wolse" });
    expect(typeof matched.evidence[0]?.field).toBe("string");
    expect(typeof matched.evidence[0]?.synonym).toBe("string");
  });
});
