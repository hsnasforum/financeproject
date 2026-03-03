import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as draftDELETE, GET as draftGET } from "../src/app/api/planning/v3/drafts/[id]/route";
import { GET as draftsGET, POST as draftsPOST } from "../src/app/api/planning/v3/drafts/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3300";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(method: string, pathName: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestGet(pathName: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
    },
  });
}

describe("planning v3 drafts api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports POST -> GET list -> GET detail -> DELETE lifecycle", async () => {
    const createResponse = await draftsPOST(requestJson("POST", "/api/planning/v3/drafts", {
      source: { kind: "csv", rows: 2, months: 1 },
      cashflow: [
        { ym: "2026-03", incomeKrw: 1_000_000, expenseKrw: -300_000, netKrw: 700_000, txCount: 2 },
      ],
      draftPatch: {
        monthlyIncomeNet: 700_000,
        monthlyEssentialExpenses: 210_000,
        monthlyDiscretionaryExpenses: 90_000,
        assumptions: ["safe note"],
        monthsConsidered: 1,
      },
    }));

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { ok?: boolean; id?: string };
    expect(created.ok).toBe(true);
    expect(created.id).toBeTruthy();

    const listResponse = await draftsGET(requestGet("/api/planning/v3/drafts"));
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json() as {
      ok?: boolean;
      drafts?: Array<{ id?: string }>;
    };
    expect(listed.ok).toBe(true);
    expect((listed.drafts ?? []).some((row) => row.id === created.id)).toBe(true);

    const detailResponse = await draftGET(
      requestGet(`/api/planning/v3/drafts/${created.id}`),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as {
      ok?: boolean;
      draft?: { id?: string };
    };
    expect(detail.ok).toBe(true);
    expect(detail.draft?.id).toBe(created.id);

    const deleteResponse = await draftDELETE(
      requestJson("DELETE", `/api/planning/v3/drafts/${created.id}`, {}),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deleted = await deleteResponse.json() as { ok?: boolean; deleted?: boolean };
    expect(deleted.ok).toBe(true);
    expect(deleted.deleted).toBe(true);

    const listAfterDelete = await draftsGET(requestGet("/api/planning/v3/drafts"));
    const listedAfterDelete = await listAfterDelete.json() as {
      drafts?: Array<{ id?: string }>;
    };
    expect((listedAfterDelete.drafts ?? []).some((row) => row.id === created.id)).toBe(false);
  });
});
