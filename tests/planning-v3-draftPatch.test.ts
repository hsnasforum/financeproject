import { describe, expect, it } from "vitest";
import { buildProfileV2DraftPatch } from "../src/lib/planning/v3/service/draftPatch";

describe("buildProfileDraftPatchFromCashflow", () => {
  it("builds deterministic median-based draft patch", () => {
    const draft = buildProfileV2DraftPatch([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);

    expect(draft).toEqual({
      monthlyIncomeNet: 3_101_234,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 1_050_000,
      assumptions: [
        "monthlyIncomeNet uses median recent inflow (assumption)",
        "split mode byCategory (rule-based categorization)",
      ],
      monthsConsidered: 3,
    });
  });
});
