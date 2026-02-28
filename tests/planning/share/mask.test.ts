import { describe, expect, it } from "vitest";
import { maskPlan, maskProfile } from "../../../src/lib/planning/share/mask";

function profileFixture() {
  return {
    currentAge: 36,
    birthYear: 1990,
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_300_000,
    investmentAssets: 15_000_000,
    debts: [
      {
        id: "loan-home",
        name: "주택담보대출",
        balance: 120_000_000,
        minimumPayment: 800_000,
      },
    ],
    goals: [
      {
        id: "goal-house",
        name: "집 계약금",
        targetAmount: 50_000_000,
      },
    ],
  };
}

describe("planning share mask", () => {
  it("masks profile amounts/titles and removes birthYear with standard level", () => {
    const masked = maskProfile(profileFixture(), "standard");

    expect(masked.birthYear).toBeUndefined();
    expect(masked.liquidAssets).toBeTypeOf("string");
    expect((masked.debts as Array<{ name?: string }>)?.[0]?.name).toBe("Loan A");
    expect((masked.goals as Array<{ name?: string }>)?.[0]?.name).toBe("Goal 1");
  });

  it("keeps lighter precision for light and broader bands for strict", () => {
    const light = maskProfile(profileFixture(), "light");
    const strict = maskProfile(profileFixture(), "strict");

    expect(String(light.liquidAssets)).toContain("약");
    expect(String(strict.liquidAssets)).toContain("만원");
    expect(typeof strict.currentAge === "string" || typeof strict.currentAge === "number").toBe(true);
  });

  it("masks plan numeric money keys", () => {
    const masked = maskPlan({
      endNetWorthKrw: 123_000_000,
      debtServiceRatio: 0.45,
      nested: { cashKrw: 850_000 },
    }, "standard");

    expect(masked.endNetWorthKrw).toBeTypeOf("string");
    expect((masked.nested as Record<string, unknown>)?.cashKrw).toBeTypeOf("string");
    expect(masked.debtServiceRatio).toBe(0.45);
  });
});
