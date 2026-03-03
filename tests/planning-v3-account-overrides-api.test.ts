import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchAccountOverride } from "../src/app/api/planning/v3/transactions/account-overrides/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4910";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestPatch(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/transactions/account-overrides`, {
    method: "PATCH",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 account-overrides API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-account-overrides-api-"));
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

  it("stores account mapping override", async () => {
    const response = await patchAccountOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      accountId: "acc-main",
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      override?: { accountId?: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.override?.accountId).toBe("acc-main");
  });
});
