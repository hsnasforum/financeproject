import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET as getBatchOverrides,
  POST as postBatchOverride,
} from "../src/app/api/planning/v3/batches/[batchId]/txn-overrides/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4901";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function context(batchId = "batch-a"): { params: Promise<{ batchId: string }> } {
  return {
    params: Promise.resolve({ batchId }),
  };
}

function requestGet(batchId = "batch-a"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/batches/${batchId}/txn-overrides?csrf=test`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions/batches/${batchId}`,
    },
  });
}

function requestPost(batchId: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/batches/${batchId}/txn-overrides`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions/batches/${batchId}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 batch txn-overrides API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-txn-overrides-api-"));
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

  it("returns 400 when kind is invalid", async () => {
    const response = await postBatchOverride(requestPost("batch-a", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "invalid-kind",
    }), context());
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("stores and reads back batch-scoped override", async () => {
    const save = await postBatchOverride(requestPost("batch-a", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "force_income",
      categoryId: "income",
      note: "manual",
    }), context());
    expect(save.status).toBe(200);

    const get = await getBatchOverrides(requestGet("batch-a"), context());
    expect(get.status).toBe(200);
    const payload = await get.json() as {
      ok?: boolean;
      data?: Record<string, { kind?: string; categoryId?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.aaaaaaaaaaaaaaaaaaaaaaaa?.kind).toBe("income");
    expect(payload.data?.aaaaaaaaaaaaaaaaaaaaaaaa?.categoryId).toBe("income");
  });
});
