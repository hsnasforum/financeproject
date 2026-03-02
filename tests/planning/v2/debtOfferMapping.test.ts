import { describe, expect, it } from "vitest";
import { formatExpectedDebtIds, validateDebtOfferLiabilityIds } from "../../../src/lib/planning/v2/debtOfferMapping";

describe("debtOfferMapping", () => {
  it("passes when all offers match known debt ids", () => {
    const result = validateDebtOfferLiabilityIds(
      [
        { liabilityId: "loan-1" },
        { liabilityId: "loan-2" },
      ],
      ["loan-1", "loan-2"],
    );
    expect(result.ok).toBe(true);
    expect(result.mismatchedIds).toEqual([]);
    expect(result.expectedIds).toEqual(["loan-1", "loan-2"]);
  });

  it("returns mismatched liability ids with expected id list", () => {
    const result = validateDebtOfferLiabilityIds(
      [
        { liabilityId: "loan-1" },
        { liabilityId: "loan-x" },
        { liabilityId: "" },
      ],
      ["loan-1", "loan-2"],
    );
    expect(result.ok).toBe(false);
    expect(result.expectedIds).toEqual(["loan-1", "loan-2"]);
    expect(result.mismatchedIds).toEqual(["loan-x", ""]);
    expect(formatExpectedDebtIds(result.expectedIds)).toBe("loan-1, loan-2");
  });
});
