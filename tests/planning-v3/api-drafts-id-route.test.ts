import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET } from "../../src/app/api/planning/v3/drafts/[id]/route";
import { createDraft } from "../../src/lib/planning/v3/drafts/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3902";
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

function requestDelete(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
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

describe("planning v3 drafts [id] route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-api-drafts-id-route-"));
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

  it("supports detail get and delete", async () => {
    const created = await createDraft({
      source: { kind: "csv", filename: "sample.csv" },
      payload: {
        cashflow: [
          { ym: "2026-01", incomeKrw: 2_500_000, expenseKrw: -900_000, netKrw: 1_600_000, txCount: 2 },
        ],
        draftPatch: {
          monthlyIncomeNet: 2_500_000,
          monthlyEssentialExpenses: 900_000,
          monthlyDiscretionaryExpenses: 300_000,
        },
      },
      meta: { rows: 2, columns: 3 },
    });

    const detail = await GET(
      requestGet(`/api/planning/v3/drafts/${encodeURIComponent(created.id)}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(detail.status).toBe(200);
    const detailPayload = await detail.json() as { ok?: boolean; draft?: { id?: string; source?: { rows?: number } } };
    expect(detailPayload.ok).toBe(true);
    expect(detailPayload.draft?.id).toBe(created.id);
    expect(detailPayload.draft?.source?.rows).toBe(2);

    const deleted = await DELETE(
      requestDelete(`/api/planning/v3/drafts/${encodeURIComponent(created.id)}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(deleted.status).toBe(200);
    const deletedPayload = await deleted.json() as { ok?: boolean; deleted?: boolean; data?: { deleted?: boolean } };
    expect(deletedPayload.ok).toBe(true);
    expect(deletedPayload.deleted ?? deletedPayload.data?.deleted).toBe(true);

    const missing = await GET(
      requestGet(`/api/planning/v3/drafts/${encodeURIComponent(created.id)}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(missing.status).toBe(404);
  });
});
