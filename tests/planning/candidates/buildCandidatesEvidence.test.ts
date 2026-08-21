import { describe, expect, it } from "vitest";
import { buildCandidatesEvidence } from "../../../src/lib/planning/candidates/buildCandidatesEvidence";

describe("buildCandidatesEvidence", () => {
  it("includes formulas, formatted inputs, and assumptions", () => {
    const evidence = buildCandidatesEvidence({
      kind: "deposit",
      termMonths: 12,
      taxRatePct: 15.4,
      usePrimeRate: true,
      depositPrincipalWon: 10_000_000,
      savingMonthlyPaymentWon: 500_000,
    });

    expect(evidence.title).toBe("후보 비교 계산 근거");
    expect(evidence.formula).toContain("공시된 이자 방식(단리/복리)");

    const inputTexts = evidence.inputs.map((entry) => `${entry.label}:${String(entry.value)}`);
    expect(inputTexts.some((text) => text.includes("기간:12개월"))).toBe(true);
    expect(inputTexts.some((text) => text.includes("세율:15.4%"))).toBe(true);
    expect(inputTexts.some((text) => text.includes("예치금(예금):10,000,000원"))).toBe(true);
    expect(inputTexts.some((text) => text.includes("월 납입액(적금):500,000원"))).toBe(true);
    expect(inputTexts.some((text) => text.includes("금리 선택 모드:최고금리 필수"))).toBe(true);

    expect(evidence.assumptions.some((item) => item.includes("세후"))).toBe(true);
    expect(evidence.assumptions.some((item) => item.includes("계산 대상에서 제외"))).toBe(true);
    expect(evidence.assumptions.some((item) => item.includes("공시된 단리(simple) 또는 복리(compound)"))).toBe(true);
    expect(evidence.assumptions.some((item) => item.includes("추정"))).toBe(true);
    expect(evidence.assumptions.some((item) => item.includes("추천이 아닌 비교용"))).toBe(true);
  });
});
