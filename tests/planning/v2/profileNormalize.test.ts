import { describe, expect, it } from "vitest";
import { normalizeProfileInput } from "../../../src/lib/planning/v2/profileNormalize";

describe("normalizeProfileInput", () => {
  it("builds canonical profile from legacy-only input", () => {
    const result = normalizeProfileInput({
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 2_000_000,
      investmentAssets: 3_500_000,
      debts: [
        {
          id: "loan-1",
          name: "주담대",
          balance: 100_000_000,
          apr: 0.048,
          remainingMonths: 240,
          repaymentType: "amortizing",
        },
      ],
      goals: [
        {
          id: "goal-home",
          name: "내집마련",
          targetAmount: 20_000_000,
          currentAmount: 3_000_000,
          targetMonth: 48,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.profile.monthlyIncomeNet).toBe(4_000_000);
    expect(result.profile.liquidAssets).toBe(2_000_000);
    expect(result.profile.debts[0]?.id).toBe("loan-1");
    expect(result.profile.debts[0]?.aprPct).toBeCloseTo(4.8, 8);
    expect(result.profile.goals[0]?.id).toBe("goal-home");
  });

  it("prefers cashflow monthly values when duplicate fields mismatch", () => {
    const result = normalizeProfileInput({
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 2_000_000,
      investmentAssets: 3_000_000,
      debts: [],
      goals: [],
      cashflow: {
        monthlyIncomeKrw: 4_500_000,
        monthlyFixedExpensesKrw: 1_400_000,
        monthlyVariableExpensesKrw: 450_000,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.profile.monthlyIncomeNet).toBe(4_500_000);
    expect(result.profile.monthlyEssentialExpenses).toBe(1_400_000);
    expect(result.profile.monthlyDiscretionaryExpenses).toBe(450_000);
    expect(result.warnings).toContain("DUPLICATE_FIELD_MISMATCH:monthlyIncomeNet");
    expect(result.warnings).toContain("DUPLICATE_FIELD_MISMATCH:monthlyEssentialExpenses");
    expect(result.warnings).toContain("DUPLICATE_FIELD_MISMATCH:monthlyDiscretionaryExpenses");
  });

  it("normalizes legacy decimal apr input into canonical aprPct", () => {
    const result = normalizeProfileInput({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_100_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 1_000_000,
      investmentAssets: 2_000_000,
      debts: [
        {
          id: "loan-1",
          name: "Loan",
          balance: 12_000_000,
          apr: 0.048,
          minimumPayment: 200_000,
        },
      ],
      goals: [],
    });

    expect(result.profile.debts[0]?.aprPct).toBeCloseTo(4.8, 8);
    expect((result.legacy?.debts as Array<{ aprPct?: number }>)[0]?.aprPct).toBeCloseTo(4.8, 8);
  });

  it("keeps percentage apr input as canonical aprPct", () => {
    const result = normalizeProfileInput({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_100_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 1_000_000,
      investmentAssets: 2_000_000,
      debts: [
        {
          id: "loan-1",
          name: "Loan",
          balance: 12_000_000,
          apr: 5.4,
          minimumPayment: 200_000,
        },
      ],
      goals: [],
    });

    expect(result.profile.debts[0]?.aprPct).toBeCloseTo(5.4, 8);
    expect((result.legacy?.debts as Array<{ aprPct?: number }>)[0]?.aprPct).toBeCloseTo(5.4, 8);
  });

  it("preserves debt ids for downstream offer matching", () => {
    const result = normalizeProfileInput({
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 2_000_000,
      investmentAssets: 3_000_000,
      debts: [
        { id: "loan-home", name: "주담대", balance: 90_000_000, apr: 4.1, minimumPayment: 450_000 },
        { id: "loan-car", name: "자동차", balance: 8_000_000, apr: 6.2, minimumPayment: 210_000 },
      ],
      goals: [],
    });

    expect(result.profile.debts.map((debt) => debt.id)).toEqual(["loan-home", "loan-car"]);
  });
});
