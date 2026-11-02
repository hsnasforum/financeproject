import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as accountsGET } from "../src/app/api/planning/v3/accounts/route";
import { GET as openingBalancesGET } from "../src/app/api/planning/v3/opening-balances/route";
import { GET as categoryRulesGET } from "../src/app/api/planning/v3/categories/rules/route";
import { GET as batchCenterGET } from "../src/app/api/planning/v3/batches/route";
import { POST as importBatchWithSummaryPOST } from "../src/app/api/planning/v3/batches/import/csv/route";
import { GET as batchSummaryGET } from "../src/app/api/planning/v3/batches/[id]/summary/route";
import { GET as batchOverridesGET } from "../src/app/api/planning/v3/batches/[id]/txn-overrides/route";
import { GET as categorizedGET } from "../src/app/api/planning/v3/transactions/batches/[id]/categorized/route";
import { GET as cashflowGET } from "../src/app/api/planning/v3/transactions/batches/[id]/cashflow/route";
import { POST as importBatchPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";
import { PATCH as accountOverridePATCH } from "../src/app/api/planning/v3/transactions/account-overrides/route";
import { PATCH as transferOverridePATCH } from "../src/app/api/planning/v3/transactions/transfer-overrides/route";
import { GET as monthlyBalancesGET } from "../src/app/api/planning/v3/balances/monthly/route";
import { POST as draftProfilePOST } from "../src/app/api/planning/v3/draft/profile/route";
import { POST as draftApplyPOST } from "../src/app/api/planning/v3/draft/apply/route";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;
const storePathEnvKeys = [
  "PLANNING_V3_ACCOUNTS_PATH",
  "PLANNING_V3_OPENING_BALANCES_PATH",
  "PLANNING_V3_BATCHES_DIR",
  "PLANNING_V3_CATEGORY_RULES_PATH",
  "PLANNING_V3_TXN_OVERRIDES_DIR",
  "PLANNING_V3_TXN_OVERRIDES_PATH",
  "PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR",
  "PLANNING_V3_TXN_TRANSFER_OVERRIDES_DIR",
] as const;
const originalStorePathEnv = Object.fromEntries(
  storePathEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof storePathEnvKeys)[number], string | undefined>;
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

function requestPatch(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
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

async function saveFixtureBatch(batchId: string): Promise<void> {
  await saveBatch({
    id: batchId,
    createdAt: "2026-07-11T00:00:00.000Z",
    source: "csv",
    rowCount: 1,
    accounts: [{ id: "account-main" }],
  }, [{
    txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    batchId,
    accountId: "account-main",
    date: "2026-07-01",
    amountKrw: 1000,
    description: "salary",
    source: "csv",
  }]);
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
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_SINGLE_USER_MODE;
    for (const key of storePathEnvKeys) delete env[key];
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;
    if (typeof originalPlanningSingleUserMode === "string") env.PLANNING_SINGLE_USER_MODE = originalPlanningSingleUserMode;
    else delete env.PLANNING_SINGLE_USER_MODE;
    for (const key of storePathEnvKeys) {
      if (typeof originalStorePathEnv[key] === "string") env[key] = originalStorePathEnv[key];
      else delete env[key];
    }
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

  it("maps corrupt and unavailable category rules to the standard recovery contract", async () => {
    const rulesPath = path.join(root, "planning-v3", "category-rules.json");
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, "{", "utf-8");

    await expectStorageError(
      await categoryRulesGET(requestGet("/api/planning/v3/categories/rules?csrf=test")),
      { status: 500, code: "STORAGE_CORRUPT" },
    );

    fs.rmSync(rulesPath, { force: true });
    fs.mkdirSync(rulesPath, { recursive: true });
    await expectStorageError(
      await categoryRulesGET(requestGet("/api/planning/v3/categories/rules?csrf=test")),
      { status: 503, code: "STORAGE_UNAVAILABLE" },
    );
  });

  it("maps corrupt direct override mutations and reads instead of overwriting their files", async () => {
    const batchId = "storage-errors";
    await saveFixtureBatch(batchId);
    const planningV3Dir = path.join(root, "planning-v3");
    const txnPath = path.join(planningV3Dir, "txn-overrides", `${batchId}.json`);
    const accountPath = path.join(planningV3Dir, "txn-account-overrides", `${batchId}.json`);
    const transferPath = path.join(planningV3Dir, "txn-transfer-overrides", `${batchId}.json`);
    for (const filePath of [txnPath, accountPath, transferPath]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "{", "utf-8");
    }

    await expectStorageError(
      await batchOverridesGET(
        requestGet(`/api/planning/v3/batches/${batchId}/txn-overrides?csrf=test`),
        { params: Promise.resolve({ id: batchId }) },
      ),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
    await expectStorageError(
      await accountOverridePATCH(requestPatch("/api/planning/v3/transactions/account-overrides", {
        csrf: "test",
        batchId,
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        accountId: "account-main",
      })),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
    await expectStorageError(
      await transferOverridePATCH(requestPatch("/api/planning/v3/transactions/transfer-overrides", {
        csrf: "test",
        batchId,
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        forceTransfer: true,
      })),
      { status: 500, code: "STORAGE_CORRUPT" },
    );

    expect(fs.readFileSync(txnPath, "utf-8")).toBe("{");
    expect(fs.readFileSync(accountPath, "utf-8")).toBe("{");
    expect(fs.readFileSync(transferPath, "utf-8")).toBe("{");
  });

  it("propagates corrupt transaction overrides through representative batch projection APIs", async () => {
    const batchId = "projection-errors";
    await saveFixtureBatch(batchId);
    const txnPath = path.join(root, "planning-v3", "txn-overrides", `${batchId}.json`);
    fs.mkdirSync(path.dirname(txnPath), { recursive: true });
    fs.writeFileSync(txnPath, "{", "utf-8");
    const context = { params: Promise.resolve({ id: batchId }) };

    const responses = await Promise.all([
      batchCenterGET(requestGet("/api/planning/v3/batches?csrf=test")),
      batchSummaryGET(
        requestGet(`/api/planning/v3/batches/${batchId}/summary?csrf=test`),
        context,
      ),
      categorizedGET(
        requestGet(`/api/planning/v3/transactions/batches/${batchId}/categorized?csrf=test`),
        context,
      ),
      cashflowGET(
        requestGet(`/api/planning/v3/transactions/batches/${batchId}/cashflow?csrf=test`),
        context,
      ),
      monthlyBalancesGET(
        requestGet(`/api/planning/v3/balances/monthly?batchId=${batchId}&csrf=test`),
      ),
      draftProfilePOST(requestPost("/api/planning/v3/draft/profile", {
        csrf: "test",
        source: "csv",
        batchId,
      })),
      draftApplyPOST(requestPost("/api/planning/v3/draft/apply", {
        csrf: "test",
        profileId: "profile-a",
        batchId,
        mode: "preview",
      })),
    ]);

    for (const response of responses) {
      await expectStorageError(response, { status: 500, code: "STORAGE_CORRUPT" });
    }
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

  it("preflights corrupt projection stores before committing an import", async () => {
    const v3Dir = path.join(root, "planning-v3");
    fs.mkdirSync(v3Dir, { recursive: true });
    fs.writeFileSync(path.join(v3Dir, "category-rules.json"), "{", "utf-8");

    await expectStorageError(
      await importBatchWithSummaryPOST(requestPost("/api/planning/v3/batches/import/csv", {
        csrf: "test",
        csvText: "date,amount,description\n2026-01-01,1000,income",
        mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      })),
      { status: 500, code: "STORAGE_CORRUPT" },
    );
    expect(fs.existsSync(path.join(v3Dir, "batches", "index.json"))).toBe(false);
    expect(fs.existsSync(path.join(v3Dir, "batches"))).toBe(false);

    const summaryFreeResponse = await importBatchPOST(requestPost("/api/planning/v3/transactions/batches/import-csv", {
      csrf: "test",
      csvText: "date,amount,description\n2026-01-01,1000,income",
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    }));
    expect(summaryFreeResponse.status).toBe(201);
    expect(fs.existsSync(path.join(v3Dir, "batches", "index.json"))).toBe(true);
  });
});
