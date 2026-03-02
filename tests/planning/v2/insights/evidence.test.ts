import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNING_POLICY } from "../../../../src/lib/planning/catalog/planningPolicy";
import { buildEvidence } from "../../../../src/lib/planning/v2/insights/evidence";

describe("buildEvidence", () => {
  it("returns core evidence ids with unit-formatted values", () => {
    const items = buildEvidence(
      {
        summaryCards: {
          monthlySurplusKrw: 1_250_000,
          dsrPct: 42.3,
          emergencyFundMonths: 2.8,
          totalMonthlyDebtPaymentKrw: 900_000,
        },
        evidence: {
          summary: {
            monthlySurplusKrw: {
              metric: "monthlySurplusKrw",
              formula: "monthlySurplusKrw = monthlyIncomeKrw - monthlyExpensesKrw - monthlyDebtPaymentKrw",
              inputs: {
                monthlyIncomeKrw: 5_500_000,
                monthlyExpensesKrw: 3_350_000,
                monthlyDebtPaymentKrw: 900_000,
              },
              assumptions: ["month=start 기준"],
            },
            dsrPct: {
              metric: "dsrPct",
              formula: "dsrPct = (monthlyDebtPaymentKrw / monthlyIncomeKrw) * 100",
              inputs: {
                monthlyDebtPaymentKrw: 900_000,
                monthlyIncomeKrw: 5_500_000,
              },
              assumptions: ["표시는 % 단위"],
            },
            emergencyFundMonths: {
              metric: "emergencyFundMonths",
              formula: "emergencyFundMonths = emergencyFundKrw / monthlyExpensesKrw",
              inputs: {
                emergencyFundKrw: 8_900_000,
                monthlyExpensesKrw: 3_350_000,
              },
              assumptions: ["개월 단위"],
            },
          },
        },
      },
      DEFAULT_PLANNING_POLICY,
    );

    expect(items.map((item) => item.id)).toEqual(["monthlySurplus", "dsrPct", "emergency"]);
    const serialized = JSON.stringify(items);
    expect(serialized).toContain("원");
    expect(serialized).toContain("%");
    expect(serialized).toContain("개월");
  });

  it("does not leak raw blobs or secrets in evidence payload", () => {
    const items = buildEvidence(
      {
        summaryCards: {
          monthlySurplusKrw: 0,
        },
      },
      DEFAULT_PLANNING_POLICY,
    );

    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain("runJson");
    expect(serialized).not.toContain("outputs");
    expect(serialized).not.toContain("process.env");
    expect(serialized).not.toContain("GITHUB_TOKEN");
    expect(serialized).not.toContain("ECOS_API_KEY");
    expect(serialized).not.toContain("Bearer ");
    expect(serialized).not.toContain(".data/");
  });
});
