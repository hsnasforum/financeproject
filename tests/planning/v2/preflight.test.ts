import { describe, expect, it } from "vitest";
import { preflightRun } from "../../../src/lib/planning/v2/preflight";

describe("preflightRun", () => {
  it("returns block for debt offer id mismatch", () => {
    const issues = preflightRun({
      profile: {
        monthlyIncomeNet: 4_000_000,
        monthlyEssentialExpenses: 1_500_000,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 1_000_000,
        investmentAssets: 3_000_000,
        debts: [
          { id: "loan-1", name: "L1", balance: 1_000_000, minimumPayment: 50_000 },
        ],
        goals: [],
      },
      debtOffers: [
        { liabilityId: "loan-2", newAprPct: 4.2 },
      ],
    });

    const mismatch = issues.find((issue) => issue.code === "DEBT_OFFER_ID_MISMATCH");
    expect(mismatch?.severity).toBe("block");
    expect(mismatch?.message).toContain("expected ids: loan-1");
    expect((mismatch?.data as { expectedIds?: string[] } | undefined)?.expectedIds).toEqual(["loan-1"]);
  });

  it("returns warn for aprPct in 0~1 scale", () => {
    const issues = preflightRun({
      profile: {
        debts: [
          { id: "loan-1", aprPct: 0.048 },
        ],
        goals: [],
      },
    });

    expect(issues.some((issue) => issue.code === "APR_SCALE_SUSPECTED" && issue.severity === "warn")).toBe(true);
  });

  it("returns block when goal target is lower than current", () => {
    const issues = preflightRun({
      profile: {
        debts: [],
        goals: [
          { id: "goal-1", targetAmount: 1_000_000, currentAmount: 2_000_000 },
        ],
      },
    });

    expect(issues.some((issue) => issue.code === "GOAL_TARGET_LT_CURRENT" && issue.severity === "block")).toBe(true);
  });

  it("returns block when history snapshot selection has empty id", () => {
    const issues = preflightRun({
      profile: {
        debts: [],
        goals: [],
      },
      selectedSnapshot: {
        mode: "history",
        id: "",
      },
    });

    expect(issues.some((issue) => issue.code === "SNAPSHOT_ID_REQUIRED" && issue.severity === "block")).toBe(true);
  });
});
