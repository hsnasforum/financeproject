import { describe, expect, it } from "vitest";
import { type ProfileV2 } from "../src/lib/planning/v2/types";
import { applyDraftToProfile } from "../src/lib/planning/v3/service/applyDraftToProfile";
import { type V3DraftRecord } from "../src/lib/planning/v3/domain/draft";

function baseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 3_000_000,
    monthlyEssentialExpenses: 1_300_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 12_000_000,
    investmentAssets: 8_000_000,
    debts: [
      {
        id: "debt-1",
        name: "Loan",
        balance: 9_000_000,
        minimumPayment: 300_000,
        aprPct: 5.5,
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "Emergency",
        targetAmount: 20_000_000,
        currentAmount: 5_000_000,
      },
    ],
  };
}

function draft(): V3DraftRecord {
  return {
    id: "draft-1",
    createdAt: "2026-03-03T00:00:00.000Z",
    source: { kind: "csv", rows: 10, months: 3 },
    cashflow: [
      { ym: "2026-01", incomeKrw: 3_400_000, expenseKrw: -2_000_000, netKrw: 1_400_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_200_000, expenseKrw: -1_900_000, netKrw: 1_300_000, txCount: 4 },
    ],
    draftPatch: {
      monthlyIncomeNet: 3_300_000,
      monthlyEssentialExpenses: 1_450_000,
      monthlyDiscretionaryExpenses: 650_000,
      assumptions: ["median monthly net", "70/30 split"],
      monthsConsidered: 2,
    },
    summary: {
      medianIncomeKrw: 3_300_000,
      medianExpenseKrw: 1_950_000,
      avgNetKrw: 1_350_000,
    },
  };
}

describe("applyDraftToProfile", () => {
  it("applies draftPatch to profile deterministically", () => {
    const first = applyDraftToProfile({ baseProfile: baseProfile(), draft: draft() });
    const second = applyDraftToProfile({ baseProfile: baseProfile(), draft: draft() });

    expect(first).toEqual(second);
    expect(first.merged.monthlyIncomeNet).toBe(3_300_000);
    expect(first.merged.monthlyEssentialExpenses).toBe(1_450_000);
    expect(first.merged.monthlyDiscretionaryExpenses).toBe(650_000);
    expect(first.summary.changedFields).toEqual([
      "monthlyDiscretionaryExpenses",
      "monthlyEssentialExpenses",
      "monthlyIncomeNet",
    ]);
    expect(first.summary.notes.length).toBeGreaterThan(0);
  });
});
