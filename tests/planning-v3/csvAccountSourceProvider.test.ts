import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvAccountSourceProvider } from "../../src/lib/planning/v3/providers/csvAccountSourceProvider";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("CsvAccountSourceProvider", () => {
  it("parses dates and amounts deterministically", async () => {
    const provider = new CsvAccountSourceProvider();
    const transactions = await provider.loadTransactions({
      csvText: loadFixture("sample.csv"),
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
        categoryColumn: "category",
      },
      hasHeader: true,
    });

    expect(transactions).toHaveLength(6);
    expect(transactions[0].postedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(transactions[0].amountKrw).toBe(3_000_000);
    expect(transactions[1].postedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(transactions[1].amountKrw).toBe(-850_000);
    expect(transactions[2].postedAt).toBe("2026-01-15T00:00:00.000Z");
    expect(transactions[2].amountKrw).toBe(-350_000);
  });

  it("uses type column to normalize sign", async () => {
    const provider = new CsvAccountSourceProvider();
    const csvText = [
      "date,amount,description,type",
      "2026-01-01,1000,Salary,credit",
      "2026-01-02,1000,Rent,debit",
    ].join("\n");
    const transactions = await provider.loadTransactions({
      csvText,
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
      },
      hasHeader: true,
    });

    expect(transactions[0].amountKrw).toBe(1_000);
    expect(transactions[1].amountKrw).toBe(-1_000);
  });
});
