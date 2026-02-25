import { describe, expect, it } from "vitest";
import { buildBenefitsCoverage } from "../src/lib/publicApis/benefitsCoverage";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function item(partial: Partial<BenefitCandidate> & { id: string; title: string }): BenefitCandidate {
  return {
    ...partial,
    id: partial.id,
    title: partial.title,
    summary: partial.summary ?? "",
    eligibilityHints: partial.eligibilityHints ?? [],
    region: partial.region ?? { scope: "UNKNOWN", tags: ["미상"] },
    source: "행정안전부 보조금24",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("benefits coverage", () => {
  it("computes coverage rates and quality bucket distribution", () => {
    const report = buildBenefitsCoverage([
      item({ id: "A", title: "A", summary: "요약", applyHow: "온라인", eligibilityText: "조건 상세 텍스트", region: { scope: "REGIONAL", tags: ["서울"], sido: "서울" } }),
      item({ id: "B", title: "B", summary: "", applyHow: "", eligibilityText: "", region: { scope: "UNKNOWN", tags: ["미상"] } }),
    ]);

    expect(report.totalItems).toBe(2);
    expect(report.fieldsCoverage.summary).toBe(50);
    expect(report.qualityBuckets.EMPTY + report.qualityBuckets.LOW + report.qualityBuckets.MED + report.qualityBuckets.HIGH).toBe(2);
  });
});
