import { describe, expect, it } from "vitest";
import { buildMetricEvidence } from "../../../src/app/planning/_lib/metricEvidence";
import { type ProfileV2 } from "../../../src/lib/planning/v2/types";

function profileFixture(overrides?: Partial<ProfileV2>): ProfileV2 {
  return {
    monthlyIncomeNet: 4_800_000,
    monthlyEssentialExpenses: 1_900_000,
    monthlyDiscretionaryExpenses: 900_000,
    liquidAssets: 2_400_000,
    investmentAssets: 5_000_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 20_000_000,
        minimumPayment: 420_000,
        aprPct: 4.8,
        remainingMonths: 120,
        repaymentType: "amortizing",
      },
    ],
    goals: [],
    ...overrides,
  };
}

describe("buildMetricEvidence", () => {
  it("returns monthlySurplus/dsrPct/emergency ids", () => {
    const items = buildMetricEvidence({
      profile: profileFixture(),
      policyId: "balanced",
    });
    expect(items.map((item) => item.id)).toEqual(["monthlySurplus", "dsrPct", "emergency"]);
  });

  it("includes policy minEmergencyMonths in emergency assumptions", () => {
    const items = buildMetricEvidence({
      profile: profileFixture(),
      policyId: "safety",
    });
    const emergency = items.find((item) => item.id === "emergency");
    expect(emergency).toBeDefined();
    expect(emergency?.assumptions.join(" ")).toContain("6개월");
  });

  it("handles incomeNet=0 without crashing and marks dsr as N/A", () => {
    const items = buildMetricEvidence({
      profile: profileFixture({
        monthlyIncomeNet: 0,
      }),
      policyId: "balanced",
    });
    const dsr = items.find((item) => item.id === "dsrPct");
    expect(dsr).toBeDefined();
    const dsrInput = dsr?.inputs.find((row) => row.label === "DSR");
    expect(dsrInput?.value).toBe("N/A");
  });
});
