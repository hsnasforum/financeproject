import { describe, expect, it } from "vitest";
import { PlanningV2ValidationError } from "../../../src/lib/planning/core/v2/types";
import {
  createDefaultProfileFormModel,
  deriveSummary,
  fromProfileJson,
  normalizeDraft,
  normalizeDraftWithDisclosure,
  toProfileJson,
  validateDebtOfferLiabilityIds,
  validateProfile,
  validateProfileForm,
} from "../../../src/app/planning/_lib/profileFormModel";

describe("planning profileFormModel", () => {
  it("supports profile json -> form -> profile roundtrip for core fields", () => {
    const input = {
      monthlyIncomeNet: 5_100_000,
      monthlyEssentialExpenses: 1_900_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 3_400_000,
      investmentAssets: 8_200_000,
      debts: [
        {
          id: "loan-1",
          name: "주담대",
          balance: 120_000_000,
          apr: 4.2,
          remainingMonths: 240,
          repaymentType: "amortizing",
        },
      ],
      goals: [
        {
          id: "goal-emergency",
          name: "비상금",
          targetAmount: 12_000_000,
          currentAmount: 3_400_000,
          targetMonth: 12,
          priority: 5,
          minimumMonthlyContribution: 0,
        },
      ],
    };

    const form = fromProfileJson(input, "테스트");
    const profile = toProfileJson(form);

    expect(profile.monthlyIncomeNet).toBe(5_100_000);
    expect(profile.monthlyEssentialExpenses).toBe(1_900_000);
    expect(profile.monthlyDiscretionaryExpenses).toBe(700_000);
    expect(profile.debts).toHaveLength(1);
    expect(profile.goals).toHaveLength(1);
    expect(profile.debts[0]?.aprPct).toBeCloseTo(4.2, 6);
    expect(profile.goals[0]?.name).toBe("Emergency Fund");
  });

  it("maps minimumPayment <-> monthlyPayment on form boundary", () => {
    const form = fromProfileJson({
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 3_000_000,
      investmentAssets: 6_000_000,
      debts: [
        {
          id: "loan-1",
          name: "Loan",
          balance: 40_000_000,
          minimumPayment: 550_000,
          apr: 4.8,
          remainingMonths: 120,
        },
      ],
      goals: [],
    });

    expect(form.debts[0]?.monthlyPayment).toBe(550_000);
    const profile = toProfileJson(form);
    expect(profile.debts[0]?.minimumPayment).toBe(550_000);
  });

  it("converts decimal apr (0.048) into aprPct 4.8 for form view", () => {
    const form = fromProfileJson({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_000_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 1_000_000,
      investmentAssets: 0,
      debts: [
        {
          id: "loan-1",
          name: "Loan",
          balance: 10_000_000,
          apr: 0.048,
          remainingMonths: 60,
        },
      ],
      goals: [],
    });

    expect(form.debts[0]?.aprPct).toBeCloseTo(4.8, 6);
  });

  it("validates debt offer liability ids against profile debts", () => {
    const invalid = validateDebtOfferLiabilityIds(
      [
        { liabilityId: "loan-1" },
        { liabilityId: "loan-2" },
        { liabilityId: "" },
      ],
      [
        { id: "loan-1" },
        { id: "loan-3" },
      ],
    );

    expect(invalid).toEqual(["loan-2"]);
  });

  it("fails validation when debt ids are duplicated", () => {
    const form = createDefaultProfileFormModel();
    form.debts = [
        {
          id: "loan-x",
          name: "대출A",
          balance: 10_000_000,
          monthlyPayment: 200_000,
          aprPct: 4.0,
          remainingMonths: 60,
          repaymentType: "amortizing",
        },
        {
          id: "loan-x",
          name: "대출B",
          balance: 5_000_000,
          monthlyPayment: 100_000,
          aprPct: 5.0,
          remainingMonths: 48,
          repaymentType: "amortizing",
        },
      ];

    const validation = validateProfileForm(form);
    expect(validation.errors.some((line) => line.includes("id가 중복"))).toBe(true);
  });

  it("normalizeDraft converts legacy decimal apr to percent aprPct", () => {
    const normalized = normalizeDraft({
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_700_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 2_000_000,
      investmentAssets: 5_000_000,
      debts: [
        {
          id: "loan-legacy",
          name: "레거시 대출",
          balance: 20_000_000,
          apr: 0.048,
          monthlyPayment: 300_000,
          remainingMonths: 72,
          repaymentType: "amortizing",
        },
      ],
      goals: [],
    });

    expect(normalized.debts[0]?.aprPct).toBeCloseTo(4.8, 6);
  });

  it("normalizeDraftWithDisclosure records APR decimal -> percent fix", () => {
    const normalized = normalizeDraftWithDisclosure({
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_700_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 2_000_000,
      investmentAssets: 5_000_000,
      debts: [
        {
          id: "loan-legacy",
          name: "레거시 대출",
          balance: 20_000_000,
          aprPct: 0.048,
          monthlyPayment: 300_000,
          remainingMonths: 72,
          repaymentType: "amortizing",
        },
      ],
      goals: [],
    });

    const aprFix = normalized.normalization.fixesApplied.find((item) => item.path === "/debts/0/aprPct");
    expect(aprFix).toBeDefined();
    expect(Number(aprFix?.from)).toBeCloseTo(0.048, 8);
    expect(Number(aprFix?.to)).toBeCloseTo(4.8, 8);
  });

  it("normalizeDraft generates unique debt ids when source ids are missing", () => {
    const normalized = normalizeDraft({
      monthlyIncomeNet: 3_200_000,
      monthlyEssentialExpenses: 1_300_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 1_100_000,
      investmentAssets: 2_400_000,
      debts: [
        {
          id: "debt-1",
          name: "기존 대출",
          balance: 5_000_000,
          aprPct: 4.8,
          monthlyPayment: 120_000,
          remainingMonths: 48,
        },
        {
          name: "신규 대출 A",
          balance: 3_000_000,
          aprPct: 5.2,
          monthlyPayment: 80_000,
          remainingMonths: 36,
        },
        {
          name: "신규 대출 B",
          balance: 2_000_000,
          aprPct: 6.1,
          monthlyPayment: 60_000,
          remainingMonths: 24,
        },
      ],
      goals: [],
    });

    const ids = normalized.debts.map((debt) => debt.id);
    expect(ids).toEqual(["debt-1", "debt-2", "debt-3"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validateProfile returns path-based error for duplicate debt ids", () => {
    const validation = validateProfile({
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_700_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 2_000_000,
      investmentAssets: 5_000_000,
      debts: [
        {
          id: "loan-dup",
          name: "대출1",
          balance: 20_000_000,
          aprPct: 4.8,
          monthlyPayment: 300_000,
          remainingMonths: 72,
          repaymentType: "amortizing",
        },
        {
          id: "loan-dup",
          name: "대출2",
          balance: 8_000_000,
          aprPct: 6.1,
          monthlyPayment: 150_000,
          remainingMonths: 48,
          repaymentType: "amortizing",
        },
      ],
      goals: [],
    });
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.path === "debts[1].id" && issue.severity === "error")).toBe(true);
  });

  it("deriveSummary calculates monthly surplus, dsr and emergency gap", () => {
    const summary = deriveSummary({
      monthlyIncomeNet: 5_000_000,
      monthlyEssentialExpenses: 2_000_000,
      monthlyDiscretionaryExpenses: 1_000_000,
      liquidAssets: 3_000_000,
      investmentAssets: 7_000_000,
      debts: [
        {
          id: "loan-1",
          name: "주담대",
          balance: 50_000_000,
          aprPct: 4.8,
          monthlyPayment: 500_000,
          remainingMonths: 120,
          repaymentType: "amortizing",
        },
      ],
      goals: [
        {
          id: "goal-emergency",
          name: "비상금",
          targetAmount: 18_000_000,
          currentAmount: 3_000_000,
          targetMonth: 12,
          priority: 5,
          minimumMonthlyContribution: 0,
        },
      ],
    });

    expect(summary.monthlySurplusKrw).toBe(2_000_000);
    expect(summary.estimatedMonthlyDebtPaymentKrw).toBe(500_000);
    expect(summary.debtServiceRatio).toBeCloseTo(0.1, 6);
    expect(summary.dsrPct).toBeCloseTo(10, 6);
    expect(summary.monthlySurplus).toBe(2_000_000);
    expect(summary.totalDebtPayment).toBe(500_000);
    expect(summary.emergencyTargetKrw).toBe(18_000_000);
    expect(summary.emergencyGapKrw).toBe(15_000_000);
    expect(summary.emergencyTarget).toBe(18_000_000);
    expect(summary.emergencyGap).toBe(15_000_000);
    expect(summary.emergencyMonths).toBe(6);
  });

  it("normalizeDraftWithDisclosure fails anomalies with field-path errors", () => {
    try {
      normalizeDraftWithDisclosure({
        monthlyIncomeNet: 4_200_000,
        monthlyEssentialExpenses: 1_700_000,
        monthlyDiscretionaryExpenses: 700_000,
        liquidAssets: 2_000_000,
        investmentAssets: 5_000_000,
        debts: [],
        goals: [
          {
            id: "goal-1",
            name: "역전 목표",
            targetAmount: 5_000_000,
            currentAmount: 7_000_000,
          },
        ],
      });
      throw new Error("expected PlanningV2ValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningV2ValidationError);
      const issues = (error as PlanningV2ValidationError).issues;
      expect(issues.some((issue) => issue.path === "goals[0]" && issue.message.includes("targetAmount"))).toBe(true);
    }
  });
});
