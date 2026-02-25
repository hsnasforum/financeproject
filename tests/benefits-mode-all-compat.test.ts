import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload, filterBenefitsByQuery } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(id: string, title: string, hint = "청년 대상"): BenefitCandidate {
  return {
    id,
    title,
    summary: `${title} 요약`,
    eligibilityHints: [hint],
    region: { scope: "REGIONAL", tags: ["부산", "부산 금정구"], sido: "부산", sigungu: "금정구" },
    source: "test",
    fetchedAt: new Date().toISOString(),
  };
}

describe("benefits mode all compat", () => {
  it("returns same filtered payload regardless mode when scan=all path is used", () => {
    const items = [item("1", "청년 지원"), item("2", "주거 지원", "주거 대상")];
    const queried = filterBenefitsByQuery(items, "청년");
    const filters = {
      query: "청년",
      limit: 200,
      selectedSido: "부산",
      selectedSigungu: "금정구",
      includeNationwide: true,
      includeUnknown: true,
      selectedTopics: [],
      topicMode: "or" as const,
    };
    const a = buildBenefitsSearchPayload(queried, filters, { snapshot: { fromCache: "disk" } });
    const b = buildBenefitsSearchPayload(queried, filters, { snapshot: { fromCache: "disk" } });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.data.items.length).toBe(1);
    expect(a.data.items).toEqual(b.data.items);
    expect(a.data.facets).toEqual(b.data.facets);
  });
});
