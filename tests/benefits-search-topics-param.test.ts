import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(id: string, title: string, summary: string): BenefitCandidate {
  return {
    id,
    title,
    summary,
    eligibilityHints: [],
    region: { scope: "NATIONWIDE", tags: ["전국"] },
    source: "test",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits search topics param", () => {
  it("applies topics filter with OR mode", () => {
    const items = [
      item("1", "청년 전세 지원", "임차보증금 지원"),
      item("2", "의료비 지원", "검진 지원"),
    ];
    const payload = buildBenefitsSearchPayload(
      items,
      {
        query: "",
        limit: 200,
        selectedSido: null,
        selectedSigungu: null,
        includeNationwide: true,
        includeUnknown: true,
        selectedTopics: ["jeonse", "medical"],
        topicMode: "or",
      },
      {},
    );
    expect(payload.data.items.length).toBe(2);
    expect(payload.data.items.every((entry) => (entry.topicMatch?.matchedTopics.length ?? 0) > 0)).toBe(true);
  });

  it("applies topics filter with AND mode", () => {
    const items = [
      item("1", "청년 취업 지원", "구직 프로그램"),
      item("2", "청년 주거 지원", "월세 완화"),
    ];
    const payload = buildBenefitsSearchPayload(
      items,
      {
        query: "",
        limit: 200,
        selectedSido: null,
        selectedSigungu: null,
        includeNationwide: true,
        includeUnknown: true,
        selectedTopics: ["housing", "youth"],
        topicMode: "and",
      },
      {},
    );
    expect(payload.data.items.length).toBe(1);
    expect(payload.data.items[0]?.id).toBe("2");
    expect(payload.data.items[0]?.topicMatch?.matchedTopics).toContain("housing");
    expect(payload.data.items[0]?.topicMatch?.matchedTopics).toContain("youth");
  });
});
