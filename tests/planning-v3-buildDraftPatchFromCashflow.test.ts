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
        suggestedMonthlyEssentialSpendKrw: 800_000,
        suggestedMonthlyDiscretionarySpendKrw: 400_000,
        confidence: "low",
        splitMode: "byCategory",
        evidence: [
          {
            key: "monthly_income",
            title: "월평균 소득",
            formula: "income = median(recent3.inflowKrw)",
            inputs: {
              sampleMonths: 3,
              method: "median",
              medianInflowKrw: 3_500_000,
            },
            assumption: "최근 3개월(가용 범위) 기준",
          },
          {
            key: "monthly_essential_spend",
            title: "월평균 필수지출",
            formula: "essential = median(recent3.fixedOutflowKrw)",
            inputs: {
              sampleMonths: 3,
              medianOutflowKrw: 1_200_000,
              medianFixedOutflowKrw: 800_000,
              medianVariableOutflowKrw: 400_000,
              valueKrw: 800_000,
            },
            assumption: "split mode byCategory (rule-based categorization)",
          },
          {
            key: "monthly_discretionary_spend",
            title: "월평균 변동지출",
            formula: "discretionary = median(recent3.variableOutflowKrw)",
            inputs: {
              sampleMonths: 3,
              medianOutflowKrw: 1_200_000,
              medianVariableOutflowKrw: 400_000,
              valueKrw: 400_000,
            },
            assumption: "split mode byCategory (rule-based categorization)",
          },
        ],
      },
      profilePatch: {
        monthlyIncomeNet: 3_500_000,
        monthlyEssentialExpenses: 800_000,
        monthlyDiscretionaryExpenses: 400_000,
      },
    });
  });
});
