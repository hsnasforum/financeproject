import { describe, expect, it } from "vitest";
import { scoreBenefits } from "../src/lib/recommend/scoreBenefits";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";
import { type BenefitTopicKey } from "../src/lib/publicApis/benefitsTopics";

function makeBenefit(partial: Partial<BenefitCandidate> & { id: string; title: string }): BenefitCandidate {
  return {
    id: partial.id,
    title: partial.title,
    summary: partial.summary ?? "요약",
    eligibilityHints: partial.eligibilityHints ?? [],
    region: partial.region ?? { scope: "UNKNOWN", tags: ["미상"] },
    applyHow: partial.applyHow,
    org: partial.org,
    source: "행정안전부 보조금24",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("scoreBenefits", () => {
  it("boosts items that match region/category/keyword", () => {
    const items: BenefitCandidate[] = [
      makeBenefit({
        id: "A",
        title: "서울 청년 주거 지원",
        summary: "서울 강남구 청년 대상 주거비 지원",
        eligibilityHints: ["청년", "무주택"],
        applyHow: "온라인",
        region: { scope: "REGIONAL", tags: ["서울", "서울 강남구", "강남구"], sido: "서울", sigungu: "강남구" },
        topicMatch: {
          matchedTopics: ["housing", "youth"] as BenefitTopicKey[],
          evidence: [
            { topic: "housing", field: "요약", synonym: "주거" },
            { topic: "youth", field: "제목", synonym: "청년" },
          ],
        },
      }),
      makeBenefit({
        id: "B",
        title: "전국 출산 바우처",
        summary: "전국 대상",
        eligibilityHints: ["출산"],
        region: { scope: "NATIONWIDE", tags: ["전국"] },
      }),
      makeBenefit({
        id: "C",
        title: "일반 안내",
        summary: "정보 부족",
        region: { scope: "UNKNOWN", tags: ["미상"], unknownReason: "NO_REGION_INFO" },
      }),
    ];

    const ranked = scoreBenefits(items, {
      topics: ["housing", "youth"],
      query: "강남구",
      sido: "서울",
      sigungu: "강남구",
      includeNationwide: true,
      includeUnknown: true,
      topN: 3,
    });

    expect(ranked[0]?.item.id).toBe("A");
    expect(ranked[0]?.explain.contributions.regionPoints).toBeGreaterThan(ranked[1]?.explain.contributions.regionPoints ?? 0);
    expect(ranked[0]?.explain.matched.topics.length).toBeGreaterThan(0);
    expect(ranked[0]?.explain.matched.queryTokens).toContain("강남구");
    expect(ranked[0]?.explain.why.bullets.some((line) => line.includes("선택한 지역"))).toBe(true);
    expect(ranked[0]?.explain.why.bullets.some((line) => line.includes("주제"))).toBe(true);
  });
});
