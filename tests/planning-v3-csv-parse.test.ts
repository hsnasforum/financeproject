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
    const firstIds = first.transactions.map((item) => item.id);
    const secondIds = second.transactions.map((item) => item.id);

    expect(first).toEqual(second);
    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(first.stats).toEqual({ rows: 9, parsed: 9, skipped: 0 });
    expect(first.errors).toEqual([]);
    expect(first.transactions[0]).toMatchObject({
      id: expect.stringMatching(/^csv-/),
      date: "2026-01-05",
      amountKrw: 3_000_000,
      description: "Salary",
      source: "csv",
      meta: { rowIndex: 1 },
    });
    expect(first.transactions[1]).toMatchObject({
      id: expect.stringMatching(/^csv-/),
      date: "2026-01-08",
      amountKrw: -850_000,
      description: "Rent, monthly",
      source: "csv",
      meta: { rowIndex: 2 },
    });
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
      amountKrw: 1_000_000,
      description: "급여",
      source: "csv",
      meta: { rowIndex: 1 },
    });
    expect(result.transactions[1]).toMatchObject({
      date: "2026-03-04",
      amountKrw: -123_000,
      description: "관리비",
      source: "csv",
      meta: { rowIndex: 4 },
    });
    expect(result.errors).toEqual([
      { rowIndex: 2, code: "INVALID_DATE", path: ["date"] },
      { rowIndex: 3, code: "INVALID_AMOUNT", path: ["amount"] },
    ]);
  });

  it("maps KR aliases for type/category without manual mapping options", () => {
    const csv = [
      "날짜,입출금액,거래내용,거래구분,카테고리",
      "2026-04-01,1500000,월급,입금,수입",
      "2026-04-03,150000,커피,출금,생활",
    ].join("\n");

    const result = parseCsvTransactions(csv);
    expect(result.errors).toEqual([]);
    expect(result.stats).toEqual({ rows: 2, parsed: 2, skipped: 0 });
    expect(result.transactions).toEqual([
      expect.objectContaining({
        date: "2026-04-01",
        amountKrw: 1_500_000,
        description: "월급",
        type: "입금",
        category: "수입",
      }),
      expect.objectContaining({
        date: "2026-04-03",
        amountKrw: -150_000,
        description: "커피",
        type: "출금",
        category: "생활",
      }),
    ]);
  });
});
