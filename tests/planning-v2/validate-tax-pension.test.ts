import { describe, expect, it } from "vitest";
import { PlanningV2ValidationError } from "../../src/lib/planning/v2/types";
import { validateProfileV2 } from "../../src/lib/planning/v2/validate";

function baseProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 500_000,
    liquidAssets: 1_000_000,
    investmentAssets: 2_000_000,
    debts: [],
    goals: [],
  };
}

describe("validateProfileV2 tax/pensionsDetailed", () => {
  it("accepts optional tax and pensionsDetailed fields", () => {
    const profile = validateProfileV2({
      ...baseProfile(),
      currentAge: 35,
      birthYear: 1990,
      tax: {
        regime: "KR",
        filingStatus: "single",
        dependents: 2,
      },
      pensionsDetailed: {
        regime: "KR",
        nationalPension: {
          expectedMonthlyPayoutKrw: 850_000,
          startAge: 63,
        },
        retirementPension: {
          type: "IRP",
          expectedMonthlyPayoutKrw: 400_000,
          startAge: 60,
        },
      },
    });

    expect(profile.currentAge).toBe(35);
    expect(profile.birthYear).toBe(1990);
    expect(profile.tax).toEqual({
      regime: "KR",
      filingStatus: "single",
      dependents: 2,
    });
    expect(profile.pensionsDetailed?.regime).toBe("KR");
    expect(profile.pensionsDetailed?.retirementPension?.type).toBe("IRP");
  });

  it("rejects invalid tax/pension values", () => {
    expect(() => validateProfileV2({
      ...baseProfile(),
      currentAge: -1,
      birthYear: 1800,
      tax: {
        regime: "US",
        dependents: -1,
      },
      pensionsDetailed: {
        regime: "KR",
        retirementPension: {
          type: "ETF",
          startAge: 140,
        },
      },
    })).toThrow(PlanningV2ValidationError);
  });
});
