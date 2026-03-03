import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/planning/v3/drafts/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3992";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF = "draft-create-csrf";

function makePostRequest(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/drafts`, {
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

describe("POST /api/planning/v3/drafts create-from-import", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-create-"));
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

  it("returns 400 when draft payload validation fails", async () => {
    const response = await POST(makePostRequest({
      csrf: CSRF,
      source: { kind: "csv", filename: "invalid.csv" },
      payload: {
        draftPatch: { monthlyIncomeNet: 1000 },
      },
      meta: { rows: 1, columns: 3 },
    }));

    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("returns id/createdAt and persists record when save succeeds", async () => {
    const response = await POST(makePostRequest({
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

    const payload = await response.json() as {
      ok?: boolean;
      id?: string;
      createdAt?: string;
      data?: { id?: string; createdAt?: string };
    };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    const id = String(payload.id ?? payload.data?.id ?? "");
    const createdAt = String(payload.createdAt ?? payload.data?.createdAt ?? "");
    expect(id.length).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(createdAt))).toBe(true);

    const filePath = path.join(root, ".data", "planning_v3_drafts", `${id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
