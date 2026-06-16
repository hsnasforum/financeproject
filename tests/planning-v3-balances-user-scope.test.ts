import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as monthlyBalancesGET } from "../src/app/api/planning/v3/balances/monthly/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4730";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  batchId?: string;
  data?: Array<{ ym?: string; accountId?: string; closingKrw?: number }>;
  items?: Array<{ ym?: string; accountId?: string; closingKrw?: number }>;
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function userHeaders(userId: string, contentType?: string): Record<string, string> {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/balances`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function buildGetRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildJsonRequest(urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "POST",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function createBatchFixture(userId: string): Promise<string> {
  const response = await importCsvPOST(buildJsonRequest("/api/planning/v3/transactions/batches/import-csv", {
    csrf: "test",
    fileName: `${userId}-balances.csv`,
    options: { accountId: `${userId}-balance-account` },
    csvText: [
      "date,amount,description",
      "2026-11-01,3000000,salary",
      "2026-11-02,-900000,rent",
    ].join("\n"),
  }, userId));
  expect(response.status).toBe(201);
  const payload = await response.json() as ApiPayload;
  const batchId = String(payload.batchId ?? "");
  expect(batchId).toBeTruthy();
  return batchId;
}

describe("planning v3 monthly balances API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-balances-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's batch through monthly balances", async () => {
    const aliceBatchId = await createBatchFixture("alice");
    const bobBatchId = await createBatchFixture("bob");
    expect(aliceBatchId).not.toBe(bobBatchId);

    const bobReadsAlice = await monthlyBalancesGET(
      buildGetRequest(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(aliceBatchId)}&includeTransfers=0&csrf=test`, "bob"),
    );
    expect(bobReadsAlice.status).toBe(404);
    const bobReadsAlicePayload = await bobReadsAlice.json() as ApiPayload;
    expect(bobReadsAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobReadsBob = await monthlyBalancesGET(
      buildGetRequest(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(bobBatchId)}&includeTransfers=0&csrf=test`, "bob"),
    );
    expect(bobReadsBob.status).toBe(200);
    const bobReadsBobPayload = await bobReadsBob.json() as ApiPayload;
    expect(bobReadsBobPayload.ok).toBe(true);
    expect(bobReadsBobPayload.data).toEqual([
      expect.objectContaining({
        ym: "2026-11",
        accountId: "bob-balance-account",
        closingKrw: 2_100_000,
      }),
    ]);
    expect(bobReadsBobPayload.items).toEqual(bobReadsBobPayload.data);
  });

  it("returns authenticated meta for monthly balance input errors", async () => {
    const missingBatch = await monthlyBalancesGET(
      buildGetRequest("/api/planning/v3/balances/monthly?csrf=test", "alice"),
    );
    expect(missingBatch.status).toBe(400);
    const missingBatchPayload = await missingBatch.json() as ApiPayload;
    expect(missingBatchPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });
  });
});
