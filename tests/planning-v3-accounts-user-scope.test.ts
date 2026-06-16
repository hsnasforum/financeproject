import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as accountDELETE, PATCH as accountPATCH } from "../src/app/api/planning/v3/accounts/[id]/route";
import { GET as accountsGET, POST as accountsPOST } from "../src/app/api/planning/v3/accounts/route";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_V3_ACCOUNTS_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4760";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  deleted?: boolean;
  items?: Array<{ id?: string; name?: string }>;
  account?: { id?: string; name?: string; kind?: string };
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
    referer: `${LOCAL_ORIGIN}/planning/v3/accounts`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function contextFor(id: string): RouteContext {
  return { params: Promise.resolve({ id }) };
}

function buildGetRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildJsonRequest(method: "POST" | "PATCH" | "DELETE", urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function createAccountFixture(userId: string, accountId: string): Promise<string> {
  const response = await accountsPOST(buildJsonRequest("POST", "/api/planning/v3/accounts", {
    csrf: "test",
    accountId,
    name: `${userId} main`,
    kind: "checking",
  }, userId));
  expect(response.status).toBe(201);
  const payload = await response.json() as ApiPayload;
  expect(payload.account?.id).toBe(accountId);
  return accountId;
}

function hasAccountId(rows: Array<{ id?: string }> | undefined, accountId: string): boolean {
  return (rows ?? []).some((row) => row.id === accountId);
}

describe("planning v3 accounts API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-accounts-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_V3_ACCOUNTS_PATH;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's accounts through list, update, or delete", async () => {
    const aliceAccountId = await createAccountFixture("alice", "alice-account");
    const bobAccountId = await createAccountFixture("bob", "bob-account");

    const aliceList = await accountsGET(buildGetRequest("/api/planning/v3/accounts?csrf=test", "alice"));
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(hasAccountId(aliceListPayload.items, aliceAccountId)).toBe(true);
    expect(hasAccountId(aliceListPayload.items, bobAccountId)).toBe(false);

    const bobList = await accountsGET(buildGetRequest("/api/planning/v3/accounts?csrf=test", "bob"));
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(hasAccountId(bobListPayload.items, bobAccountId)).toBe(true);
    expect(hasAccountId(bobListPayload.items, aliceAccountId)).toBe(false);

    const bobUpdatesAlice = await accountPATCH(
      buildJsonRequest("PATCH", `/api/planning/v3/accounts/${aliceAccountId}`, {
        csrf: "test",
        name: "Bob cannot update Alice",
      }, "bob"),
      contextFor(aliceAccountId),
    );
    expect(bobUpdatesAlice.status).toBe(404);
    const bobUpdatesAlicePayload = await bobUpdatesAlice.json() as ApiPayload;
    expect(bobUpdatesAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobDeletesAlice = await accountDELETE(
      buildJsonRequest("DELETE", `/api/planning/v3/accounts/${aliceAccountId}`, { csrf: "test" }, "bob"),
      contextFor(aliceAccountId),
    );
    expect(bobDeletesAlice.status).toBe(404);
    const bobDeletesAlicePayload = await bobDeletesAlice.json() as ApiPayload;
    expect(bobDeletesAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const aliceAfterBob = await accountsGET(buildGetRequest("/api/planning/v3/accounts?csrf=test", "alice"));
    expect(aliceAfterBob.status).toBe(200);
    const aliceAfterBobPayload = await aliceAfterBob.json() as ApiPayload;
    expect(hasAccountId(aliceAfterBobPayload.items, aliceAccountId)).toBe(true);
  });

  it("returns authenticated meta for account input errors", async () => {
    const invalidCreate = await accountsPOST(buildJsonRequest("POST", "/api/planning/v3/accounts", {
      csrf: "test",
      kind: "checking",
    }, "bob"));
    expect(invalidCreate.status).toBe(400);
    const invalidCreatePayload = await invalidCreate.json() as ApiPayload;
    expect(invalidCreatePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidPatch = await accountPATCH(
      buildJsonRequest("PATCH", "/api/planning/v3/accounts/%2Fbad", {
        csrf: "test",
        name: "bad",
      }, "bob"),
      contextFor("/bad"),
    );
    expect(invalidPatch.status).toBe(400);
    const invalidPatchPayload = await invalidPatch.json() as ApiPayload;
    expect(invalidPatchPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidDelete = await accountDELETE(
      buildJsonRequest("DELETE", "/api/planning/v3/accounts/%2Fbad", { csrf: "test" }, "bob"),
      contextFor("/bad"),
    );
    expect(invalidDelete.status).toBe(400);
    const invalidDeletePayload = await invalidDelete.json() as ApiPayload;
    expect(invalidDeletePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
