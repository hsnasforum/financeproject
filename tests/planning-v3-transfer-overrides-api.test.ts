import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchTransferOverride } from "../src/app/api/planning/v3/transactions/transfer-overrides/route";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

const LOCAL_HOST = "localhost:4900";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestPatch(body: unknown, userId = "alice"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/transactions/transfer-overrides`, {
    method: "PATCH",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
      "content-type": "application/json",
      "x-planning-user-id": userId,
    },
    body: JSON.stringify(body),
  });
}

async function saveBatchFixture(userId: string): Promise<void> {
  await runWithPlanningUserScope({ userId, authSource: "test" }, () => saveBatch({
    id: "batch-a",
    createdAt: "2026-08-25T00:00:00.000Z",
    source: "csv",
    rowCount: 1,
  }, [{
    batchId: "batch-a",
    txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    date: "2026-08-25",
    amountKrw: -1000,
    description: "fixture",
    source: "csv",
  }]));
}

describe("planning v3 transfer-overrides API", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-transfer-overrides-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    await saveBatchFixture("alice");
    await saveBatchFixture("bob");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;
    if (typeof originalPlanningAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalPlanningTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 when forceTransfer and forceNonTransfer are both true", async () => {
    const response = await patchTransferOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      forceTransfer: true,
      forceNonTransfer: true,
    }));
    expect(response.status).toBe(400);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("returns 404 instead of creating a transfer override for a missing batch", async () => {
    const response = await patchTransferOverride(requestPatch({
      csrf: "test",
      batchId: "missing-batch",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      forceTransfer: true,
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });
  });

  it("stores override on valid request", async () => {
    const response = await patchTransferOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      forceTransfer: true,
      note: "manual-confirm",
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      override?: { forceTransfer?: boolean; txnId?: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.override?.txnId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(payload.override?.forceTransfer).toBe(true);
  });

  it("stores transfer overrides in the authenticated user's namespace", async () => {
    const alice = await patchTransferOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      forceTransfer: true,
      note: "alice-only",
    }, "alice"));
    expect(alice.status).toBe(200);
    expect(await alice.json()).toMatchObject({
      ok: true,
      override: { forceTransfer: true, note: "alice-only" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const bob = await patchTransferOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      forceNonTransfer: true,
      note: "bob-only",
    }, "bob"));
    expect(bob.status).toBe(200);
    expect(await bob.json()).toMatchObject({
      ok: true,
      override: { forceNonTransfer: true, note: "bob-only" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const aliceStore = JSON.parse(fs.readFileSync(
      path.join(root, "users", "alice", "planning-v3", "txn-transfer-overrides", "batch-a.json"),
      "utf-8",
    )) as { items?: Record<string, { forceTransfer?: boolean; forceNonTransfer?: boolean; note?: string }> };
    const bobStore = JSON.parse(fs.readFileSync(
      path.join(root, "users", "bob", "planning-v3", "txn-transfer-overrides", "batch-a.json"),
      "utf-8",
    )) as { items?: Record<string, { forceTransfer?: boolean; forceNonTransfer?: boolean; note?: string }> };

    expect(aliceStore.items?.aaaaaaaaaaaaaaaaaaaaaaaa).toMatchObject({
      forceTransfer: true,
      note: "alice-only",
    });
    expect(bobStore.items?.aaaaaaaaaaaaaaaaaaaaaaaa).toMatchObject({
      forceNonTransfer: true,
      note: "bob-only",
    });
  });
});
