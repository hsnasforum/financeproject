import { describe, expect, it } from "vitest";
import { filterByResidence } from "../src/lib/gov24/residenceHardFilter";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(partial: Partial<BenefitCandidate>): BenefitCandidate {
  return {
    id: partial.id ?? "id",
    title: partial.title ?? "title",
    summary: partial.summary ?? "summary",
    eligibilityHints: partial.eligibilityHints ?? [],
    region: partial.region ?? { scope: "UNKNOWN", tags: ["미상"] },
    source: partial.source ?? "gov24",
    fetchedAt: partial.fetchedAt ?? "2026-02-21T00:00:00.000Z",
    org: partial.org,
    link: partial.link,
    applyHow: partial.applyHow,
  } as BenefitCandidate;
}

describe("gov24 residence hard filter sigungu", () => {
  it("keeps only selected sigungu and province-level local items", () => {
    const items: BenefitCandidate[] = [
      item({
        id: "iksan",
        org: "전북특별자치도 익산시",
        region: { scope: "REGIONAL", tags: ["전북"], sido: "전북" },
      }),
      item({
        id: "jinan",
        org: "전북특별자치도 진안군",
        region: { scope: "REGIONAL", tags: ["전북"], sido: "전북" },
      }),
      item({
        id: "jeonbuk-wide",
        org: "전북특별자치도",
        region: { scope: "REGIONAL", tags: ["전북"], sido: "전북" },
      }),
    ];

    const filtered = filterByResidence(items, { sido: "전북", sigungu: "진안군" });
    const ids = filtered.map((entry) => entry.id);

    expect(ids).toContain("jinan");
    expect(ids).toContain("jeonbuk-wide");
    expect(ids).not.toContain("iksan");
  });
});
