import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function benefit(id: string, tags: string[]): BenefitCandidate {
  return {
    id,
    title: id,
    summary: "요약",
    eligibilityHints: [],
    region: {
      scope: "REGIONAL",
      tags,
      sido: "부산",
    },
    source: "행정안전부 보조금24",
    fetchedAt: "2026-02-25T00:00:00.000Z",
  };
}

describe("benefits sigungu catalog filtering", () => {
  it("excludes non-administrative sigungu-like tokens from facets", () => {
    const payload = buildBenefitsSearchPayload(
      [
        benefit("A", ["부산", "부산 해운대구"]),
        benefit("B", ["부산", "부산 원가구"]),
        benefit("C", ["부산", "부산 도시"]),
      ],
      {
        query: "",
        selectedSido: "부산",
        selectedSigungu: null,
        includeNationwide: true,
        includeUnknown: true,
        selectedTopics: [],
        topicMode: "or",
      },
      {},
    );

    const sigunguKeys = payload.data.facets.sigungu.map((entry) => entry.key);
    expect(sigunguKeys).toContain("해운대구");
    expect(sigunguKeys).not.toContain("원가구");
    expect(sigunguKeys).not.toContain("도시");
  });
});
