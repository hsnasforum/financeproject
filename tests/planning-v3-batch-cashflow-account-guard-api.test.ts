import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as cashflowGET } from "../src/app/api/planning/v3/transactions/batches/[id]/cashflow/route";
import { POST as bindAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4300";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
    },
  });
}

function requestPost(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 batch cashflow account guard", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-account-guard-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "batch-legacy",
      createdAt: "2026-03-03T00:00:00.000Z",
      kind: "csv",
      fileName: "legacy.csv",
      total: 1,
      ok: 1,
      failed: 0,
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), `${JSON.stringify({
      id: "t-legacy-1",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      batchId: "batch-legacy",
      createdAt: "2026-03-03T00:00:00.000Z",
      date: "2026-03-01",
      amountKrw: 1000,
      description: "masked",
      source: "csv",
      meta: { rowIndex: 2 },
    })}\n`);
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks cashflow until accountId is attached to batch", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-legacy" }),
    };

    const first = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(first.status).toBe(400);

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-legacy/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);

    const second = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(second.status).toBe(200);
    const payload = await second.json() as {
      ok?: boolean;
      monthly?: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.monthly)).toBe(true);
  });
});
