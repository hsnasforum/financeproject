import { describe, expect, it } from "vitest";
import { type ProfileV2 } from "../src/lib/planning/v2/types";
import { preflightDraftPatch } from "../src/lib/planning/v3/service/preflightDraftPatch";

function makeBaseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 2_400_000,
    monthlyEssentialExpenses: 1_000_000,
    monthlyDiscretionaryExpenses: 350_000,
    liquidAssets: 2_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

describe("preflightDraftPatch", () => {
  it.each([false, true])("warns for debt in any observed month even when its median is zero (base=%s)", (withBase) => {
    const result = preflightDraftPatch({ draftPatch: {}, ...(withBase ? { baseProfile: makeBaseProfile() } : {}),
      evidence: { ymStats: [0, 0, 500_000].map((debtExpenseKrw, index) => ({ ym: `2026-0${index + 1}`,
        incomeKrw: 0, expenseKrw: debtExpenseKrw, fixedExpenseKrw: debtExpenseKrw, variableExpenseKrw: 0, debtExpenseKrw, transferKrw: 0 })) },
    });
    expect(result.ok).toBe(true); // Warnings remain reviewable, not a new write/validation gate.
    expect(result.changes).toEqual([]);
    expect(result.warnings.map((row) => row.code)).toContain("OBSERVED_DEBT_WITHOUT_PROFILE_DEBT");
    expect(result.summary.warningCount).toBe(withBase ? 1 : 2);
  });

  it("does not add a debt warning for zero debt evidence", () => {
    const baseProfile = makeBaseProfile();
    const result = preflightDraftPatch({ draftPatch: {}, baseProfile, evidence: { ymStats: [{ ym: "2026-08",
      incomeKrw: 0, expenseKrw: 0, fixedExpenseKrw: 0, variableExpenseKrw: 0, debtExpenseKrw: 0, transferKrw: 0 }] } });
    expect(result.warnings).toEqual([]);
    expect(baseProfile.debts).toEqual([]);
  });

  it("builds deterministic changes with before/after when base profile exists", () => {
    const result = preflightDraftPatch({
      baseProfile: makeBaseProfile(),
      draftPatch: {
        monthlyIncomeNet: 2_700_000,
        monthlyDiscretionaryExpenses: 420_000,
      },
      targetProfileId: "p-1",
    });

    expect(result.ok).toBe(true);
    expect(result.targetProfileId).toBe("p-1");
    expect(result.changes).toEqual([
      {
        path: "/monthlyDiscretionaryExpenses",
        before: 350000,
        after: 420000,
        kind: "set",
      },
      {
        path: "/monthlyIncomeNet",
        before: 2400000,
        after: 2700000,
        kind: "set",
      },
    ]);
    expect(result.summary.changedCount).toBe(2);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
  });

  it("returns after-only changes when base profile is not provided", () => {
    const result = preflightDraftPatch({
      draftPatch: {
        monthlyIncomeNet: 1_500_000,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([
      {
        path: "/monthlyIncomeNet",
        after: 1500000,
        kind: "set",
      },
    ]);
    expect(result.warnings.map((row) => row.code)).toContain("NO_BASE_PROFILE");
  });

  it("fills validation errors when merged profile violates v2 schema", () => {
    const result = preflightDraftPatch({
      baseProfile: makeBaseProfile(),
      draftPatch: {
        monthlyIncomeNet: -1,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((row) => row.path === "/monthlyIncomeNet")).toBe(true);
    expect(result.summary.errorCount).toBe(result.errors.length);
  });

  it("is deterministic for equivalent patch objects with different key order", () => {
    const baseProfile = makeBaseProfile();
    const left = preflightDraftPatch({
      baseProfile,
      draftPatch: {
        monthlyIncomeNet: 2_500_000,
        monthlyEssentialExpenses: 1_100_000,
      },
    });
    const right = preflightDraftPatch({
      baseProfile,
      draftPatch: {
        monthlyEssentialExpenses: 1_100_000,
        monthlyIncomeNet: 2_500_000,
      },
    });

    expect(left).toStrictEqual(right);
  });
});
