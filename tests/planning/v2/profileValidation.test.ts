import { describe, expect, it } from "vitest";
import { validateProfile } from "../../../src/lib/planning/v2/profileValidation";

describe("validateProfile", () => {
  it("reports duplicate debt ids", () => {
    const issues = validateProfile({
      debts: [{ id: "loan-1" }, { id: "loan-1" }],
    });
    expect(issues.some((issue) => issue.code === "DEBT_ID_DUPLICATE")).toBe(true);
  });

  it("reports offer liability mismatch with expected ids", () => {
    const issues = validateProfile(
      {
        debts: [{ id: "loan-1" }, { id: "loan-2" }],
      },
      {
        offers: [{ liabilityId: "loan-x" }],
      },
    );
    const mismatch = issues.find((issue) => issue.code === "DEBT_OFFER_ID_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("expected ids: loan-1, loan-2");
    expect(mismatch?.message).toContain("loan-x");
  });
});
