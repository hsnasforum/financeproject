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

function makeJsonRequest(csvText: string, options?: {
  persist?: string;
  mapping?: { date?: string; amount?: string; desc?: string };
}): Request {
  const params = new URLSearchParams();
  if (options?.persist) params.set("persist", options.persist);
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
    body: JSON.stringify({
      csvText,
      ...(options?.mapping ? { mapping: options.mapping } : {}),
    }),
  });
}

function makeTextRequest(csvText: string, persist?: string): Request {
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
      "content-type": "text/csv",
    },
    body: csvText,
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

    const responseA = await POST(makeTextRequest(sample));
    const payloadA = await responseA.json() as {
      ok?: boolean;
      cashflow?: unknown[];
      draftPatch?: Record<string, number>;
      meta?: { rows?: number; months?: number };
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
    expect(payloadA.meta).toEqual({ rows: expected.meta.rows, months: expected.meta.months });
    expect(payloadA.data?.monthlyCashflow).toEqual(expected.cashflow);
    expect(payloadA.data?.draftPatch).toEqual(expected.draftPatch);
    expect(payloadA.data?.meta).toEqual({ rows: expected.meta.rows, months: expected.meta.months });
    expect(payloadA.data?.draftSummary).toEqual(payloadA.draftSummary);
    expect(payloadB).toEqual(payloadA);

    const draftsDir = path.join(root, ".data", "planning_v3_drafts");
    expect(fs.existsSync(draftsDir)).toBe(false);
  });

  it("returns LIMIT/413 for oversized csvText input", async () => {
    const oversizedCsv = "date,amount,desc\n" + "2026-01-01,1,a\n".repeat(90_000);
    const response = await POST(makeJsonRequest(oversizedCsv));
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

    const first = await POST(makeJsonRequest(csvText));
    const second = await POST(makeJsonRequest(csvText));
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
    const response = await POST(makeJsonRequest(csvText));
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
    const response = await POST(makeJsonRequest(csvText));
    const rawBody = await response.text();

    expect(response.status).toBe(400);
    expect(rawBody.includes(piiMarker)).toBe(false);
  });

  it("does not leak csv marker and does not persist even when persist=1", async () => {
    const marker = "SECRET_PII_SHOULD_NOT_LEAK_IN_PERSISTED_DRAFT";
    const csv = [
      "date,amount,description",
      `2026-01-01,1000,${marker}`,
    ].join("\n");

    const response = await POST(makeTextRequest(csv, "1"));
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
      const response = await POST(makeTextRequest(csv, value));
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
