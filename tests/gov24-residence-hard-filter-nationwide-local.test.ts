import { describe, expect, it } from "vitest";
import { filterByResidence } from "../src/lib/gov24/residenceHardFilter";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(partial: Partial<BenefitCandidate>): BenefitCandidate {
  return {
    id: partial.id ?? "id",
    title: partial.title ?? "title",
    summary: partial.summary ?? "summary",
    eligibilityHints: partial.eligibilityHints ?? [],
    eligibilityExcerpt: partial.eligibilityExcerpt,
    eligibilityText: partial.eligibilityText,
    isEligibilityTruncated: partial.isEligibilityTruncated,
    eligibilityChips: partial.eligibilityChips,
    contact: partial.contact,
    link: partial.link,
    region: partial.region ?? { scope: "UNKNOWN", tags: ["미상"] },
    applyHow: partial.applyHow,
    org: partial.org,
    lastUpdated: partial.lastUpdated,
    source: partial.source ?? "gov24",
    fetchedAt: partial.fetchedAt ?? "2026-02-21T00:00:00.000Z",
    topicMatch: partial.topicMatch,
    simpleFindMatch: partial.simpleFindMatch,
  };
}

describe("gov24 residence hard filter nationwide-local guard", () => {
  it("excludes local item with nationwide wording when jurisdiction is different", () => {
    const items: BenefitCandidate[] = [
      item({
        id: "busan-suyeong-local",
        title: "청년 지원",
        summary: "전국 18세~39세 대상",
        org: "부산광역시 수영구",
        region: { scope: "NATIONWIDE", tags: ["전국"] },
      }),
      item({
        id: "true-nationwide-central",
        title: "전국 청년 지원",
        summary: "전국민 대상",
        org: "보건복지부",
        region: { scope: "NATIONWIDE", tags: ["전국"] },
      }),
    ];

    const filtered = filterByResidence(items, { sido: "강원", sigungu: "춘천시" });
    const ids = filtered.map((entry) => entry.id);

    expect(ids).not.toContain("busan-suyeong-local");
    expect(ids).toContain("true-nationwide-central");
  });
});
