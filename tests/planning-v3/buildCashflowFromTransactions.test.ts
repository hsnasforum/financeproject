import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvAccountSourceProvider } from "../../src/lib/planning/v3/providers/csvAccountSourceProvider";
import {
  buildCashflowFromTransactions,
  buildProfileDraftFromCashflow,
} from "../../src/lib/planning/v3/service/buildCashflowFromTransactions";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("buildCashflowFromTransactions (compat wrapper)", () => {
  it("aggregates month cashflow sorted asc", async () => {
    const provider = new CsvAccountSourceProvider();
    const transactions = await provider.loadTransactions({
      csvText: loadFixture("sample.csv"),
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
      },
      hasHeader: true,
    });

    const cashflow = buildCashflowFromTransactions(transactions);
    expect(cashflow).toEqual([
      {
        month: "2026-01",
        inflowKrw: 3_000_000,
        outflowKrw: 1_200_000,
        fixedOutflowKrw: 850_000,
        variableOutflowKrw: 350_000,
        transferNetKrw: 0,
        ym: "2026-01",
        incomeKrw: 3_000_000,
        expenseKrw: -1_200_000,
        totals: {
          incomeKrw: 3_000_000,
          expenseKrw: -1_200_000,
          transferInKrw: 0,
          transferOutKrw: 0,
          netKrw: 1_800_000,
        },
        netKrw: 1_800_000,
        txCount: 3,
        daysCovered: 16,
        notes: ["unknown treated as variable"],
      },
      {
        month: "2026-02",
        inflowKrw: 3_101_234,
        outflowKrw: 900_000,
        fixedOutflowKrw: 900_000,
        variableOutflowKrw: 0,
        transferNetKrw: 0,
        ym: "2026-02",
        incomeKrw: 3_101_234,
        expenseKrw: -900_000,
        totals: {
          incomeKrw: 3_101_234,
          expenseKrw: -900_000,
          transferInKrw: 0,
          transferOutKrw: 0,
          netKrw: 2_201_234,
        },
        netKrw: 2_201_234,
        txCount: 3,
        daysCovered: 18,
      },
      {
        month: "2026-03",
        inflowKrw: 4_250_000,
        outflowKrw: 1_050_000,
        fixedOutflowKrw: 0,
        variableOutflowKrw: 1_050_000,
        transferNetKrw: 0,
        ym: "2026-03",
        incomeKrw: 4_250_000,
        expenseKrw: -1_050_000,
        totals: {
          incomeKrw: 4_250_000,
          expenseKrw: -1_050_000,
          transferInKrw: 0,
          transferOutKrw: 0,
          netKrw: 3_200_000,
        },
        netKrw: 3_200_000,
        txCount: 3,
        daysCovered: 21,
        notes: ["unknown treated as variable"],
      },
    ]);
  });

  it("uses median heuristic and returns stable draft", () => {
    const draft = buildProfileDraftFromCashflow([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);

    expect(draft.monthlyIncomeNet).toBe(3_101_234);
    expect(draft.monthlyEssentialExpenses).toBe(0);
    expect(draft.monthlyDiscretionaryExpenses).toBe(1_050_000);
    expect(draft.monthsConsidered).toBe(3);
  });

  it("returns zeroed draft for empty input", () => {
    const draft = buildProfileDraftFromCashflow([]);
    expect(draft).toEqual({
      monthlyIncomeNet: 0,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 0,
      assumptions: [
        "monthlyIncomeNet uses median recent inflow (assumption)",
        "split mode byCategory (rule-based categorization)",
      ],
      monthsConsidered: 0,
    });
  });
});
