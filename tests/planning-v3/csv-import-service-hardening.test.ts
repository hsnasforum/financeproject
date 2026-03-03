import { describe, expect, it } from "vitest";
import { POST as importCsvPOST } from "../../src/app/api/planning/v3/import/csv/route";
import { CsvImportInputError, importCsvToDraft } from "../../src/lib/planning/v3/service/importCsvToDraft";

const LOCAL_HOST = "localhost:3930";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF = "test-csrf";

function requestJson(csvText: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      cookie: `dev_csrf=${CSRF}`,
      "x-csrf-token": CSRF,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      csvText,
      persist: false,
      csrf: CSRF,
    }),
  });
}

describe("planning v3 csv import hardening cases", () => {
  it("handles header variants and returns clear missing-header error", () => {
    const variantHeaderCsv = [
      "거래일자,거래금액,적요",
      "2026-01-01,1000000,급여",
      "2026-01-03,-300000,월세",
    ].join("\n");

    const parsed = importCsvToDraft(variantHeaderCsv);
    expect(parsed.meta).toEqual({ rows: 2, months: 1 });
    expect(parsed.cashflow[0]?.netKrw).toBe(700_000);

    const missingHeaderCsv = [
      "foo,bar,baz",
      "2026-01-01,1000,salary",
    ].join("\n");

    let captured: unknown = null;
    try {
      importCsvToDraft(missingHeaderCsv);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CsvImportInputError);
    const inputError = captured as CsvImportInputError;
    expect(inputError.code).toBe("INPUT");
    expect(inputError.message).toContain("필수 컬럼");
    expect(JSON.stringify(inputError.meta ?? {})).not.toContain("salary");
  });

  it("ignores blank/comment/summary rows and returns warning summary", async () => {
    const csv = [
      "date,amount,description",
      "2026-01-01,1000000,salary",
      "",
      "# comment line,,",
      "합계,1000000,",
      "2026-01-15,-250000,rent",
    ].join("\n");

    const response = await importCsvPOST(requestJson(csv));
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      ok?: boolean;
      warnings?: string[];
      stats?: { transactions?: number; period?: { months?: number } };
      cashflow?: Array<{ txCount?: number }>;
    };

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect((payload.warnings ?? []).length).toBeGreaterThan(0);
    expect(payload.stats?.transactions).toBe(2);
    expect(payload.stats?.period?.months).toBe(1);
    expect(payload.cashflow?.[0]?.txCount).toBe(2);
  });

  it("parses date and amount variants deterministically", () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const csv = [
      "date,amount,description",
      "2026-01-01,\"1,200,000\",salary",
      "2026/01/15,\"(200,000)\",rent",
      "2026.02.01,+500000,bonus",
      "20260210,-100000,fee",
      `03/01/2026,\"₩300,000\",${marker}`,
    ].join("\n");

    const result = importCsvToDraft(csv);
    expect(result.cashflow).toEqual([
      {
        ym: "2026-01",
        incomeKrw: 1_200_000,
        expenseKrw: -200_000,
        netKrw: 1_000_000,
        txCount: 2,
      },
      {
        ym: "2026-02",
        incomeKrw: 500_000,
        expenseKrw: -100_000,
        netKrw: 400_000,
        txCount: 2,
      },
      {
        ym: "2026-03",
        incomeKrw: 300_000,
        expenseKrw: 0,
        netKrw: 300_000,
        txCount: 1,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(marker);
  });
});
