import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../src/lib/planning/v3/providers/csv/csvProvider";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("parseCsvTransactions", () => {
  it("parses sample csv deterministically with stable output", () => {
    const csvText = loadFixture("sample.csv");
    const first = parseCsvTransactions(csvText);
    const second = parseCsvTransactions(csvText);
    const firstIds = first.transactions.map((tx) => tx.id);
    const secondIds = second.transactions.map((tx) => tx.id);

    expect(first).toEqual(second);
    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(first.stats).toEqual({ rows: 6, parsed: 6, skipped: 0 });
    expect(first.errors).toEqual([]);
    expect(first.transactions[0]).toMatchObject({
      date: "2026-01-01",
      amount: 3_000_000,
      desc: "Salary",
      source: "csv",
      meta: { rowIndex: 1 },
    });
    expect(first.transactions[0]?.id).toMatch(/^csv-/);
    expect(first.transactions[1]).toMatchObject({
      date: "2026-01-03",
      amount: -850_000,
      desc: "Rent, monthly",
      source: "csv",
      meta: { rowIndex: 2 },
    });
    expect(first.transactions[1]?.id).toMatch(/^csv-/);
  });

  it("detects common KR headers and skips invalid rows safely", () => {
    const csv = [
      "거래일,금액,적요",
      "2026/03/01,1000000,급여",
      "2026.13.01,100,잘못된날짜",
      "2026-03-03,abc,잘못된금액",
      "2026-03-04,\"(123,000)\",관리비",
    ].join("\n");

    const result = parseCsvTransactions(csv);
    expect(result.stats).toEqual({ rows: 4, parsed: 2, skipped: 2 });
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-01",
      amount: 1_000_000,
      desc: "급여",
      source: "csv",
      meta: { rowIndex: 1 },
    });
    expect(result.transactions[1]).toMatchObject({
      date: "2026-03-04",
      amount: -123_000,
      desc: "관리비",
      source: "csv",
      meta: { rowIndex: 4 },
    });
    expect(new Set(result.transactions.map((tx) => tx.id)).size).toBe(2);
    expect(result.errors).toEqual([
      { rowIndex: 2, code: "INVALID_DATE", path: "date" },
      { rowIndex: 3, code: "INVALID_AMOUNT", path: "amount" },
    ]);
  });
});
