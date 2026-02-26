import { describe, expect, it } from "vitest";
import { normalizeIssuePath, pathToId } from "../src/lib/forms/ids";

describe("pathToId", () => {
  it("converts dotted path to stable id", () => {
    expect(pathToId("profile.topN")).toBe("profile_topN");
    expect(pathToId("weights.rate")).toBe("weights_rate");
  });

  it("normalizes input prefix and array indexes", () => {
    expect(normalizeIssuePath("input.monthlyIncomeNet")).toBe("monthlyIncomeNet");
    expect(pathToId("input.debts[0].monthlyPayment")).toBe("debts_0_monthlyPayment");
  });

  it("falls back to field prefix for numeric-leading path", () => {
    expect(pathToId("[0].name")).toBe("field_0_name");
    expect(pathToId("   ")).toBe("form");
  });
});
