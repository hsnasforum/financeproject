import { describe, expect, it } from "vitest";
import { PlanningV2ValidationError } from "../../../src/lib/planning/core/v2/types";
import { applyProfilePatch, type ScenarioPatch } from "../../../src/lib/planning/v2/profilePatch";
import { type ProfileV2 } from "../../../src/lib/planning/v2/types";

function fixtureProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 3_000_000,
    investmentAssets: 7_000_000,
    debts: [
      {
        id: "debt-a",
        name: "Debt A",
        balance: 20_000_000,
        minimumPayment: 350_000,
        aprPct: 4.8,
        remainingMonths: 84,
      },
    ],
    goals: [],
  };
}

describe("applyProfilePatch", () => {
  it("applies discretionary mul patch without mutating original", () => {
    const base = fixtureProfile();
    const before = structuredClone(base);
    const patch: ScenarioPatch[] = [
      { op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.9 },
    ];

    const next = applyProfilePatch(base, patch);

    expect(base).toStrictEqual(before);
    expect(next.monthlyDiscretionaryExpenses).toBe(720_000);
  });

  it("throws validation error for invalid factor and negative result", () => {
    const base = fixtureProfile();

    expect(() => applyProfilePatch(base, [
      { op: "mul", field: "monthlyIncomeNet", value: 2.5 },
    ])).toThrowError(PlanningV2ValidationError);

    expect(() => applyProfilePatch(base, [
      { op: "set", field: "monthlyIncomeNet", value: -1 },
    ])).toThrowError(PlanningV2ValidationError);
  });

  it("throws validation error when debtId is missing", () => {
    const base = fixtureProfile();
    expect(() => applyProfilePatch(base, [
      { op: "debt.setMinimumPayment", debtId: "missing-debt", value: 200_000 },
    ])).toThrowError(PlanningV2ValidationError);
  });
});

