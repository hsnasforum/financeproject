import { describe, expect, it } from "vitest";
import { CsvImportInputError, importCsvToDraft } from "../../src/lib/planning/v3/service/importCsvToDraft";

describe("planning v3 csv import service hardening", () => {
  it("parses valid csv deterministically", () => {
    const csv = [
      "date,amount,description",
      "2026-01-01,1000000,salary",
      "2026-01-15,-200000,rent",
      "2026-02-01,500000,bonus",
    ].join("\n");

    const result = importCsvToDraft(csv);
    expect(result.meta).toEqual({ rows: 3, months: 2 });
    expect(result.cashflow).toEqual([
      { ym: "2026-01", incomeKrw: 1_000_000, expenseKrw: -200_000, netKrw: 800_000, txCount: 2 },
      { ym: "2026-02", incomeKrw: 500_000, expenseKrw: 0, netKrw: 500_000, txCount: 1 },
    ]);
  });

  it("throws clear INPUT error when required headers are missing", () => {
    const csv = [
      "foo,bar,baz",
      "2026-01-01,1000,salary",
    ].join("\n");

    let captured: unknown = null;
    try {
      importCsvToDraft(csv);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CsvImportInputError);
    const inputError = captured as CsvImportInputError;
    expect(inputError.code).toBe("INPUT");
    expect(inputError.message).toContain("필수 컬럼");
    expect(JSON.stringify(inputError.meta ?? {})).not.toContain("salary");
  });

  it("throws clear INPUT error when amount parsing fails", () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const csv = [
      "date,amount,description",
      `2026-01-01,abc,${marker}`,
    ].join("\n");

    let captured: unknown = null;
    try {
      importCsvToDraft(csv);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CsvImportInputError);
    const inputError = captured as CsvImportInputError;
    expect(inputError.code).toBe("INPUT");
    expect(inputError.message).toContain("금액 형식");
    expect(JSON.stringify(inputError.meta ?? {})).not.toContain(marker);
    expect(JSON.stringify(inputError.meta ?? {})).not.toContain("abc");
  });
});
