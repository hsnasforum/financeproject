import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as batchDELETE, GET as batchGET } from "../src/app/api/planning/v3/transactions/batches/[id]/route";
import { POST as legacyImportCsvPOST } from "../src/app/api/planning/v3/transactions/import/csv/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";
import { GET as batchesGET } from "../src/app/api/planning/v3/transactions/batches/route";

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

const LOCAL_HOST = "localhost:4630";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  batchId?: string;
  items?: Array<{ id?: string }>;
  data?: Array<{ id?: string; batchId?: string }>;
  batch?: { id?: string };
  transactions?: Array<{ txnId?: string; category?: string }>;
  deleted?: boolean;
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string };
};

function writeBatchOverrideSidecars(input: {
  root: string;
  userId: string;
  batchId: string;
  txnId: string;
}): string[] {
  const baseDir = path.join(input.root, "users", input.userId, "planning-v3");
  const updatedAt = "2026-08-24T00:00:00.000Z";
  const fixtures = [
    {
      filePath: path.join(baseDir, "txn-overrides", `${input.batchId}.json`),
      row: {
        batchId: input.batchId,
        txnId: input.txnId,
        categoryId: "education",
        updatedAt,
      },
    },
    {
      filePath: path.join(baseDir, "txn-account-overrides", `${input.batchId}.json`),
      row: {
        batchId: input.batchId,
        txnId: input.txnId,
        accountId: "override-account",
        updatedAt,
      },
    },
    {
      filePath: path.join(baseDir, "txn-transfer-overrides", `${input.batchId}.json`),
      row: {
        batchId: input.batchId,
        txnId: input.txnId,
        forceTransfer: true,
        updatedAt,
      },
    },
  ];

  for (const fixture of fixtures) {
    fs.mkdirSync(path.dirname(fixture.filePath), { recursive: true });
    fs.writeFileSync(fixture.filePath, `${JSON.stringify({
      version: 1,
      items: { [input.txnId]: fixture.row },
    })}\n`, "utf-8");
  }
  return fixtures.map((fixture) => fixture.filePath);
}

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
    referer: `${LOCAL_ORIGIN}/planning/v3/transactions/batches`,
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

function buildDeleteRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "DELETE",
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
    fileName: `${userId}-transactions-batch.csv`,
    options: { accountId: `${userId}-account` },
    csvText: [
      "date,amount,description",
      "2026-09-01,3000000,salary",
      "2026-09-02,-900000,rent",
    ].join("\n"),
  }, userId));
  expect(response.status).toBe(201);
  const payload = await response.json() as ApiPayload;
  const batchId = String(payload.batchId ?? "");
  expect(batchId).toBeTruthy();
  return batchId;
}

async function createLegacyUrlBatchFixture(userId: string): Promise<string> {
  const response = await legacyImportCsvPOST(buildJsonRequest("/api/planning/v3/transactions/import/csv", {
    csrf: "test",
    fileName: `${userId}-legacy-url.csv`,
    accountId: `${userId}-account`,
    csvText: [
      "date,amount,description",
      "2026-09-03,100000,bonus",
      "2026-09-04,-12000,meal",
    ].join("\n"),
  }, userId));
  expect(response.status).toBe(201);
  const payload = await response.json() as ApiPayload;
  const batchId = String(payload.batchId ?? payload.batch?.id ?? "");
  expect(batchId).toBeTruthy();
  return batchId;
}

function hasBatchId(rows: Array<{ id?: string; batchId?: string }> | undefined, batchId: string): boolean {
  return (rows ?? []).some((row) => row.id === batchId || row.batchId === batchId);
}

