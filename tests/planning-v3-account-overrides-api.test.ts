import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchAccountOverride } from "../src/app/api/planning/v3/transactions/account-overrides/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

const LOCAL_HOST = "localhost:4910";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestPatch(body: unknown, userId = "alice"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/transactions/account-overrides`, {
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

describe("planning v3 account-overrides API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-account-overrides-api-"));
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

  it("stores account mapping overrides in the authenticated user's namespace", async () => {
    const alice = await patchAccountOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      accountId: "acc-alice",
    }, "alice"));
    expect(alice.status).toBe(200);
    expect(await alice.json()).toMatchObject({
      ok: true,
      override: { accountId: "acc-alice" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const bob = await patchAccountOverride(requestPatch({
      csrf: "test",
      batchId: "batch-a",
      txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      accountId: "acc-bob",
    }, "bob"));
    expect(bob.status).toBe(200);
    expect(await bob.json()).toMatchObject({
      ok: true,
      override: { accountId: "acc-bob" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const aliceStore = JSON.parse(fs.readFileSync(
      path.join(root, "users", "alice", "planning-v3", "txn-account-overrides", "batch-a.json"),
      "utf-8",
    )) as { items?: Record<string, { accountId?: string }> };
    const bobStore = JSON.parse(fs.readFileSync(
      path.join(root, "users", "bob", "planning-v3", "txn-account-overrides", "batch-a.json"),
      "utf-8",
    )) as { items?: Record<string, { accountId?: string }> };

    expect(aliceStore.items?.aaaaaaaaaaaaaaaaaaaaaaaa?.accountId).toBe("acc-alice");
    expect(bobStore.items?.aaaaaaaaaaaaaaaaaaaaaaaa?.accountId).toBe("acc-bob");
  });
});
