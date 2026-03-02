import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AccountSourceValidationError,
} from "../../src/lib/planning/v3/providers/accountSourceProvider";
import { CsvAccountSourceProvider } from "../../src/lib/planning/v3/providers/csvAccountSourceProvider";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("CsvAccountSourceProvider", () => {
  it("returns parsed transactions from csv provider ssot", async () => {
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

    expect(transactions).toHaveLength(9);
    expect(transactions[0]).toMatchObject({
      date: "2026-01-05",
      amountKrw: 3_000_000,
      description: "Salary",
      source: "csv",
      meta: { rowIndex: 1 },
    });
  });

  it("throws sanitized validation issues without raw cell values", async () => {
    const provider = new CsvAccountSourceProvider();
    const csvText = [
      "date,amount,description",
      "2026/15/01,1000,InvalidDate",
      "2026-01-02,abc123,InvalidAmount",
    ].join("\n");

    await expect(provider.loadTransactions({
      csvText,
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
      },
      hasHeader: true,
    })).rejects.toThrow(AccountSourceValidationError);

    try {
      await provider.loadTransactions({
        csvText,
        mapping: {
          dateColumn: "date",
          amountColumn: "amount",
          descColumn: "description",
        },
        hasHeader: true,
      });
    } catch (error) {
      const issue = error as AccountSourceValidationError;
      expect(issue.issues).toEqual([
        { path: "rows[1].date", code: "INVALID_DATE", message: "invalid date format" },
        { path: "rows[2].amount", code: "INVALID_AMOUNT", message: "invalid amount format" },
      ]);
      const serialized = JSON.stringify(issue.issues);
      expect(serialized.includes("2026/15/01")).toBe(false);
      expect(serialized.includes("abc123")).toBe(false);
    }
  });
});
