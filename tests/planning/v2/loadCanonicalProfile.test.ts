import { describe, expect, it } from "vitest";
import { loadCanonicalProfile, migrateProfile } from "../../../src/lib/planning/v2/loadCanonicalProfile";
import { computeProfileHash } from "../../../src/lib/planning/v2/reproducibility";
import { PlanningV2ValidationError } from "../../../src/lib/planning/core/v2/types";

function baseProfile() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_000_000,
    investmentAssets: 2_000_000,
    debts: [
      {
        id: "loan-1",
        name: "대출",
        balance: 10_000_000,
        minimumPayment: 300_000,
        remainingMonths: 48,
      },
    ],
    goals: [],
  };
}

describe("loadCanonicalProfile", () => {
  it("migrates legacy decimal APR to percent aprPct", () => {
    const profile = migrateProfile({
      ...baseProfile(),
      debts: [
        {
          ...baseProfile().debts[0],
          apr: 0.048,
        },
      ],
    });

    expect(profile.debts[0]?.aprPct).toBeCloseTo(4.8, 8);
  });

  it("treats missing schemaVersion as legacy and upgrades to v2", () => {
    const result = loadCanonicalProfile({
      ...baseProfile(),
      debts: [
        {
          ...baseProfile().debts[0],
          aprPct: 5.1,
        },
      ],
    });

    expect(result.schemaVersion).toBe(2);
    expect(result.migratedFrom).toBe(1);
  });

  it("produces stable profileHash for canonical-equivalent inputs", () => {
    const a = loadCanonicalProfile({
      ...baseProfile(),
      debts: [
        {
          ...baseProfile().debts[0],
          apr: 0.051,
        },
      ],
    }).profile;

    const b = loadCanonicalProfile({
      investmentAssets: 2_000_000,
      liquidAssets: 1_000_000,
      monthlyDiscretionaryExpenses: 700_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyIncomeNet: 4_200_000,
      goals: [],
      debts: [
        {
          name: "대출",
          id: "loan-1",
          balance: 10_000_000,
          minimumPayment: 300_000,
          aprPct: 5.1,
          remainingMonths: 48,
        },
      ],
    }).profile;

    expect(computeProfileHash(a)).toBe(computeProfileHash(b));
  });

  it("records normalization fix when legacy decimal APR is converted to percent", () => {
    const result = loadCanonicalProfile({
      ...baseProfile(),
      debts: [
        {
          ...baseProfile().debts[0],
          aprPct: 0.048,
        },
      ],
    });

    const aprFix = result.normalization.fixesApplied.find((item) => item.path === "/debts/0/aprPct");
    expect(aprFix).toBeDefined();
    expect(aprFix?.from).toBe(0.048);
    expect(aprFix?.to).toBeCloseTo(4.8, 8);
  });

  it("fails invalid anomalies with actionable field-path issues", () => {
    try {
      loadCanonicalProfile({
        ...baseProfile(),
        goals: [
          {
            id: "goal-1",
            name: "역전 목표",
            targetAmount: 10_000_000,
            currentAmount: 12_000_000,
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
