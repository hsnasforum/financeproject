import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(index: number): BenefitCandidate {
  return {
    id: `benefit-${index}`,
    title: `혜택 ${index}`,
    summary: "요약",
    eligibilityHints: [],
    region: { scope: "NATIONWIDE", tags: ["전국"] },
    source: "test",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits pagination cursor", () => {
  it("iterates all matched items without duplication", () => {
    const items = Array.from({ length: 300 }, (_, idx) => item(idx + 1));
    const visited = new Set<string>();
    let cursor = 0;

    while (true) {
      const payload = buildBenefitsSearchPayload(
        items,
        {
          query: "",
          pageSize: 50,
          cursor,
          includeFacets: cursor === 0,
          selectedSido: null,
          selectedSigungu: null,
          includeNationwide: true,
          includeUnknown: true,
          selectedTopics: [],
          topicMode: "or",
        },
        {},
      );

      for (const row of payload.data.items) {
        expect(visited.has(row.id)).toBe(false);
        visited.add(row.id);
      }

      const nextCursor = (payload.data as { page?: { nextCursor?: number | null } }).page?.nextCursor ?? null;
      if (nextCursor === null) break;
      cursor = nextCursor;
    }

    expect(visited.size).toBe(300);
  });
});

