import { describe, expect, it } from "vitest";
import { suggestProfileNormalizations } from "../../src/lib/planning/v2/normalizeProfile";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function baseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 2_000_000,
    investmentAssets: 6_000_000,
    debts: [],
    goals: [],
  };
}

describe("suggestProfileNormalizations", () => {
  it("suggests liquid assets unit correction when monthly flows are high", () => {
    const suggestions = suggestProfileNormalizations({
      ...baseProfile(),
      liquidAssets: 350,
    });
    const unit = suggestions.find((item) => item.code === "UNIT_SUSPECTED_LIQUID_ASSETS");
    expect(unit).toBeDefined();
    expect(unit?.patch[0]).toMatchObject({ path: "/liquidAssets", value: 3_500_000 });
  });

  it("suggests investment assets unit correction", () => {
    const suggestions = suggestProfileNormalizations({
      ...baseProfile(),
      investmentAssets: 900,
    });
    expect(suggestions.some((item) => item.code === "UNIT_SUSPECTED_INVESTMENT_ASSETS")).toBe(true);
  });

  it("does not suggest APR scale review for canonical engine apr(decimal) values", () => {
    const suggestions = suggestProfileNormalizations({
      ...baseProfile(),
      debts: [
        {
          id: "loan-1",
          name: "Loan 1",
          balance: 10_000_000,
          minimumPayment: 300_000,
          apr: 0.12,
        },
      ],
    });
    const aprSuggestion = suggestions.find((item) => item.code.startsWith("APR_SCALE_SUSPECTED_"));
    expect(aprSuggestion).toBeUndefined();
  });

  it("suggests APR scale review for legacy aprPct values between 0 and 1", () => {
    const legacyProfile = {
      ...baseProfile(),
      debts: [
        {
          id: "loan-1",
          name: "Loan 1",
          balance: 10_000_000,
          minimumPayment: 300_000,
          aprPct: 0.12,
        },
      ],
    } as unknown as ProfileV2;
    const suggestions = suggestProfileNormalizations(legacyProfile);
    const aprSuggestion = suggestions.find((item) => item.code.startsWith("APR_SCALE_SUSPECTED_"));
    expect(aprSuggestion).toBeDefined();
    expect(aprSuggestion?.patch[0].path).toBe("/debts/0/aprPct");
  });

  it("suggests remainingMonths correction when value is zero", () => {
    const suggestions = suggestProfileNormalizations({
      ...baseProfile(),
      debts: [
        {
          id: "loan-2",
          name: "Loan 2",
          balance: 2_000_000,
          minimumPayment: 150_000,
          remainingMonths: 0,
        },
      ],
    });
    const remaining = suggestions.find((item) => item.code.startsWith("REMAINING_MONTHS_ZERO_"));
    expect(remaining).toBeDefined();
    expect(remaining?.patch[0]).toMatchObject({ path: "/debts/0/remainingMonths", value: 1 });
  });

  it("suggests age/birthYear alignment when mismatch is large", () => {
    const currentYear = new Date().getUTCFullYear();
    const suggestions = suggestProfileNormalizations({
      ...baseProfile(),
      currentAge: 20,
      birthYear: currentYear - 40,
    });
    const mismatch = suggestions.find((item) => item.code === "AGE_BIRTHYEAR_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch?.patch[0].path).toBe("/currentAge");
    expect(typeof mismatch?.patch[0].value).toBe("number");
  });
});
