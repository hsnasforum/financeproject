import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as openingBalancesGET, PATCH as openingBalancesPATCH } from "../src/app/api/planning/v3/opening-balances/route";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4400";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

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

function requestPatch(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "PATCH",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/accounts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 opening balances API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-opening-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("validates date format and amount type", async () => {
    const account = await createAccount({
      name: "main",
      kind: "bank",
    });

    const invalidDate = await openingBalancesPATCH(
      requestPatch("/api/planning/v3/opening-balances", {
        csrf: "test",
        accountId: account.id,
        asOfDate: "20260301",
        amountKrw: 1000,
      }),
    );
    expect(invalidDate.status).toBe(400);

    const invalidAmount = await openingBalancesPATCH(
      requestPatch("/api/planning/v3/opening-balances", {
        csrf: "test",
        accountId: account.id,
        asOfDate: "2026-03-01",
        amountKrw: "1000.5",
      }),
    );
    expect(invalidAmount.status).toBe(400);
  });

  it("stores and reads opening balances", async () => {
    const account = await createAccount({
      name: "main",
      kind: "bank",
    });

    const patch = await openingBalancesPATCH(
      requestPatch("/api/planning/v3/opening-balances", {
        csrf: "test",
        accountId: account.id,
        asOfDate: "2026-03-01",
        amountKrw: -5000,
      }),
    );
    expect(patch.status).toBe(200);

    const get = await openingBalancesGET(
      requestGet("/api/planning/v3/opening-balances?csrf=test"),
    );
    expect(get.status).toBe(200);
    const payload = await get.json() as {
      ok?: boolean;
      data?: Record<string, { amountKrw?: number; asOfDate?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.[account.id]?.asOfDate).toBe("2026-03-01");
    expect(payload.data?.[account.id]?.amountKrw).toBe(-5000);
  });
});
