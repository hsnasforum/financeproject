import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as batchAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";
import { POST as mergeBatchesPOST } from "../src/app/api/planning/v3/transactions/batches/merge/route";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
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
  error?: { code?: string };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function buildJsonRequest(urlPath: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions/batches`,
      "content-type": "application/json",
      "x-planning-user-id": "alice",
    },
    body: JSON.stringify(body),
  });
}

function legacyBatchesPath(root: string): string {
  return path.join(root, "v3", "transactions", "batches.ndjson");
}

async function createLegacyBatchFixture(accountId = "legacy-account") {
  return appendBatchFromCsv({
    csvText: [
      "date,amount,description",
      "2026-01-01,1000,legacy row",
    ].join("\n"),
    accountId,
    fileName: `${accountId}.csv`,
  });
}

describe("planning v3 canonical transaction write owner", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-canonical-writer-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
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

  it("does not update a legacy-only batch from the user account binding route", async () => {
    const legacy = await createLegacyBatchFixture("legacy-only-account");
    const beforeRaw = fs.readFileSync(legacyBatchesPath(root), "utf-8");

    const response = await batchAccountPOST(
      buildJsonRequest(`/api/planning/v3/transactions/batches/${legacy.batch.id}/account`, {
        csrf: "test",
        accountId: "new-account",
      }),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );

    expect(response.status).toBe(404);
    const payload = await response.json() as ApiPayload;
    expect(payload).toMatchObject({ ok: false, error: { code: "NO_DATA" } });
    expect(fs.readFileSync(legacyBatchesPath(root), "utf-8")).toBe(beforeRaw);
    expect((await readBatchTransactions(legacy.batch.id))?.batch.accountId).toBe("legacy-only-account");
  });

  it("classifies same-id stored/legacy account updates as a migration conflict without legacy writes", async () => {
    const legacy = await createLegacyBatchFixture("legacy-conflict-account");
    await saveBatch(
      {
        id: legacy.batch.id,
        createdAt: "2026-01-02T00:00:00.000Z",
        source: "csv",
        rowCount: 1,
        accounts: [{ id: "stored-account" }],
      },
      [{
        txnId: "aaaaaaaaaaaa",
        batchId: legacy.batch.id,
        accountId: "stored-account",
        date: "2026-01-02",
        amountKrw: 2000,
        description: "stored row",
        source: "csv",
      }],
    );
    const beforeRaw = fs.readFileSync(legacyBatchesPath(root), "utf-8");

    const response = await batchAccountPOST(
      buildJsonRequest(`/api/planning/v3/transactions/batches/${legacy.batch.id}/account`, {
        csrf: "test",
        accountId: "new-account",
      }),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );

    expect(response.status).toBe(409);
    const payload = await response.json() as ApiPayload;
    expect(payload).toMatchObject({ ok: false, error: { code: "MIGRATION_CONFLICT" } });
    expect(fs.readFileSync(legacyBatchesPath(root), "utf-8")).toBe(beforeRaw);
    expect((await readBatchTransactions(legacy.batch.id))?.batch.accountId).toBe("legacy-conflict-account");
  });

  it("keeps the legacy merge command disabled for user requests", async () => {
    const from = await createLegacyBatchFixture("from-account");
    const into = await createLegacyBatchFixture("into-account");
    const beforeRaw = fs.readFileSync(legacyBatchesPath(root), "utf-8");

    const response = await mergeBatchesPOST(buildJsonRequest("/api/planning/v3/transactions/batches/merge", {
      csrf: "test",
      fromBatchId: from.batch.id,
      intoBatchId: into.batch.id,
    }));

    expect(response.status).toBe(410);
    const payload = await response.json() as ApiPayload;
    expect(payload).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(fs.readFileSync(legacyBatchesPath(root), "utf-8")).toBe(beforeRaw);
  });
});
