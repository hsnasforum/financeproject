import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as openingBalancesGET, PATCH as openingBalancesPATCH } from "../src/app/api/planning/v3/opening-balances/route";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_V3_OPENING_BALANCES_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4740";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  data?: Record<string, { accountId?: string; asOfDate?: string; amountKrw?: number }>;
  openingBalance?: { accountId?: string; asOfDate?: string; amountKrw?: number };
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
    referer: `${LOCAL_ORIGIN}/planning/v3/accounts`,
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

function buildPatchRequest(urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "PATCH",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function patchOpeningBalance(userId: string, amountKrw: number): Promise<void> {
  const response = await openingBalancesPATCH(buildPatchRequest("/api/planning/v3/opening-balances", {
    csrf: "test",
    accountId: "acc-main",
    asOfDate: "2026-03-01",
    amountKrw,
  }, userId));
  expect(response.status).toBe(200);
  const payload = await response.json() as ApiPayload;
  expect(payload.openingBalance).toMatchObject({
    accountId: "acc-main",
    asOfDate: "2026-03-01",
    amountKrw,
  });
}

describe("planning v3 opening balances API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-opening-balances-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_V3_OPENING_BALANCES_PATH;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("isolates opening balances by authenticated planning user", async () => {
    await patchOpeningBalance("alice", 1000);
    await patchOpeningBalance("bob", 2000);

    const aliceGet = await openingBalancesGET(buildGetRequest("/api/planning/v3/opening-balances?csrf=test", "alice"));
    expect(aliceGet.status).toBe(200);
    const alicePayload = await aliceGet.json() as ApiPayload;
    expect(alicePayload.ok).toBe(true);
    expect(alicePayload.data?.["acc-main"]?.amountKrw).toBe(1000);

    const bobGet = await openingBalancesGET(buildGetRequest("/api/planning/v3/opening-balances?csrf=test", "bob"));
    expect(bobGet.status).toBe(200);
    const bobPayload = await bobGet.json() as ApiPayload;
    expect(bobPayload.ok).toBe(true);
    expect(bobPayload.data?.["acc-main"]?.amountKrw).toBe(2000);
  });

  it("returns authenticated meta for opening balance input errors", async () => {
    const missingAccount = await openingBalancesPATCH(buildPatchRequest("/api/planning/v3/opening-balances", {
      csrf: "test",
      asOfDate: "2026-03-01",
      amountKrw: 1000,
    }, "bob"));
    expect(missingAccount.status).toBe(400);
    const missingAccountPayload = await missingAccount.json() as ApiPayload;
    expect(missingAccountPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidDate = await openingBalancesPATCH(buildPatchRequest("/api/planning/v3/opening-balances", {
      csrf: "test",
      accountId: "acc-main",
      asOfDate: "20260301",
      amountKrw: 1000,
    }, "bob"));
    expect(invalidDate.status).toBe(400);
    const invalidDatePayload = await invalidDate.json() as ApiPayload;
    expect(invalidDatePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidAmount = await openingBalancesPATCH(buildPatchRequest("/api/planning/v3/opening-balances", {
      csrf: "test",
      accountId: "acc-main",
      asOfDate: "2026-03-01",
      amountKrw: "1000.5",
    }, "bob"));
    expect(invalidAmount.status).toBe(400);
    const invalidAmountPayload = await invalidAmount.json() as ApiPayload;
    expect(invalidAmountPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
