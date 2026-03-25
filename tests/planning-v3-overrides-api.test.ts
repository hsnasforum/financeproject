import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DELETE as overridesDELETE,
  GET as overridesGET,
  PATCH as overridesPATCH,
} from "../src/app/api/planning/v3/transactions/overrides/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4500";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

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

function requestJson(method: "PATCH" | "DELETE", body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/transactions/overrides`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 transaction overrides API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-overrides-api-"));
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

  it("returns 400 when enum input is invalid", async () => {
    const response = await overridesPATCH(requestJson("PATCH", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "invalid-kind",
      category: "unknown",
    }));
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("supports get/patch/delete lifecycle", async () => {
    const patch = await overridesPATCH(requestJson("PATCH", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "expense",
      category: "fixed",
    }));
    expect(patch.status).toBe(200);
    const patched = await patch.json() as { ok?: boolean; scope?: string };
    expect(patched.ok).toBe(true);
    expect(patched.scope).toBe("legacy-unscoped");

    const get = await overridesGET(requestGet("/api/planning/v3/transactions/overrides?csrf=test"));
    expect(get.status).toBe(200);
    const listed = await get.json() as {
      ok?: boolean;
      scope?: string;
      items?: Record<string, { kind?: string; category?: string }>;
    };
    expect(listed.ok).toBe(true);
    expect(listed.scope).toBe("legacy-unscoped");
    expect(listed.items?.aaaaaaaaaaaaaaaaaaaaaaaa?.kind).toBe("expense");

    const del = await overridesDELETE(requestJson("DELETE", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    }));
    expect(del.status).toBe(200);
    const deleted = await del.json() as { ok?: boolean; scope?: string };
    expect(deleted.ok).toBe(true);
    expect(deleted.scope).toBe("legacy-unscoped");
  });

  it("keeps no-batch listing legacy-only and uses batchId query for batch-scoped bridge reads", async () => {
    const legacyTxnId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const batchTxnId = "bbbbbbbbbbbbbbbbbbbbbbbb";

    const legacyPatch = await overridesPATCH(requestJson("PATCH", {
      csrf: "test",
      txnId: legacyTxnId,
      kind: "expense",
      category: "fixed",
    }));
    expect(legacyPatch.status).toBe(200);
    const legacyPatchPayload = await legacyPatch.json() as { ok?: boolean; scope?: string };
    expect(legacyPatchPayload.ok).toBe(true);
    expect(legacyPatchPayload.scope).toBe("legacy-unscoped");

    const batchPatch = await overridesPATCH(requestJson("PATCH", {
      csrf: "test",
      batchId: "batch-a",
      txnId: batchTxnId,
      categoryId: "food",
    }));
    expect(batchPatch.status).toBe(200);
    const batchPatchPayload = await batchPatch.json() as { ok?: boolean; scope?: string };
    expect(batchPatchPayload.ok).toBe(true);
    expect(batchPatchPayload.scope).toBe("batch-scoped");

    const legacyGet = await overridesGET(requestGet("/api/planning/v3/transactions/overrides?csrf=test"));
    expect(legacyGet.status).toBe(200);
    const legacyPayload = await legacyGet.json() as {
      ok?: boolean;
      scope?: string;
      items?: Record<string, { batchId?: string; category?: string; categoryId?: string }>;
    };
    expect(legacyPayload.ok).toBe(true);
    expect(legacyPayload.scope).toBe("legacy-unscoped");
    expect(legacyPayload.items?.[legacyTxnId]?.batchId).toBe("legacy");
    expect(legacyPayload.items?.[batchTxnId]).toBeUndefined();

    const batchGet = await overridesGET(requestGet("/api/planning/v3/transactions/overrides?batchId=batch-a&csrf=test"));
    expect(batchGet.status).toBe(200);
    const batchPayload = await batchGet.json() as {
      ok?: boolean;
      scope?: string;
      batchId?: string | null;
      items?: Record<string, { batchId?: string; categoryId?: string }>;
    };
    expect(batchPayload.ok).toBe(true);
    expect(batchPayload.scope).toBe("batch-scoped");
    expect(batchPayload.batchId).toBe("batch-a");
    expect(batchPayload.items?.[batchTxnId]?.batchId).toBe("batch-a");
    expect(batchPayload.items?.[batchTxnId]?.categoryId).toBe("food");
    expect(batchPayload.items?.[legacyTxnId]).toBeUndefined();
  });
});
