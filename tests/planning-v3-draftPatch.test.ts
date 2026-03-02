import { describe, expect, it } from "vitest";
import { buildProfileDraftPatchFromCashflow } from "../src/lib/planning/v3/service/draftPatch";

describe("buildProfileDraftPatchFromCashflow", () => {
  it("builds deterministic median-based draft patch with explicit assumptions", () => {
    const draft = buildProfileDraftPatchFromCashflow([
      { month: "2026-01", inflowKrw: 3_000_000, outflowKrw: 1_200_000, netKrw: 1_800_000 },
      { month: "2026-02", inflowKrw: 3_100_000, outflowKrw: 1_350_000, netKrw: 1_750_000 },
      { month: "2026-03", inflowKrw: 2_900_000, outflowKrw: 1_100_000, netKrw: 1_800_000 },
    ]);

    expect(draft).toMatchObject({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 840_000,
      monthlyDiscretionaryExpenses: 360_000,
    });

    expect(draft.assumptions).toEqual([
      "월 수입/지출/순현금흐름은 월별 중앙값(median)으로 계산합니다.",
      "월 지출 분할은 필수 70%, 변동 30% 고정 가정입니다.",
      "초안은 검토용이며 자동 저장/실행하지 않습니다.",
    ]);

    expect(draft.notes).toEqual(["중앙값 순현금흐름: 1800000원"]);
  });
});
