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
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);
  });

  it("uses median heuristic and returns stable draft", () => {
    const draft = buildProfileDraftFromCashflow([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);

    expect(draft.monthlyIncomeNet).toBe(2_201_234);
    expect(draft.monthlyEssentialExpenses).toBe(735_000);
    expect(draft.monthlyDiscretionaryExpenses).toBe(315_000);
    expect(draft.monthsConsidered).toBe(3);
  });

  it("returns zeroed draft for empty input", () => {
    const draft = buildProfileDraftFromCashflow([]);
    expect(draft).toEqual({
      monthlyIncomeNet: 0,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 0,
      assumptions: [
        "monthlyIncomeNet uses median monthly net (assumption)",
        "expense split 70/30 (assumption)",
      ],
      monthsConsidered: 0,
    });
  });
});
