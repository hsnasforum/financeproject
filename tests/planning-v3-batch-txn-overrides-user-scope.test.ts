import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET as overridesGET,
  POST as overridesPOST,
} from "../src/app/api/planning/v3/batches/[id]/txn-overrides/route";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_V3_TXN_OVERRIDES_DIR",
  "PLANNING_V3_TXN_OVERRIDES_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4840";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const BATCH_ID = "batch-shared";
const TXN_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

type ApiPayload = {
  ok?: boolean;
  data?: Record<string, { kind?: string; categoryId?: string; note?: string }>;
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string };
};

type RouteContext = {
  params: Promise<{ id: string }>;
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
    referer: `${LOCAL_ORIGIN}/planning/v3/transactions/batches/${BATCH_ID}`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function contextFor(batchId: string): RouteContext {
  return { params: Promise.resolve({ id: batchId }) };
}

function buildGetRequest(batchId: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/batches/${encodeURIComponent(batchId)}/txn-overrides?csrf=test`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildPostRequest(batchId: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/batches/${encodeURIComponent(batchId)}/txn-overrides`, {
    method: "POST",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function saveOverrideFixture(userId: string, kind: string, categoryId: string, note: string): Promise<void> {
  const response = await overridesPOST(
    buildPostRequest(BATCH_ID, {
      csrf: "test",
      txnId: TXN_ID,
      kind,
      categoryId,
      note,
    }, userId),
    contextFor(BATCH_ID),
  );
  expect(response.status).toBe(200);
}

async function saveBatchFixture(userId: string): Promise<void> {
  await runWithPlanningUserScope({ userId, authSource: "test" }, () => saveBatch({
    id: BATCH_ID,
    createdAt: "2026-08-25T00:00:00.000Z",
    source: "csv",
    rowCount: 1,
  }, [{
    batchId: BATCH_ID,
    txnId: TXN_ID,
    date: "2026-08-25",
    amountKrw: -1000,
    description: "fixture",
    source: "csv",
  }]));
}

describe("planning v3 batch txn-overrides API user scope", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-txn-overrides-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_V3_TXN_OVERRIDES_DIR;
    delete env.PLANNING_V3_TXN_OVERRIDES_PATH;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    await saveBatchFixture("alice");
    await saveBatchFixture("bob");
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's batch transaction overrides", async () => {
    await saveOverrideFixture("alice", "force_income", "income", "alice-only");
    await saveOverrideFixture("bob", "force_expense", "food", "bob-only");

    const aliceRead = await overridesGET(buildGetRequest(BATCH_ID, "alice"), contextFor(BATCH_ID));
    expect(aliceRead.status).toBe(200);
    const alicePayload = await aliceRead.json() as ApiPayload;
    expect(alicePayload.data?.[TXN_ID]).toMatchObject({
      kind: "income",
      categoryId: "income",
      note: "alice-only",
    });

    const bobRead = await overridesGET(buildGetRequest(BATCH_ID, "bob"), contextFor(BATCH_ID));
    expect(bobRead.status).toBe(200);
    const bobPayload = await bobRead.json() as ApiPayload;
    expect(bobPayload.data?.[TXN_ID]).toMatchObject({
      kind: "expense",
      categoryId: "food",
      note: "bob-only",
    });
  });

  it("returns authenticated meta for invalid batch txn override inputs", async () => {
    const invalidBatch = await overridesGET(
      buildGetRequest("/bad", "alice"),
      contextFor("/bad"),
    );
    expect(invalidBatch.status).toBe(400);
    const invalidBatchPayload = await invalidBatch.json() as ApiPayload;
    expect(invalidBatchPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const missingTxnId = await overridesPOST(
      buildPostRequest(BATCH_ID, { csrf: "test", kind: "force_income" }, "alice"),
      contextFor(BATCH_ID),
    );
    expect(missingTxnId.status).toBe(400);
    const missingTxnIdPayload = await missingTxnId.json() as ApiPayload;
    expect(missingTxnIdPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const invalidTxnId = await overridesPOST(
      buildPostRequest(BATCH_ID, { csrf: "test", txnId: "bad", kind: "force_income" }, "alice"),
      contextFor(BATCH_ID),
    );
    expect(invalidTxnId.status).toBe(400);
    const invalidTxnIdPayload = await invalidTxnId.json() as ApiPayload;
    expect(invalidTxnIdPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });
  });
});
