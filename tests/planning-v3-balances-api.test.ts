import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as monthlyBalancesGET } from "../src/app/api/planning/v3/balances/monthly/route";
import {
  GET as startingBalanceGET,
  PATCH as startingBalancePATCH,
} from "../src/app/api/planning/v3/accounts/[id]/starting-balance/route";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4400";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

describe("planning v3 balances APIs", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-balances-api-"));
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

  it("patches and reads account starting balance", async () => {
    const created = await createAccount({
      name: "Main",
      kind: "checking",
    });
    const context: RouteContext = {
      params: Promise.resolve({ id: created.id }),
    };

    const patch = await startingBalancePATCH(
      requestPatch(`/api/planning/v3/accounts/${created.id}/starting-balance`, {
        csrf: "test",
        startingBalanceKrw: -30000,
      }),
      context,
    );
    expect(patch.status).toBe(200);

    const get = await startingBalanceGET(
      requestGet(`/api/planning/v3/accounts/${created.id}/starting-balance?csrf=test`),
      context,
    );
    expect(get.status).toBe(200);
    const payload = await get.json() as {
      ok?: boolean;
      hasStartingBalance?: boolean;
      startingBalanceKrw?: number;
    };
    expect(payload.ok).toBe(true);
    expect(payload.hasStartingBalance).toBe(true);
    expect(payload.startingBalanceKrw).toBe(-30000);
  });

  it("returns 400 when batchId is missing", async () => {
    const response = await monthlyBalancesGET(
      requestGet("/api/planning/v3/balances/monthly?csrf=test"),
    );
    expect(response.status).toBe(400);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("computes monthly balances for selected batch id", async () => {
    const accountWithStart = await createAccount({
      name: "A",
      kind: "checking",
      startingBalanceKrw: 1000,
    });

    const csvText = [
      "date,amount,description",
      "2026-03-01,100,급여",
      "2026-03-02,-50,식비",
      "2026-04-03,25,기타",
    ].join("\n");

    const batch = await appendBatchFromCsv({
      csvText,
      accountId: accountWithStart.id,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    });

    const response = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(batch.batch.id)}&includeTransfers=0&csrf=test`),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ ym?: string; accountId?: string; closingKrw?: number }>;
      warnings?: string[];
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data?.map((row) => row.ym)).toEqual(["2026-03", "2026-04"]);
    expect(payload.data?.[0]?.accountId).toBe(accountWithStart.id);
    expect(payload.data?.[0]?.closingKrw).toBe(1050);
    expect(payload.data?.[1]?.closingKrw).toBe(1075);
    expect(Array.isArray(payload.warnings)).toBe(true);
  });
});
