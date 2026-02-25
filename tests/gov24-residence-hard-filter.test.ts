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

describe("gov24 residence hard filter", () => {
  it("excludes cross-region regional items and keeps nationwide for daegu-junggu", () => {
    const items: BenefitCandidate[] = [
      item({
        id: "regional-jeonnam",
        title: "완도군 생활지원",
        org: "전라남도 완도군",
        region: { scope: "REGIONAL", tags: ["전남", "전남 완도군"], sido: "전남", sigungu: "완도군" },
      }),
      item({
        id: "regional-gyeongnam",
        title: "거창군 생활지원",
        org: "경상남도 거창군",
        region: { scope: "REGIONAL", tags: ["경남", "경남 거창군"], sido: "경남", sigungu: "거창군" },
      }),
      item({
        id: "regional-daegu",
        title: "대구 중구 청년지원",
        org: "대구광역시 중구",
        region: { scope: "REGIONAL", tags: ["대구", "대구 중구"], sido: "대구", sigungu: "중구" },
      }),
      item({
        id: "nationwide-central",
        title: "전국 청년 정책",
        org: "보건복지부",
        region: { scope: "NATIONWIDE", tags: ["전국"] },
      }),
    ];

    const filtered = filterByResidence(items, { sido: "대구", sigungu: "중구" });
    const ids = filtered.map((entry) => entry.id);

    expect(ids).toContain("regional-daegu");
    expect(ids).toContain("nationwide-central");
    expect(ids).not.toContain("regional-jeonnam");
    expect(ids).not.toContain("regional-gyeongnam");
  });

  it("normalizes residence sido like 전라남도 to 전남", () => {
    const items: BenefitCandidate[] = [
      item({
        id: "regional-jeonnam",
        title: "완도군 생활지원",
        org: "전라남도 완도군",
        region: { scope: "REGIONAL", tags: ["전남", "전남 완도군"], sido: "전남", sigungu: "완도군" },
      }),
    ];

    const filtered = filterByResidence(items, { sido: "전라남도", sigungu: "완도군" });
    expect(filtered.map((entry) => entry.id)).toEqual(["regional-jeonnam"]);
  });
});
