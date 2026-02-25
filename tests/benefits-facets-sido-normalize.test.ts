import { describe, expect, it } from "vitest";
import { buildBenefitsRegionView } from "../src/lib/publicApis/benefitsFacets";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeBenefit(id: string, region: BenefitCandidate["region"]): BenefitCandidate {
  return {
    id,
    title: id,
    summary: "요약",
    eligibilityHints: [],
    region,
    source: "행정안전부 보조금24",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits facets sido normalize", () => {
  it("aggregates sido counts on normalized SIDO_LIST keys", () => {
    const items: BenefitCandidate[] = [
      makeBenefit("A", { scope: "REGIONAL", tags: ["서울", "서울 강남구"], sido: "서울" }),
      makeBenefit("B", { scope: "REGIONAL", tags: ["서울", "강남구"], sido: "서울특별시" }),
      makeBenefit("C", { scope: "REGIONAL", tags: ["경기", "경기 수원시"], sido: "경기도" }),
      makeBenefit("D", { scope: "NATIONWIDE", tags: ["전국"] }),
    ];

    const view = buildBenefitsRegionView(items, {
      sido: null,
      sigungu: null,
      includeNationwide: true,
      includeUnknown: true,
    });

    const seoul = view.facets.sido.find((row) => row.key === "서울")?.count ?? 0;
    const gyeonggi = view.facets.sido.find((row) => row.key === "경기")?.count ?? 0;

    expect(seoul).toBe(2);
    expect(gyeonggi).toBe(1);
  });
});
