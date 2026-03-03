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

function makeRequest(csvText: string, mapping?: { date?: string; amount?: string; desc?: string }): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      cookie: `dev_csrf=${CSRF_TOKEN}`,
      "x-csrf-token": CSRF_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      csvText,
      ...(mapping ? { mapping } : {}),
    }),
  });
}

describe("POST /api/planning/v3/import/csv", () => {
  it("returns LIMIT/413 for oversized csvText input", async () => {
    const oversizedCsv = "date,amount,desc\n" + "2026-01-01,1,a\n".repeat(90_000);
    const response = await POST(makeRequest(oversizedCsv));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(response.status).toBe(413);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LIMIT");
  });

  it("parses Korean header aliases deterministically", async () => {
    const csvText = readFixture("korean-alias.csv");
    const expected = importCsvToDraft(csvText);

    const first = await POST(makeRequest(csvText));
    const second = await POST(makeRequest(csvText));
    const payloadA = await first.json() as {
      ok?: boolean;
      data?: {
        monthlyCashflow?: unknown[];
        draftPatch?: Record<string, unknown>;
        meta?: { rows?: number; months?: number };
      };
    };
    const payloadB = await second.json() as typeof payloadA;

    expect(first.status).toBe(200);
    expect(payloadA.ok).toBe(true);
    expect(payloadA).toEqual(payloadB);
    expect(payloadA.data?.monthlyCashflow).toEqual(expected.cashflow);
    expect(payloadA.data?.draftPatch).toEqual(expected.draftPatch);
    expect(payloadA.data?.meta).toEqual({
      rows: expected.meta.rows,
      months: expected.meta.months,
    });
  });

  it("parses edge amount/date formats deterministically", async () => {
    const csvText = readFixture("edge-formats.csv");
    const expected = importCsvToDraft(csvText);
    const response = await POST(makeRequest(csvText));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        monthlyCashflow?: unknown[];
        meta?: { rows?: number; months?: number };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.monthlyCashflow).toEqual(expected.cashflow);
    expect(payload.data?.meta).toEqual({
      rows: expected.meta.rows,
      months: expected.meta.months,
    });
  });

  it("does not leak SECRET_PII_SHOULD_NOT_LEAK in error payload", async () => {
    const piiMarker = "SECRET_PII_SHOULD_NOT_LEAK";
    const csvText = [
      "date,amount,description",
      `${piiMarker},1000,${piiMarker}`,
    ].join("\n");
    const response = await POST(makeRequest(csvText));
    const rawBody = await response.text();
    expect(response.status).toBe(400);
    expect(rawBody.includes(piiMarker)).toBe(false);
  });
});