describe("planning v3 transaction batches API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-transactions-batches-user-scope-"));
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
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's transaction batch through list, detail, or delete", async () => {
    const aliceBatchId = await createBatchFixture("alice");
    const bobBatchId = await createBatchFixture("bob");

    const aliceList = await batchesGET(buildGetRequest("/api/planning/v3/transactions/batches?limit=20&csrf=test", "alice"));
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(hasBatchId(aliceListPayload.items, aliceBatchId)).toBe(true);
    expect(hasBatchId(aliceListPayload.data, aliceBatchId)).toBe(true);
    expect(hasBatchId(aliceListPayload.items, bobBatchId)).toBe(false);
    expect(hasBatchId(aliceListPayload.data, bobBatchId)).toBe(false);

    const bobList = await batchesGET(buildGetRequest("/api/planning/v3/transactions/batches?limit=20&csrf=test", "bob"));
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(hasBatchId(bobListPayload.items, bobBatchId)).toBe(true);
    expect(hasBatchId(bobListPayload.data, bobBatchId)).toBe(true);
    expect(hasBatchId(bobListPayload.items, aliceBatchId)).toBe(false);
    expect(hasBatchId(bobListPayload.data, aliceBatchId)).toBe(false);

    const bobDetailAlice = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${encodeURIComponent(aliceBatchId)}?csrf=test`, "bob"),
      { params: Promise.resolve({ id: aliceBatchId }) },
    );
    expect(bobDetailAlice.status).toBe(404);
    const bobDetailAlicePayload = await bobDetailAlice.json() as ApiPayload;
    expect(bobDetailAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobDeleteAlice = await batchDELETE(
      buildDeleteRequest(`/api/planning/v3/transactions/batches/${encodeURIComponent(aliceBatchId)}?csrf=test`, "bob"),
      { params: Promise.resolve({ id: aliceBatchId }) },
    );
    expect(bobDeleteAlice.status).toBe(404);
    const bobDeleteAlicePayload = await bobDeleteAlice.json() as ApiPayload;
    expect(bobDeleteAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const aliceDetail = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${encodeURIComponent(aliceBatchId)}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: aliceBatchId }) },
    );
    expect(aliceDetail.status).toBe(200);
    const aliceDetailPayload = await aliceDetail.json() as ApiPayload;
    expect(aliceDetailPayload.batch?.id).toBe(aliceBatchId);
  });

  it("deletes only the current user's batch sidecars and does not revive them after the same CSV is reimported", async () => {
    const batchId = await createBatchFixture("alice");
    const detailBefore = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailBefore.status).toBe(200);
    const detailBeforePayload = await detailBefore.json() as ApiPayload;
    const txnId = String(detailBeforePayload.transactions?.[0]?.txnId ?? "");
    expect(txnId).toBeTruthy();

    const aliceSidecars = writeBatchOverrideSidecars({ root, userId: "alice", batchId, txnId });
    const bobSidecars = writeBatchOverrideSidecars({ root, userId: "bob", batchId, txnId });
    const profileDraftPath = path.join(
      root,
      "users",
      "alice",
      "planning-v3",
      "drafts",
      "profile",
      "independent-profile-draft.json",
    );
    fs.mkdirSync(path.dirname(profileDraftPath), { recursive: true });
    fs.writeFileSync(profileDraftPath, '{"preserve":true}\n', "utf-8");

    const sharedLegacyPath = path.join(root, "v3", "transactions", "batches.ndjson");
    fs.mkdirSync(path.dirname(sharedLegacyPath), { recursive: true });
    const sharedLegacyRaw = `${JSON.stringify({
      id: batchId,
      createdAt: "2026-08-24T00:00:00.000Z",
      kind: "csv",
      fileName: "shared-legacy.csv",
      total: 1,
      ok: 1,
      failed: 0,
      accountId: "shared-account",
      accountHint: "shared-account",
    })}\n`;
    fs.writeFileSync(sharedLegacyPath, sharedLegacyRaw, "utf-8");

    const overridden = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(overridden.status).toBe(200);
    const overriddenPayload = await overridden.json() as ApiPayload;
    expect(overriddenPayload.transactions?.find((row) => row.txnId === txnId)?.category).toBe("education");

    const deleted = await batchDELETE(
      buildDeleteRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      ok: true,
      deleted: true,
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    expect(aliceSidecars.every((filePath) => !fs.existsSync(filePath))).toBe(true);
    expect(bobSidecars.every((filePath) => fs.existsSync(filePath))).toBe(true);
    expect(fs.existsSync(profileDraftPath)).toBe(true);
    expect(fs.readFileSync(sharedLegacyPath, "utf-8")).toBe(sharedLegacyRaw);

    const reimportedBatchId = await createBatchFixture("alice");
    expect(reimportedBatchId).toBe(batchId);
    const detailAfterReimport = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailAfterReimport.status).toBe(200);
    const detailAfterReimportPayload = await detailAfterReimport.json() as ApiPayload;
    expect(detailAfterReimportPayload.transactions?.find((row) => row.txnId === txnId)?.category).not.toBe("education");
  });

  it("returns a storage error instead of deleting a batch when a sidecar is corrupted", async () => {
    const batchId = await createBatchFixture("alice");
    const corruptSidecarPath = path.join(
      root,
      "users",
      "alice",
      "planning-v3",
      "txn-overrides",
      `${batchId}.json`,
    );
    fs.mkdirSync(path.dirname(corruptSidecarPath), { recursive: true });
    fs.writeFileSync(corruptSidecarPath, '{"version":1,"items":', "utf-8");

    const deleted = await batchDELETE(
      buildDeleteRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(deleted.status).toBe(500);
    expect(await deleted.json()).toMatchObject({
      ok: false,
      error: { code: "STORAGE_CORRUPT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const detailAfterFailure = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailAfterFailure.status).toBe(500);
  });

  it("maps batch transaction unlink failures without removing the batch index entry", async () => {
    const batchId = await createBatchFixture("alice");
    const detailBefore = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    const detailBeforePayload = await detailBefore.json() as ApiPayload;
    const txnId = String(detailBeforePayload.transactions?.[0]?.txnId ?? "");
    expect(txnId).toBeTruthy();
    const sidecarPaths = writeBatchOverrideSidecars({ root, userId: "alice", batchId, txnId });
    const batchFilePath = path.join(
      root,
      "users",
      "alice",
      "planning-v3",
      "batches",
      `${batchId}.ndjson`,
    );
    const originalUnlink = fsPromises.unlink.bind(fsPromises);
    vi.spyOn(fsPromises, "unlink").mockImplementation(async (candidate) => {
      if (path.resolve(String(candidate)) === path.resolve(batchFilePath)) {
        throw Object.assign(new Error("injected batch unlink failure"), { code: "EACCES" });
      }
      return originalUnlink(candidate);
    });

    const deleted = await batchDELETE(
      buildDeleteRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(deleted.status).toBe(503);
    expect(await deleted.json()).toMatchObject({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    expect(fs.existsSync(batchFilePath)).toBe(true);
    expect(sidecarPaths.every((filePath) => fs.existsSync(filePath))).toBe(true);
    const detailAfterFailure = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailAfterFailure.status).toBe(200);
    const detailAfterFailurePayload = await detailAfterFailure.json() as ApiPayload;
    expect(detailAfterFailurePayload.transactions?.find((row) => row.txnId === txnId)?.category).toBe("education");
  });

  it("keeps the legacy import URL on the user-scoped canonical store", async () => {
    const aliceBatchId = await createLegacyUrlBatchFixture("alice");

    const globalLegacyPath = path.join(root, "v3", "transactions", "batches.ndjson");
    expect(fs.existsSync(globalLegacyPath)).toBe(false);

    const aliceList = await batchesGET(buildGetRequest("/api/planning/v3/transactions/batches?limit=20&csrf=test", "alice"));
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(hasBatchId(aliceListPayload.items, aliceBatchId)).toBe(true);
    expect(hasBatchId(aliceListPayload.data, aliceBatchId)).toBe(true);

    const bobList = await batchesGET(buildGetRequest("/api/planning/v3/transactions/batches?limit=20&csrf=test", "bob"));
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(hasBatchId(bobListPayload.items, aliceBatchId)).toBe(false);
    expect(hasBatchId(bobListPayload.data, aliceBatchId)).toBe(false);

    const bobDetailAlice = await batchGET(
      buildGetRequest(`/api/planning/v3/transactions/batches/${encodeURIComponent(aliceBatchId)}?csrf=test`, "bob"),
      { params: Promise.resolve({ id: aliceBatchId }) },
    );
    expect(bobDetailAlice.status).toBe(404);
  });

  it("returns authenticated meta for invalid transaction batch ids", async () => {
    const invalidDetail = await batchGET(
      buildGetRequest("/api/planning/v3/transactions/batches/%2Fbad?csrf=test", "bob"),
      { params: Promise.resolve({ id: "/bad" }) },
    );
    expect(invalidDetail.status).toBe(400);
    const invalidDetailPayload = await invalidDetail.json() as ApiPayload;
    expect(invalidDetailPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidDelete = await batchDELETE(
      buildDeleteRequest("/api/planning/v3/transactions/batches/%2Fbad?csrf=test", "bob"),
      { params: Promise.resolve({ id: "/bad" }) },
    );
    expect(invalidDelete.status).toBe(400);
    const invalidDeletePayload = await invalidDelete.json() as ApiPayload;
    expect(invalidDeletePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });

  it("returns authenticated meta for invalid transaction batch imports", async () => {
    const missingCsvText = await importCsvPOST(buildJsonRequest("/api/planning/v3/transactions/batches/import-csv", {
      csrf: "test",
    }, "bob"));
    expect(missingCsvText.status).toBe(400);
    const missingCsvTextPayload = await missingCsvText.json() as ApiPayload;
    expect(missingCsvTextPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidMappingShape = await importCsvPOST(buildJsonRequest("/api/planning/v3/transactions/batches/import-csv", {
      csrf: "test",
      csvText: [
        "date,amount,description",
        "2026-09-01,3000000,salary",
      ].join("\n"),
      mapping: "date=missing",
    }, "bob"));
    expect(invalidMappingShape.status).toBe(400);
    const invalidMappingShapePayload = await invalidMappingShape.json() as ApiPayload;
    expect(invalidMappingShapePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidOptionsShape = await importCsvPOST(buildJsonRequest("/api/planning/v3/transactions/batches/import-csv", {
      csrf: "test",
      csvText: [
        "date,amount,description",
        "2026-09-01,3000000,salary",
      ].join("\n"),
      options: "account=bob",
    }, "bob"));
    expect(invalidOptionsShape.status).toBe(400);
    const invalidOptionsShapePayload = await invalidOptionsShape.json() as ApiPayload;
    expect(invalidOptionsShapePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidMappingValue = await importCsvPOST(buildJsonRequest("/api/planning/v3/transactions/batches/import-csv", {
      csrf: "test",
      csvText: [
        "date,amount,description",
        "2026-09-01,3000000,salary",
      ].join("\n"),
      mapping: { dateKey: "missing-date", amountKey: "amount" },
    }, "bob"));
    expect(invalidMappingValue.status).toBe(400);
    const invalidMappingValuePayload = await invalidMappingValue.json() as ApiPayload;
    expect(invalidMappingValuePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
