import { describe, expect, it } from "vitest";
import { buildPlanningWizardOutput } from "../../../src/app/planning/_lib/planningOnboardingWizard";
import { loadCanonicalProfile } from "../../../src/lib/planning/v2/loadCanonicalProfile";

describe("planning onboarding wizard model", () => {
  it("produces deterministic defaultsApplied list for identical draft", () => {
    const draft = {
      monthlyIncomeNet: 5_000_000,
      monthlyEssentialExpenses: 2_000_000,
      monthlyDiscretionaryExpenses: 1_000_000,
      debts: [
        {
          name: "주담대",
          balance: 80_000_000,
          aprPct: 0.048,
        },
      ],
      goals: [],
    };

    const a = buildPlanningWizardOutput(draft);
    const b = buildPlanningWizardOutput(draft);
    expect(a.defaultsApplied.items).toEqual(b.defaultsApplied.items);
    expect(a.defaultsApplied.items).toContain("LIQUID_ASSETS_DEFAULTED");
    expect(a.defaultsApplied.items).toContain("INVESTMENT_ASSETS_DEFAULTED");
    expect(a.defaultsApplied.items).toContain("DEBT_1_APR_DECIMAL_NORMALIZED");
    expect(a.defaultsApplied.items).toContain("GOALS_EMPTY_DEFAULT_EMERGENCY_CREATED");
  });

  it("output passes migrate->normalize->validate canonical pipeline", () => {
    const output = buildPlanningWizardOutput({
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_600_000,
      monthlyDiscretionaryExpenses: 900_000,
      liquidAssets: 2_500_000,
      investmentAssets: 3_000_000,
      debts: [
        {
          id: "loan-1",
          name: "신용대출",
          balance: 10_000_000,
          aprPct: 0.12,
          monthlyPayment: 240_000,
        },
      ],
      goals: [
        {
          name: "목돈 목표",
          targetAmount: 20_000_000,
          targetMonth: 48,
        },
      ],
    });

    expect(output.schemaVersion).toBe(2);
    expect(output.profile.debts[0]?.aprPct).toBeCloseTo(12, 8);

    const canonical = loadCanonicalProfile(output.profile);
    expect(canonical.schemaVersion).toBe(2);
    expect(canonical.profile.defaultsApplied?.items).toEqual(output.defaultsApplied.items);
    expect(canonical.profile.debts[0]?.aprPct).toBeCloseTo(12, 8);
  });
});
