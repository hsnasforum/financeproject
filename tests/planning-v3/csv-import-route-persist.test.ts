import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/planning/v3/csv/import/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3920";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF = "test-csrf";

function requestImport(csvText: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/csv/import?persist=1`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      cookie: `dev_csrf=${CSRF}`,
      "x-csrf-token": CSRF,
      "content-type": "text/csv",
    },
    body: csvText,
  });
}

describe("POST /api/planning/v3/csv/import persist mode", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-csv-import-persist-"));
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

  it("returns draftId and persists draft record", async () => {
    const response = await POST(requestImport([
      "date,amount,description",
      "2026-01-01,1000,salary",
    ].join("\n")));

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      draftId?: string;
      data?: { draftId?: string; draftSummary?: { rows?: number; columns?: number } };
      error?: { code?: string; message?: string };
    };

    expect(payload.ok).toBe(true);
    const draftId = String(payload.draftId ?? payload.data?.draftId ?? "");
    expect(draftId.length).toBeGreaterThan(0);
    expect(payload.data?.draftSummary).toEqual({ rows: 1, columns: 3 });

    const draftPath = path.join(root, ".data", "planning_v3_drafts", `${draftId}.json`);
    expect(fs.existsSync(draftPath)).toBe(true);
  });
});
