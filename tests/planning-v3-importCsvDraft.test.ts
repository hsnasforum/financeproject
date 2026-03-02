import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importCsvToDraft } from "../src/lib/planning/v3/service/importCsvDraft";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("importCsvToDraft", () => {
  it("builds parsed result, monthly cashflow, and stable draft in one pure pipeline", () => {
    const result = importCsvToDraft(loadFixture("sample.csv"));

    expect(result.parsed.errors).toEqual([]);
    expect(result.parsed.stats).toEqual({ rows: 9, parsed: 9, skipped: 0 });
    expect(result.cashflows).toEqual([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);
    expect(result.draft).toEqual({
      monthlyIncomeNet: 2_201_234,
      monthlyEssentialExpenses: 735_000,
      monthlyDiscretionaryExpenses: 315_000,
      assumptions: [
        "monthlyIncomeNet uses median monthly net (assumption)",
        "expense split 70/30 (assumption)",
      ],
      monthsConsidered: 3,
    });
  });
});
