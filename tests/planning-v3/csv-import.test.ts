import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/planning/v3/import/csv/route";
import { importCsvToDraft } from "../../src/lib/planning/v3/service/importCsvToDraft";

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF_TOKEN = "v3-import-csrf";
const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name);
}

function readFixture(name: string): string {
  return fs.readFileSync(fixturePath(name), "utf8");
}

function makeRequest(csvText: string, contentType = "text/csv", persist?: string): Request {
  const params = new URLSearchParams();
  if (persist) params.set("persist", persist);
  const query = params.toString();

  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv${query ? `?${query}` : ""}`, {
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

function makeJsonRequest(csvText: string, persist?: string): Request {
  const params = new URLSearchParams();
  if (persist) params.set("persist", persist);
  const query = params.toString();

  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      cookie: `dev_csrf=${CSRF_TOKEN}`,
      "x-csrf-token": CSRF_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ csvText }),
  });
}

describe("POST /api/planning/v3/import/csv", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-csv-import-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, ".data", "planning");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns deterministic result for sample fixture", async () => {
    const sample = readFixture("sample.csv");
    const expected = importCsvToDraft(sample);

    const responseA = await POST(makeRequest(sample));
    const payloadA = await responseA.json() as {
      ok: boolean;
      cashflow: unknown[];
      draftPatch: Record<string, number>;
      meta: { rows: number; months: number };
      draftSummary?: { rows?: number; columns?: number };
      data?: {
        monthlyCashflow?: unknown[];
        draftPatch?: Record<string, number>;
        meta?: { rows?: number; months?: number };
        draftSummary?: { rows?: number; columns?: number };
      };
    };

    const responseB = await POST(makeJsonRequest(sample));
    const payloadB = await responseB.json() as typeof payloadA;

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(payloadA.ok).toBe(true);
    expect(payloadA.cashflow).toEqual(expected.cashflow);
    expect(payloadA.draftPatch).toEqual(expected.draftPatch);
    expect(payloadA.meta).toEqual(expected.meta);
    expect(payloadA.data?.monthlyCashflow).toEqual(expected.cashflow);
    expect(payloadA.data?.draftPatch).toEqual(expected.draftPatch);
    expect(payloadA.data?.meta).toEqual(expected.meta);
    expect(payloadA.data?.draftSummary).toEqual(payloadA.draftSummary);
    expect(payloadB).toEqual(payloadA);

    const draftsDir = path.join(root, ".data", "planning_v3_drafts");
    expect(fs.existsSync(draftsDir)).toBe(false);
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

  it("does not leak csv marker and does not persist even when persist=1", async () => {
    const marker = "SECRET_PII_SHOULD_NOT_LEAK_IN_PERSISTED_DRAFT";
    const csv = [
      "date,amount,description",
      `2026-01-01,1000,${marker}`,
    ].join("\n");

    const response = await POST(makeRequest(csv, "text/csv", "1"));
    const responseText = await response.text();
    expect(response.status).toBe(200);
    expect(responseText.includes(marker)).toBe(false);

    const payload = JSON.parse(responseText) as {
      draftId?: string;
      data?: { draftId?: string };
    };
    expect(payload.draftId).toBeUndefined();
    expect(payload.data?.draftId).toBeUndefined();

    const draftsDir = path.join(root, ".data", "planning_v3_drafts");
    expect(fs.existsSync(draftsDir)).toBe(false);
  });

  it("never persists regardless of persist query value", async () => {
    const csv = [
      "date,amount,description",
      "2026-01-01,1000,salary",
    ].join("\n");

    const cases: Array<string | undefined> = [undefined, "1", "true", "yes", "false", "0"];
    for (const value of cases) {
      const response = await POST(makeRequest(csv, "text/csv", value));
      const payload = await response.json() as {
        ok?: boolean;
        draftId?: string;
        data?: { draftId?: string };
      };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.draftId).toBeUndefined();
      expect(payload.data?.draftId).toBeUndefined();
      const draftsDir = path.join(root, ".data", "planning_v3_drafts");
      expect(fs.existsSync(draftsDir)).toBe(false);
    }
  });
});
