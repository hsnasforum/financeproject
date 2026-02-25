import { describe, expect, it } from "vitest";
import { buildGov24CardFields } from "../src/lib/gov24/cardFields";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeItem(partial?: Partial<BenefitCandidate>): BenefitCandidate {
  return {
    id: partial?.id ?? "svc-1",
    title: partial?.title ?? "청년 주거 지원",
    summary: partial?.summary ?? "신청기간 2025.01.01 ~ 2025.12.31, 문의 02-1234-5678, 현금 지원",
    eligibilityHints: partial?.eligibilityHints ?? [],
    eligibilityText: partial?.eligibilityText,
    eligibilityExcerpt: partial?.eligibilityExcerpt,
    eligibilityChips: partial?.eligibilityChips,
    contact: partial?.contact,
    link: partial?.link,
    region: partial?.region ?? { scope: "NATIONWIDE", tags: ["전국"] },
    applyHow: partial?.applyHow ?? "온라인 신청",
    org: partial?.org ?? "보건복지부",
    source: partial?.source ?? "test",
    fetchedAt: partial?.fetchedAt ?? "2026-02-20T00:00:00.000Z",
  };
}

describe("gov24 card fields", () => {
  it("builds expected lines when fields are available", () => {
    const card = buildGov24CardFields(makeItem());
    expect(card.badge).toBe("중앙부처");
    expect(card.lines.some((line) => line.label === "신청기간")).toBe(true);
    expect(card.lines.some((line) => line.label === "전화문의")).toBe(true);
    expect(card.lines.some((line) => line.label === "지원형태")).toBe(true);
  });

  it("omits empty lines and uses fallback lines", () => {
    const card = buildGov24CardFields(
      makeItem({
        summary: "요약만 존재",
        contact: undefined,
        eligibilityText: undefined,
        eligibilityExcerpt: undefined,
        eligibilityChips: undefined,
        applyHow: "방문 신청",
        org: "서울특별시청",
      }),
    );
    expect(card.lines.some((line) => line.value === "" || line.value === "-")).toBe(false);
    expect(card.lines.some((line) => line.label === "접수기관")).toBe(true);
    expect(card.lines.some((line) => line.label === "신청방법")).toBe(true);
  });
});

