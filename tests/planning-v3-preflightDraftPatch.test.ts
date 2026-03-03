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

