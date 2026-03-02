import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../src/lib/planning/v3/providers/csv/csvProvider";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregate";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("aggregateMonthlyCashflow", () => {
  it("aggregates into ym-sorted monthly cashflow deterministically", () => {
    const parsed = parseCsvTransactions(loadFixture("sample.csv"));
    const reversed = [...parsed.transactions].reverse();
    const result = aggregateMonthlyCashflow(reversed);

    expect(result).toEqual([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ]);
  });
});
