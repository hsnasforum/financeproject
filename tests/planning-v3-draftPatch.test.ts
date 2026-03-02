import { describe, expect, it } from "vitest";
import { buildProfileDraftPatchFromCashflow } from "../src/lib/planning/v3/service/draftPatch";

describe("buildProfileDraftPatchFromCashflow", () => {
  it("builds deterministic median-based draft patch", () => {
    const draft = buildProfileDraftPatchFromCashflow([
      { ym: "2026-01", income: 3_000_000, expense: 1_200_000, net: 1_800_000, txCount: 3 },
      { ym: "2026-02", income: 3_100_000, expense: 1_350_000, net: 1_750_000, txCount: 3 },
      { ym: "2026-03", income: 2_900_000, expense: 1_100_000, net: 1_800_000, txCount: 3 },
    ]);

    expect(draft).toEqual({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 840_000,
      monthlyDiscretionaryExpenses: 360_000,
      assumptions: [
        "월 수입/지출은 월별 중앙값(median) 기준 추정치입니다.",
        "월 지출은 필수 70% / 재량 30% 고정 분할 가정을 사용합니다.",
        "초안은 저장/실행 전 검토용입니다.",
      ],
      monthsConsidered: 3,
    });
  });
});
