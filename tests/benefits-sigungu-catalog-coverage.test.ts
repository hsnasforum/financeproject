import { describe, expect, it } from "vitest";
import { buildBenefitsSearchPayload } from "../src/lib/publicApis/benefitsSearchView";
import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "../src/lib/regions/kr_admin_2025";
import { normalizeSido } from "../src/lib/regions/kr";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

const EMPTY_ITEMS: BenefitCandidate[] = [];

describe("benefits sigungu catalog coverage", () => {
  it("exposes full administrative sigungu catalog for selected sido", () => {
    for (const sido of SIDO_ADMIN_2025) {
      const canonicalSido = normalizeSido(sido.name);
      if (!canonicalSido) continue;

      const payload = buildBenefitsSearchPayload(
        EMPTY_ITEMS,
        {
          query: "",
          selectedSido: canonicalSido,
          selectedSigungu: null,
          includeNationwide: true,
          includeUnknown: true,
          selectedTopics: [],
          topicMode: "or",
          includeFacets: true,
        },
        {},
      );

      const facetKeys = payload.data.facets.sigungu.map((entry) => entry.key);
      const expected = (SIGUNGU_BY_SIDO_CODE_2025[sido.code] ?? []).map((entry) => entry.name);

      expect(facetKeys.length).toBe(expected.length);
      expect(new Set(facetKeys)).toEqual(new Set(expected));
    }
  });
});
