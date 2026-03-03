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

    const get = await overridesGET(requestGet("/api/planning/v3/transactions/overrides?csrf=test"));
    expect(get.status).toBe(200);
    const listed = await get.json() as {
      ok?: boolean;
      items?: Record<string, { kind?: string; category?: string }>;
    };
    expect(listed.ok).toBe(true);
    expect(listed.items?.aaaaaaaaaaaaaaaaaaaaaaaa?.kind).toBe("expense");

    const del = await overridesDELETE(requestJson("DELETE", {
      csrf: "test",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    }));
    expect(del.status).toBe(200);
  });
});
