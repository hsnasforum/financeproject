import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET as startingBalanceGET,
  PATCH as startingBalancePATCH,
} from "../src/app/api/planning/v3/accounts/[id]/starting-balance/route";
import { upsertAccount } from "../src/lib/planning/v3/store/accountsStore";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";

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

const LOCAL_HOST = "localhost:4750";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const ACCOUNT_ID = "acc-main";

type ApiPayload = {
  ok?: boolean;
  accountId?: string;
  hasStartingBalance?: boolean;
  startingBalanceKrw?: number;
  account?: { id?: string; startingBalanceKrw?: number };
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

function buildPatchRequest(urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "PATCH",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function createAccountFixture(userId: string): Promise<void> {
  await runWithPlanningUserScope({ userId }, async () => {
    await upsertAccount({
      accountId: ACCOUNT_ID,
      name: `${userId} main`,
      kind: "checking",
    });
  });
}

async function patchStartingBalance(userId: string, amountKrw: number): Promise<void> {
  const response = await startingBalancePATCH(
    buildPatchRequest(`/api/planning/v3/accounts/${ACCOUNT_ID}/starting-balance`, {
      csrf: "test",
      startingBalanceKrw: amountKrw,
    }, userId),
    contextFor(ACCOUNT_ID),
  );
  expect(response.status).toBe(200);
  const payload = await response.json() as ApiPayload;
  expect(payload.account).toMatchObject({
    id: ACCOUNT_ID,
    startingBalanceKrw: amountKrw,
  });
}

describe("planning v3 account starting balance API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-starting-balance-user-scope-"));
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

  it("isolates starting balances by authenticated planning user", async () => {
    await createAccountFixture("alice");
    await createAccountFixture("bob");

    await patchStartingBalance("alice", 1000);
    await patchStartingBalance("bob", 2000);

    const aliceGet = await startingBalanceGET(
      buildGetRequest(`/api/planning/v3/accounts/${ACCOUNT_ID}/starting-balance?csrf=test`, "alice"),
      contextFor(ACCOUNT_ID),
    );
    expect(aliceGet.status).toBe(200);
    const alicePayload = await aliceGet.json() as ApiPayload;
    expect(alicePayload).toMatchObject({
      ok: true,
      accountId: ACCOUNT_ID,
      hasStartingBalance: true,
      startingBalanceKrw: 1000,
    });

    const bobGet = await startingBalanceGET(
      buildGetRequest(`/api/planning/v3/accounts/${ACCOUNT_ID}/starting-balance?csrf=test`, "bob"),
      contextFor(ACCOUNT_ID),
    );
    expect(bobGet.status).toBe(200);
    const bobPayload = await bobGet.json() as ApiPayload;
    expect(bobPayload).toMatchObject({
      ok: true,
      accountId: ACCOUNT_ID,
      hasStartingBalance: true,
      startingBalanceKrw: 2000,
    });
  });

  it("returns authenticated meta for starting balance errors", async () => {
    await createAccountFixture("bob");

    const missingAccount = await startingBalanceGET(
      buildGetRequest("/api/planning/v3/accounts/missing-account/starting-balance?csrf=test", "bob"),
      contextFor("missing-account"),
    );
    expect(missingAccount.status).toBe(404);
    const missingAccountPayload = await missingAccount.json() as ApiPayload;
    expect(missingAccountPayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const missingValue = await startingBalancePATCH(
      buildPatchRequest(`/api/planning/v3/accounts/${ACCOUNT_ID}/starting-balance`, { csrf: "test" }, "bob"),
      contextFor(ACCOUNT_ID),
    );
    expect(missingValue.status).toBe(400);
    const missingValuePayload = await missingValue.json() as ApiPayload;
    expect(missingValuePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidValue = await startingBalancePATCH(
      buildPatchRequest(`/api/planning/v3/accounts/${ACCOUNT_ID}/starting-balance`, {
        csrf: "test",
        startingBalanceKrw: "1000.5",
      }, "bob"),
      contextFor(ACCOUNT_ID),
    );
    expect(invalidValue.status).toBe(400);
    const invalidValuePayload = await invalidValue.json() as ApiPayload;
    expect(invalidValuePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidId = await startingBalanceGET(
      buildGetRequest("/api/planning/v3/accounts/%2Fbad/starting-balance?csrf=test", "bob"),
      contextFor("/bad"),
    );
    expect(invalidId.status).toBe(400);
    const invalidIdPayload = await invalidId.json() as ApiPayload;
    expect(invalidIdPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
