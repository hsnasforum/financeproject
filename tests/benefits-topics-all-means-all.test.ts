import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { BENEFIT_TOPIC_KEYS } from "../src/lib/publicApis/benefitsTopics";
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

describe("benefits topics all means all", () => {
  it("skips topics filter when all topics are selected", () => {
    const items = [
      item("1", "청년 전세 지원", "임차보증금 지원"),
      item("2", "농업 기술 교육", "영농 정착 지원"),
      item("3", "의료비 지원", "검진 지원"),
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
        selectedTopics: BENEFIT_TOPIC_KEYS,
        topicMode: "and",
      },
      {},
    );

    const pipeline = (payload.meta as { pipeline?: { snapshotUnique: number; afterTopics: number } }).pipeline;
    expect(pipeline?.snapshotUnique).toBe(3);
    expect(pipeline?.afterTopics).toBe(3);
    expect(payload.data.items.length).toBe(3);
    expect((payload.meta as { filters?: { topicsBypassed?: boolean } }).filters?.topicsBypassed).toBe(true);
  });
});

