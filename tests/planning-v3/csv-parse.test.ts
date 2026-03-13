import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../../src/lib/planning/v3/providers/csv/csvProvider";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("planning v3 csv parse", () => {
  it("normalizes dates, amount signs, and stays deterministic", () => {
    const csvText = loadFixture("sample.csv");
    const first = parseCsvTransactions(csvText);
    const repeated = parseCsvTransactions(csvText);

    expect(first.errors).toEqual([]);
    expect(repeated.transactions).toEqual(first.transactions);
    expect(first.stats).toEqual({ rows: 9, parsed: 9, skipped: 0 });
    expect(first.transactions[0]).toMatchObject({
      date: "2026-01-05",
      amountKrw: 3_000_000,
      description: "Salary",
      source: "csv",
      meta: { rowIndex: 1 },
    });
    expect(first.transactions[1]).toMatchObject({
      date: "2026-01-08",
      amountKrw: -850_000,
      description: "Rent, monthly",
    });
    expect(first.transactions[2]).toMatchObject({
      date: "2026-01-20",
      amountKrw: -350_000,
      description: "Card",
    });
  });
});
