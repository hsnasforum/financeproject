import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE } from "../../src/app/api/planning/v3/drafts/[id]/route";
import { GET, POST } from "../../src/app/api/planning/v3/drafts/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3921";
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

function requestPost(body: unknown): Request {
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
    body: JSON.stringify({ csrf: CSRF, ...((body ?? {}) as Record<string, unknown>) }),
  });
}

function requestDelete(id: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/drafts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
      cookie: `dev_csrf=${CSRF}`,
      "x-csrf-token": CSRF,
      "content-type": "application/json",
    },
    body: JSON.stringify({ csrf: CSRF }),
  });
}

describe("planning v3 drafts routes flow", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-routes-flow-"));
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

  it("lists latest drafts with default limit and removes deleted draft", async () => {
    for (let i = 0; i < 52; i += 1) {
      const created = await POST(requestPost({
        source: { kind: "csv", filename: `sample-${i}.csv` },
        payload: {
          cashflow: [
            { ym: "2026-01", incomeKrw: 1000 + i, expenseKrw: -500, netKrw: 500 + i, txCount: 1 },
          ],
          draftPatch: {
            monthlyIncomeNet: 1000 + i,
            monthlyEssentialExpenses: 500,
            monthlyDiscretionaryExpenses: 100,
          },
        },
        meta: { rows: 1, columns: 3 },
      }));
      expect(created.status).toBe(201);
    }

    const listed = await GET(requestGet("/api/planning/v3/drafts"));
    expect(listed.status).toBe(200);
    const listedPayload = await listed.json() as {
      ok?: boolean;
      drafts?: Array<{ id: string; createdAt: string }>;
    };

    expect(listedPayload.ok).toBe(true);
    expect(Array.isArray(listedPayload.drafts)).toBe(true);
    expect(listedPayload.drafts?.length).toBe(50);

    const rows = listedPayload.drafts ?? [];
    for (let i = 0; i < rows.length - 1; i += 1) {
      const left = Date.parse(rows[i]?.createdAt ?? "");
      const right = Date.parse(rows[i + 1]?.createdAt ?? "");
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(right)).toBe(true);
      expect(left).toBeGreaterThanOrEqual(right);
    }

    const deleteId = String(rows[0]?.id ?? "");
    expect(deleteId).toBeTruthy();

    const deleted = await DELETE(requestDelete(deleteId), { params: Promise.resolve({ id: deleteId }) });
    expect(deleted.status).toBe(200);

    const listedAfterDelete = await GET(requestGet("/api/planning/v3/drafts?limit=100"));
    expect(listedAfterDelete.status).toBe(200);
    const listedAfterDeletePayload = await listedAfterDelete.json() as {
      ok?: boolean;
      drafts?: Array<{ id: string }>;
    };

    expect(listedAfterDeletePayload.ok).toBe(true);
    expect((listedAfterDeletePayload.drafts ?? []).some((row) => row.id === deleteId)).toBe(false);
    expect((listedAfterDeletePayload.drafts ?? []).length).toBe(51);
  });
});
