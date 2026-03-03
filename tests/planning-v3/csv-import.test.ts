import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/planning/v3/import/csv/route";
import { importCsvToDraft } from "../../src/lib/planning/v3/service/importCsvToDraft";

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF_TOKEN = "v3-import-csrf";

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name);
}

function readFixture(name: string): string {
  return fs.readFileSync(fixturePath(name), "utf8");
}

function makeRequest(csvText: string, contentType = "text/csv"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      cookie: `dev_csrf=${CSRF_TOKEN}`,
      "x-csrf-token": CSRF_TOKEN,
      "content-type": contentType,
    },
    body: csvText,
  });
}

describe("POST /api/planning/v3/import/csv", () => {
  it("returns deterministic result for sample fixture", async () => {
    const sample = readFixture("sample.csv");
    const expected = importCsvToDraft(sample);

    const responseA = await POST(makeRequest(sample));
    const payloadA = await responseA.json() as {
      ok: boolean;
      cashflow: unknown[];
      draftPatch: Record<string, number>;
      meta: { rows: number; months: number };
    };

    const responseB = await POST(makeRequest(sample));
    const payloadB = await responseB.json() as typeof payloadA;

    expect(responseA.status).toBe(200);
    expect(payloadA.ok).toBe(true);
    expect(payloadA).toEqual(payloadB);
    expect(payloadA.cashflow).toEqual(expected.cashflow);
    expect(payloadA.draftPatch).toEqual(expected.draftPatch);
    expect(payloadA.meta).toEqual(expected.meta);
  });

  it("supports mixed date and amount formats", async () => {
    const csv = [
      "date,amount,description",
      "2026-01-01,\"1,200,000\",salary",
      "2026/01/15,\"(200,000)\",rent",
      "2026.02.01,+500000,bonus",
      "20260210,-100000,fee",
      "2026-02-28T00:00:00Z,\"₩300,000\",refund",
    ].join("\n");

    const response = await POST(makeRequest(csv, "text/plain"));
    const payload = await response.json() as {
      ok: boolean;
      cashflow: Array<{
        ym: string;
        incomeKrw: number;
        expenseKrw: number;
        netKrw: number;
        txCount: number;
      }>;
      meta: { rows: number; months: number };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.cashflow).toEqual([
      {
        ym: "2026-01",
        incomeKrw: 1_200_000,
        expenseKrw: -200_000,
        netKrw: 1_000_000,
        txCount: 2,
      },
      {
        ym: "2026-02",
        incomeKrw: 800_000,
        expenseKrw: -100_000,
        netKrw: 700_000,
        txCount: 3,
      },
    ]);
    expect(payload.meta).toEqual({ rows: 5, months: 2 });
  });

  it("does not leak SECRET_PII_SHOULD_NOT_LEAK in success/error payload", async () => {
    const piiMarker = "SECRET_PII_SHOULD_NOT_LEAK";

    const successCsv = [
      "date,amount,description",
      `2026-01-01,1000,${piiMarker}`,
    ].join("\n");

    const successResponse = await POST(makeRequest(successCsv));
    const successText = await successResponse.text();
    expect(successResponse.status).toBe(200);
    expect(successText.includes(piiMarker)).toBe(false);

    const errorCsv = [
      "date,amount,description",
      `${piiMarker},1000,desc`,
    ].join("\n");

    const errorResponse = await POST(makeRequest(errorCsv));
    const errorText = await errorResponse.text();
    expect(errorResponse.status).toBe(400);
    expect(errorText.includes(piiMarker)).toBe(false);
    expect(errorText.includes("desc")).toBe(false);
  });
});
