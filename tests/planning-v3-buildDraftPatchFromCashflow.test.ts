import { describe, expect, it } from "vitest";
import { type MonthlyCashflow } from "../src/lib/planning/v3/domain/types";
import { buildDraftPatchFromCashflow } from "../src/lib/planning/v3/service/buildDraftPatchFromCashflow";

const cashflow: MonthlyCashflow[] = [
  {
    month: "2025-12",
    inflowKrw: 2_000_000,
    outflowKrw: 700_000,
    fixedOutflowKrw: 500_000,
    variableOutflowKrw: 200_000,
    netKrw: 1_300_000,
    ym: "2025-12",
    incomeKrw: 2_000_000,
    expenseKrw: -700_000,
    txCount: 10,
    daysCovered: 30,
  },
  {
    month: "2026-01",
    inflowKrw: 3_000_000,
    outflowKrw: 1_000_000,
    fixedOutflowKrw: 700_000,
    variableOutflowKrw: 300_000,
    netKrw: 2_000_000,
    ym: "2026-01",
    incomeKrw: 3_000_000,
    expenseKrw: -1_000_000,
    txCount: 10,
    daysCovered: 31,
  },
  {
    month: "2026-02",
    inflowKrw: 3_500_000,
    outflowKrw: 1_200_000,
    fixedOutflowKrw: 800_000,
    variableOutflowKrw: 400_000,
    netKrw: 2_300_000,
    ym: "2026-02",
    incomeKrw: 3_500_000,
    expenseKrw: -1_200_000,
    txCount: 10,
    daysCovered: 28,
  },
  {
    month: "2026-03",
    inflowKrw: 4_000_000,
    outflowKrw: 1_400_000,
    fixedOutflowKrw: 900_000,
    variableOutflowKrw: 500_000,
    netKrw: 2_600_000,
    ym: "2026-03",
    incomeKrw: 4_000_000,
    expenseKrw: -1_400_000,
    txCount: 10,
    daysCovered: 18,
  },
];

describe("planning v3 buildDraftPatchFromCashflow", () => {
  it("builds deterministic median-based patch with evidence", () => {
    const first = buildDraftPatchFromCashflow(cashflow);
    const second = buildDraftPatchFromCashflow(cashflow);

    expect(first).toEqual(second);
    expect(first).toEqual({
      draftPatch: {
        suggestedMonthlyIncomeKrw: 3_500_000,
        suggestedMonthlyEssentialSpendKrw: 920_000,
        suggestedMonthlyDiscretionarySpendKrw: 280_000,
        confidence: "low",
        evidence: [
          {
            rule: "income = median(recent3.inflowKrw)",
            valueKrw: 3_500_000,
          },
          {
            rule: "essential = median(recent3.fixedOutflowKrw) + median(recent3.variableOutflowKrw) * 0.3",
            valueKrw: 920_000,
          },
          {
            rule: "discretionary = median(recent3.variableOutflowKrw) * 0.7",
            valueKrw: 280_000,
          },
        ],
      },
      profilePatch: {
        monthlyIncomeNet: 3_500_000,
        monthlyEssentialExpenses: 920_000,
        monthlyDiscretionaryExpenses: 280_000,
      },
    });
  });
});
