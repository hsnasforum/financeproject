import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as accountsGET } from "../src/app/api/planning/v3/accounts/route";
import { GET as openingBalancesGET } from "../src/app/api/planning/v3/opening-balances/route";
import { POST as importBatchPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";
import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;
const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

installPlanningAuthRequiredFalseForTest();

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/accounts`,
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

async function expectStorageError(response: Response, expected: { status: number; code: string }) {
  expect(response.status).toBe(expected.status);
  const payload = await response.json() as {
    ok?: boolean;
    error?: { code?: string; fixHref?: string };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe(expected.code);
  expect(payload.error?.fixHref).toBe("/ops/doctor");
}

describe("planning v3 storage error API contract", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-storage-error-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    delete env.PLANNING_SINGLE_USER_MODE;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningSingleUserMode === "string") env.PLANNING_SINGLE_USER_MODE = originalPlanningSingleUserMode;
    else delete env.PLANNING_SINGLE_USER_MODE;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("maps corrupt account storage to a doctor recovery error", async () => {
    const v3Dir = path.join(root, "planning-v3");
    fs.mkdirSync(v3Dir, { recursive: true });
    fs.writeFileSync(path.join(v3Dir, "accounts.json"), "{", "utf-8");

    await expectStorageError(
      await accountsGET(requestGet("/api/planning/v3/accounts?csrf=test")),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
  });

  it("maps unavailable account storage to a distinct 503 error", async () => {
    const v3Dir = path.join(root, "planning-v3");
    fs.mkdirSync(path.join(v3Dir, "accounts.json"), { recursive: true });

    await expectStorageError(
      await accountsGET(requestGet("/api/planning/v3/accounts?csrf=test")),
      { status: 503, code: "STORAGE_UNAVAILABLE" },
    );
  });

  it("maps corrupt opening-balance storage without returning an empty result", async () => {
    const v3Dir = path.join(root, "planning-v3");
    fs.mkdirSync(v3Dir, { recursive: true });
    fs.writeFileSync(path.join(v3Dir, "opening-balances.json"), "{", "utf-8");

    await expectStorageError(
      await openingBalancesGET(requestGet("/api/planning/v3/opening-balances?csrf=test")),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
  });

  it("maps corrupt batch index storage before mutating an import", async () => {
    const batchesDir = path.join(root, "planning-v3", "batches");
    fs.mkdirSync(batchesDir, { recursive: true });
    fs.writeFileSync(path.join(batchesDir, "index.json"), "{", "utf-8");

    await expectStorageError(
      await importBatchPOST(requestPost("/api/planning/v3/transactions/batches/import-csv", {
        csrf: "test",
        csvText: "date,amount,description\n2026-01-01,1000,income",
        mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      })),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
    const transactionFiles = fs.readdirSync(batchesDir).filter((name) => name.endsWith(".ndjson"));
    expect(transactionFiles).toEqual([]);
  });
});
