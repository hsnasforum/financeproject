import { describe, expect, it } from "vitest";
import {
  createPlaceholderTaxPensionProvider,
  TAX_PENSION_PLACEHOLDER_NOTE,
} from "../../../src/lib/planning/providers/taxPensionProvider";

describe("taxPensionProvider placeholder", () => {
  it("returns applied=false and placeholder note", () => {
    const provider = createPlaceholderTaxPensionProvider();
    const explained = provider.explain({
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 1_000_000,
      investmentAssets: 2_000_000,
      debts: [],
      goals: [],
    });

    expect(explained.applied).toBe(false);
    expect(explained.notes).toEqual([TAX_PENSION_PLACEHOLDER_NOTE]);
  });
});

