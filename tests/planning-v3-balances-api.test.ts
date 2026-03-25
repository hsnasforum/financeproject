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
import { readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

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

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
  omitRowAccountId?: boolean;
  rows: Array<{
    txnId: string;
    date: string;
    amountKrw: number;
    description: string;
  }>;
}) {
  await saveBatch({
    id: input.batchId,
    createdAt: input.createdAt,
    source: "csv",
    rowCount: input.rows.length,
    accounts: [{ id: input.accountId }],
  }, input.rows.map((row) => ({
    ...row,
    batchId: input.batchId,
    ...(input.omitRowAccountId ? {} : { accountId: input.accountId }),
    source: "csv" as const,
  })));
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

  it("ignores legacy unscoped override and only applies batch-scoped override in balances projection", async () => {
    const accountWithStart = await createAccount({
      name: "A",
      kind: "checking",
      startingBalanceKrw: 1000,
    });

    const batch = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,-50,식비",
      ].join("\n"),
      accountId: accountWithStart.id,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    });
    const loaded = await readBatchTransactions(batch.batch.id);
    const txnId = String(loaded?.transactions?.[0]?.txnId ?? "");
    expect(txnId).not.toBe("");

    await upsertOverride(txnId, { kind: "transfer" });
    const legacyIgnored = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(batch.batch.id)}&includeTransfers=0&csrf=test`),
    );
    expect(legacyIgnored.status).toBe(200);
    const legacyPayload = await legacyIgnored.json() as {
      data?: Array<{ closingKrw?: number }>;
    };
    expect(legacyPayload.data?.[0]?.closingKrw).toBe(950);

    await upsertOverride({
      batchId: batch.batch.id,
      txnId,
      kind: "transfer",
    });
    const scopedApplied = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(batch.batch.id)}&includeTransfers=0&csrf=test`),
    );
    expect(scopedApplied.status).toBe(200);
    const scopedPayload = await scopedApplied.json() as {
      data?: Array<{ closingKrw?: number }>;
    };
    expect(scopedPayload.data ?? []).toHaveLength(0);
  });

  it("prefers stored batch rows when stored and legacy data coexist for same batch id", async () => {
    const accountWithStart = await createAccount({
      name: "Stored First",
      kind: "checking",
      startingBalanceKrw: 1000,
    });

    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,-50,식비",
      ].join("\n"),
      accountId: accountWithStart.id,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: accountWithStart.id,
      createdAt: "2026-03-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 100, description: "stored bonus" },
      ],
    });

    const response = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(legacy.batch.id)}&includeTransfers=0&csrf=test`),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      data?: Array<{ ym?: string; closingKrw?: number }>;
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        ym: "2026-03",
        closingKrw: 1100,
      }),
    ]);
  });

  it("applies stored batch account binding when stored rows omit accountId", async () => {
    const accountWithStart = await createAccount({
      name: "Stored Binding",
      kind: "checking",
      startingBalanceKrw: 1000,
    });

    await saveStoredShadowBatch({
      batchId: "storedbinding0001",
      accountId: accountWithStart.id,
      createdAt: "2026-04-05T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "1111111111111111", date: "2026-04-01", amountKrw: 100, description: "stored bonus" },
      ],
    });

    const response = await monthlyBalancesGET(
      requestGet("/api/planning/v3/balances/monthly?batchId=storedbinding0001&includeTransfers=0&csrf=test"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      data?: Array<{ ym?: string; accountId?: string; closingKrw?: number }>;
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        ym: "2026-04",
        accountId: accountWithStart.id,
        closingKrw: 1100,
      }),
    ]);
  });

  it("keeps same-id coexistence balances on the stored-first visible account binding", async () => {
    const legacyAccount = await createAccount({
      name: "Legacy Binding",
      kind: "checking",
      startingBalanceKrw: 1000,
    });
    const storedAccount = await createAccount({
      name: "Stored Binding",
      kind: "checking",
      startingBalanceKrw: 5000,
    });

    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-05-01,-50,legacy spend",
      ].join("\n"),
      accountId: legacyAccount.id,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: storedAccount.id,
      createdAt: "2026-05-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-05-01", amountKrw: 100, description: "stored bonus" },
      ],
    });

    const response = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(legacy.batch.id)}&includeTransfers=0&csrf=test`),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      data?: Array<{ ym?: string; accountId?: string; closingKrw?: number }>;
      warnings?: string[];
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        ym: "2026-05",
        accountId: storedAccount.id,
        closingKrw: 5100,
      }),
    ]);
    expect(payload.warnings?.some((row) => row.includes("accountId가 없는 거래"))).toBe(false);
  });
});
