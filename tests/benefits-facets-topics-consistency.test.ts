import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(partial: Partial<BenefitCandidate> & { id: string; title: string }): BenefitCandidate {
  return {
    id: partial.id,
    title: partial.title,
    summary: partial.summary ?? "요약",
    eligibilityHints: partial.eligibilityHints ?? [],
    region: partial.region ?? { scope: "UNKNOWN", tags: ["미상"] },
    source: "test",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits facets topics consistency", () => {
  it("reflects topics filter in sido facets and count maps", () => {
    const items: BenefitCandidate[] = [
      item({ id: "A", title: "부산 주거 지원", summary: "전세 지원", region: { scope: "REGIONAL", tags: ["부산", "부산 해운대구"], sido: "부산", sigungu: "해운대구" } }),
      item({ id: "B", title: "서울 의료 지원", summary: "검진 지원", region: { scope: "REGIONAL", tags: ["서울", "서울 강남구"], sido: "서울", sigungu: "강남구" } }),
      item({ id: "C", title: "전국 주거 지원", summary: "월세 보조", region: { scope: "NATIONWIDE", tags: ["전국"] } }),
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
        selectedTopics: ["housing"],
        topicMode: "or",
      },
      {},
    );

    const busanFacet = payload.data.facets.sido.find((entry) => entry.key === "부산")?.count ?? 0;
    const seoulFacet = payload.data.facets.sido.find((entry) => entry.key === "서울")?.count ?? 0;
    expect(busanFacet).toBe(1);
    expect(seoulFacet).toBe(0);
    expect((payload.meta as { countsBySido?: Record<string, number> }).countsBySido?.["부산"]).toBe(1);
  });

  it("builds sigungu facets only within selected sido", () => {
    const items: BenefitCandidate[] = [
      item({ id: "A", title: "부산 주거 지원", summary: "전세 지원", region: { scope: "REGIONAL", tags: ["부산", "부산 해운대구"], sido: "부산", sigungu: "해운대구" } }),
      item({ id: "B", title: "부산 주거 지원2", summary: "월세 지원", region: { scope: "REGIONAL", tags: ["부산", "부산 수영구"], sido: "부산", sigungu: "수영구" } }),
      item({ id: "C", title: "서울 주거 지원", summary: "전세 지원", region: { scope: "REGIONAL", tags: ["서울", "서울 강남구"], sido: "서울", sigungu: "강남구" } }),
    ];

    const payload = buildBenefitsSearchPayload(
      items,
      {
        query: "",
        limit: 200,
        selectedSido: "부산",
        selectedSigungu: null,
        includeNationwide: true,
        includeUnknown: true,
        selectedTopics: ["housing"],
        topicMode: "or",
      },
      {},
    );

    const sigunguKeys = payload.data.facets.sigungu.map((entry) => entry.key);
    expect(sigunguKeys).toContain("해운대구");
    expect(sigunguKeys).toContain("수영구");
    expect(sigunguKeys).not.toContain("강남구");
  });
});
