import { describe, expect, it } from "vitest";
import { applySuggestions } from "../../src/lib/planning/v2/applySuggestions";
import { suggestProfileNormalizations } from "../../src/lib/planning/v2/normalizeProfile";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function profileWithSuggestions(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 300,
    investmentAssets: 400,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 4_000_000,
        minimumPayment: 200_000,
        remainingMonths: 0,
      },
    ],
    goals: [],
  };
}

describe("applySuggestions", () => {
  it("applies only accepted suggestion codes", () => {
    const profile = profileWithSuggestions();
    const suggestions = suggestProfileNormalizations(profile);
    const acceptOne = suggestions.find((item) => item.code === "UNIT_SUSPECTED_LIQUID_ASSETS");
    expect(acceptOne).toBeDefined();

    const next = applySuggestions(profile, [acceptOne!.code]);
    expect(next.liquidAssets).toBe(3_000_000);
    expect(next.investmentAssets).toBe(400);
    expect(next.debts[0].remainingMonths).toBe(0);
  });

  it("keeps profile unchanged when accepted code list is empty", () => {
    const profile = profileWithSuggestions();
    const next = applySuggestions(profile, []);
    expect(next).toEqual(profile);
  });

  it("applies multiple suggestions together", () => {
    const profile = profileWithSuggestions();
    const codes = suggestProfileNormalizations(profile).map((item) => item.code);
    const next = applySuggestions(profile, codes);

    expect(next.liquidAssets).toBe(3_000_000);
    expect(next.investmentAssets).toBe(4_000_000);
    expect(next.debts[0].remainingMonths).toBe(1);
  });
});
