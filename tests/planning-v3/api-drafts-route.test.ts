import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../../src/app/api/planning/v3/drafts/route";
import { POST as importCsvPOST } from "../../src/app/api/planning/v3/import/csv/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3901";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF = "test-csrf";

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
    },
  });
}

function requestPost(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
      cookie: `dev_csrf=${CSRF}`,
      "x-csrf-token": CSRF,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestImportCsv(csvText: string): Request {
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
    body: JSON.stringify({ csvText }),
  });
}

describe("planning v3 drafts route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-api-drafts-route-"));
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

  it("supports create/list and import route returns draft-only payload", async () => {
    const created = await POST(requestPost("/api/planning/v3/drafts", {
      csrf: CSRF,
      source: { kind: "csv", filename: "sample.csv" },
      payload: {
        cashflow: [
          { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_000_000, netKrw: 2_000_000, txCount: 2 },
        ],
        draftPatch: {
          monthlyIncomeNet: 3_000_000,
          monthlyEssentialExpenses: 1_000_000,
          monthlyDiscretionaryExpenses: 300_000,
        },
      },
      meta: { rows: 2, columns: 3 },
    }));
    expect(created.status).toBe(201);
    const createdPayload = await created.json() as { ok?: boolean; id?: string; data?: { id?: string } };
    expect(createdPayload.ok).toBe(true);
    const createdId = String(createdPayload.id ?? createdPayload.data?.id ?? "");
    expect(createdId.length).toBeGreaterThan(0);

    const listed = await GET(requestGet("/api/planning/v3/drafts"));
    expect(listed.status).toBe(200);
    const listedPayload = await listed.json() as {
      ok?: boolean;
      drafts?: Array<{ id?: string; createdAt?: string; source?: { kind?: string }; meta?: { rows?: number; columns?: number } }>;
    };
    expect(listedPayload.ok).toBe(true);
    expect(Array.isArray(listedPayload.drafts)).toBe(true);
    expect(listedPayload.drafts?.some((row) => row.id === createdId)).toBe(true);

    const imported = await importCsvPOST(requestImportCsv([
      "date,amount,description",
      "2026-01-01,1000,salary",
    ].join("\n")));
    expect(imported.status).toBe(200);
    const importedPayload = await imported.json() as {
      ok?: boolean;
      data?: {
        draftPatch?: Record<string, unknown>;
        monthlyCashflow?: unknown[];
        meta?: { rows?: number; months?: number };
      };
    };
    expect(importedPayload.ok).toBe(true);
    expect(Array.isArray(importedPayload.data?.monthlyCashflow)).toBe(true);
    expect(typeof importedPayload.data?.draftPatch).toBe("object");
  });
});
