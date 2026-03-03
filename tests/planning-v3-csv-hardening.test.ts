import { describe, expect, it } from "vitest";
import { detectCsvDelimiter } from "../src/lib/planning/v3/providers/csv/csvParse";
import { parseCsvTransactions } from "../src/lib/planning/v3/providers/csv/csvProvider";

describe("planning v3 csv hardening", () => {
  it("detects tab delimiter and parses TSV rows deterministically", () => {
    const tsv = [
      "date\tamount\tdesc",
      "2026-03-01\t1200\tsalary",
      "2026-03-02\t-300\tcoffee",
    ].join("\n");

    expect(detectCsvDelimiter(tsv)).toBe("\t");

    const parsed = parseCsvTransactions(tsv);
    expect(parsed.stats).toEqual({ rows: 2, parsed: 2, skipped: 0 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.transactions).toEqual([
      {
        txnId: expect.stringMatching(/^[a-f0-9]{24}$/),
        date: "2026-03-01",
        amountKrw: 1200,
        description: "salary",
        source: "csv",
        meta: { rowIndex: 1 },
      },
      {
        txnId: expect.stringMatching(/^[a-f0-9]{24}$/),
        date: "2026-03-02",
        amountKrw: -300,
        description: "coffee",
        source: "csv",
        meta: { rowIndex: 2 },
      },
    ]);
  });

  it("strips UTF-8 BOM and parses normally", () => {
    const csv = "\uFEFFdate,amount,desc\n2026-03-01,1000,bom";
    const parsed = parseCsvTransactions(csv);

    expect(parsed.stats).toEqual({ rows: 1, parsed: 1, skipped: 0 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-03-01",
      amountKrw: 1000,
      description: "bom",
    });
  });

  it("returns CSV_ENCODING error when replacement character is found", () => {
    const csv = "date,amount,desc\n2026-03-01,1000,broken\uFFFDtext";
    const parsed = parseCsvTransactions(csv);

    expect(parsed.transactions).toEqual([]);
    expect(parsed.stats).toEqual({ rows: 0, parsed: 0, skipped: 1 });
    expect(parsed.errors).toEqual([
      { rowIndex: 0, code: "CSV_ENCODING", path: ["csv"] },
    ]);
  });

  it("parses amount variants consistently", () => {
    const csv = [
      "date,amount,desc",
      "2026-03-01,\"1,234\",a",
      "2026-03-02,\"1,234원\",b",
      "2026-03-03,\"₩1,234\",c",
      "2026-03-04,\"(1,234)\",d",
      "2026-03-05,\"-1,234\",e",
      "2026-03-06,\" 1 234 \",f",
    ].join("\n");

    const parsed = parseCsvTransactions(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.transactions.map((row) => row.amountKrw)).toEqual([
      1234,
      1234,
      1234,
      -1234,
      -1234,
      1234,
    ]);
  });

  it("parses date variants into ISO YYYY-MM-DD", () => {
    const csv = [
      "date,amount,desc",
      "2026-03-01,1,a",
      "2026/03/01,1,b",
      "2026.03.01,1,c",
      "20260301,1,d",
      "03/01/2026,1,e",
    ].join("\n");

    const parsed = parseCsvTransactions(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.transactions.map((row) => row.date)).toEqual([
      "2026-03-01",
      "2026-03-01",
      "2026-03-01",
      "2026-03-01",
      "2026-03-01",
    ]);
  });
});
