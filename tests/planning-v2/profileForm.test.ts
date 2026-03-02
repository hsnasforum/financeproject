import { describe, expect, it } from "vitest";
import {
  createDefaultProfileFormModel,
  formModelToProfile,
  profileToFormModel,
  summarizeProfileForm,
  type ProfileFormModel,
} from "../../src/lib/planning/v2/profileForm";

function buildSampleForm(): ProfileFormModel {
  return {
    currentAge: 37,
    monthlyIncomeNet: 5_000_000,
    monthlyEssentialExpenses: 1_800_000,
    monthlyDiscretionaryExpenses: 900_000,
    liquidAssets: 4_000_000,
    investmentAssets: 9_500_000,
    emergencyMonths: 6,
    retirementAge: 60,
    retirementMonthlySpend: 2_200_000,
    debts: [
      {
        id: "loan-1",
        name: "Home Loan",
        balance: 120_000_000,
        aprPct: 4.1,
        remainingMonths: 240,
        repaymentType: "amortizing",
      },
      {
        id: "loan-2",
        name: "Card Loan",
        balance: 8_000_000,
        aprPct: 9.8,
        remainingMonths: 24,
        repaymentType: "interestOnly",
      },
    ],
    lumpSumGoals: [
      {
        id: "goal-1",
        title: "전세 보증금",
        targetAmount: 60_000_000,
        targetMonth: 36,
      },
      {
        id: "goal-2",
        title: "차량 교체",
        targetAmount: 25_000_000,
        targetMonth: 18,
      },
    ],
  };
}

describe("planning profile form conversion", () => {
  it("converts form -> profile -> form with stable core values", () => {
    const form = buildSampleForm();
    const profile = formModelToProfile(form);
    const roundtrip = profileToFormModel(profile);

    expect(roundtrip.monthlyIncomeNet).toBe(form.monthlyIncomeNet);
    expect(roundtrip.monthlyEssentialExpenses).toBe(form.monthlyEssentialExpenses);
    expect(roundtrip.monthlyDiscretionaryExpenses).toBe(form.monthlyDiscretionaryExpenses);
    expect(roundtrip.debts).toHaveLength(2);
    expect(roundtrip.lumpSumGoals).toHaveLength(2);
    expect(roundtrip.retirementAge).toBe(form.retirementAge);
    expect(roundtrip.emergencyMonths).toBe(form.emergencyMonths);
  });

  it("preserves multiple debt/goal rows in converted profile", () => {
    const profile = formModelToProfile(buildSampleForm());

    expect(profile.debts.map((d) => d.id)).toEqual(["loan-1", "loan-2"]);
    expect(profile.goals.some((g) => g.id === "goal-emergency")).toBe(true);
    expect(profile.goals.some((g) => g.id === "goal-retirement")).toBe(true);
    expect(profile.goals.some((g) => g.id === "goal-1")).toBe(true);
    expect(profile.goals.some((g) => g.id === "goal-2")).toBe(true);
  });

  it("creates a usable default form and summary", () => {
    const defaults = createDefaultProfileFormModel();
    const summary = summarizeProfileForm(defaults);

    expect(defaults.debts).toHaveLength(0);
    expect(defaults.lumpSumGoals).toHaveLength(0);
    expect(summary.monthlySurplusKrw).toBe(defaults.monthlyIncomeNet - defaults.monthlyEssentialExpenses - defaults.monthlyDiscretionaryExpenses);
    expect(summary.emergencyTargetKrw).toBe((defaults.monthlyEssentialExpenses + defaults.monthlyDiscretionaryExpenses) * defaults.emergencyMonths);
    expect(summary.debtServiceRatio).toBe(0);
  });

  it("calculates dsr and emergency gap from form summary", () => {
    const form = buildSampleForm();
    const summary = summarizeProfileForm(form);

    expect(summary.debtServiceRatio).toBeGreaterThan(0);
    expect(summary.debtServiceRatio).toBeLessThan(1);
    expect(summary.emergencyTargetKrw).toBe((form.monthlyEssentialExpenses + form.monthlyDiscretionaryExpenses) * form.emergencyMonths);
    expect(summary.emergencyGapKrw).toBeGreaterThanOrEqual(0);
  });
});
