import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../src/lib/planning/v3/providers/csv/csvProvider";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("parseCsvTransactions", () => {
  it("parses fixture rows deterministically", () => {
    const result = parseCsvTransactions(loadFixture("sample.csv"), {
      hasHeader: true,
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
        categoryColumn: "category",
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.stats).toEqual({
      totalRows: 6,
      parsedRows: 6,
      skippedRows: 0,
    });

    expect(result.transactions[0]).toMatchObject({
      postedAt: "2026-01-01T00:00:00.000Z",
      amountKrw: 3_000_000,
      description: "Salary",
      category: "income",
      source: "csv",
    });

    expect(result.transactions[1]).toMatchObject({
      postedAt: "2026-01-03T00:00:00.000Z",
      amountKrw: -850_000,
    });

    expect(result.transactions.map((tx) => tx.id)).toEqual([
      "csv-e1f4ede5",
      "csv-f97302ae",
      "csv-7832c90e",
      "csv-1f6ddb00",
      "csv-c2c4dc48",
      "csv-2964004f",
    ]);
  });

  it("skips invalid rows and returns structured errors", () => {
    const csv = [
      "date,amount,description,type",
      "2026-01-01,1000,Salary,credit",
      "2026/15/01,200,BadDate,credit",
      "2026-01-03,abc,BadAmount,debit",
      "2026-01-04,\"(123,000)\",Rent,debit",
    ].join("\n");

    const result = parseCsvTransactions(csv, {
      hasHeader: true,
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
      },
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[1]?.amountKrw).toBe(-123_000);
    expect(result.stats).toEqual({
      totalRows: 4,
      parsedRows: 2,
      skippedRows: 2,
    });
    expect(result.errors).toEqual([
      { row: 3, code: "INVALID_DATE", field: "date", message: "invalid date format" },
      { row: 4, code: "INVALID_AMOUNT", field: "amount", message: "invalid amount format" },
    ]);
  });
});
