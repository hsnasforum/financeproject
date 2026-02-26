import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeUnknownRegionBenefit(id: string, title: string): BenefitCandidate {
  return {
    id,
    title,
    summary: "지역 맞춤 복지 지원",
    eligibilityHints: [],
    region: { scope: "UNKNOWN", tags: ["미상"] },
    source: "행정안전부 보조금24",
    fetchedAt: "2026-02-25T00:00:00.000Z",
  };
}

describe("benefits region fallback inference", () => {
  it("infers sido/sigungu from text when region tags are unknown", () => {
    const items: BenefitCandidate[] = [
      makeUnknownRegionBenefit("A", "대구광역시 수성구 청년 자격증 응시료 지원"),
      makeUnknownRegionBenefit("B", "부산광역시 해운대구 출산 지원"),
    ];

    const payload = buildBenefitsSearchPayload(
      items,
      {
        query: "",
        selectedSido: "대구",
        selectedSigungu: null,
        includeNationwide: true,
        includeUnknown: true,
        selectedTopics: [],
        topicMode: "or",
      },
      {},
    );

    expect(payload.data.totalMatched).toBe(1);
    expect(payload.data.items[0]?.id).toBe("A");
    const sigunguKeys = payload.data.facets.sigungu.map((entry) => entry.key);
    expect(sigunguKeys).toContain("수성구");
    // Catalog fallback should still expose major districts for selected sido.
    expect(sigunguKeys).toContain("달서구");
  });
});
