import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as batchDetailGET } from "../src/app/api/planning/v3/transactions/batches/[id]/route";
import { GET as cashflowGET } from "../src/app/api/planning/v3/transactions/batches/[id]/cashflow/route";
import { POST as bindAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import {
  upsertBatchTxnOverride,
  upsertLegacyUnscopedTxnOverride,
} from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4300";
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
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
    },
  });
}

function requestPost(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/transactions`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
  attachRowAccountId?: boolean;
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
    ...((input.attachRowAccountId ?? true) ? { accountId: input.accountId } : {}),
    source: "csv" as const,
  })));
}

describe("planning v3 batch cashflow account guard", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-account-guard-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "batch-legacy",
      createdAt: "2026-03-03T00:00:00.000Z",
      kind: "csv",
      fileName: "legacy.csv",
      total: 2,
      ok: 2,
      failed: 0,
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "t-legacy-1",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        batchId: "batch-legacy",
        createdAt: "2026-03-03T00:00:00.000Z",
        date: "2026-03-01",
        amountKrw: 2000000,
        description: "salary",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "t-legacy-2",
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        batchId: "batch-legacy",
        createdAt: "2026-03-03T00:00:00.000Z",
        date: "2026-03-03",
        amountKrw: -200000,
        description: "unknown spend",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n"));
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks cashflow until accountId is attached to batch", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-legacy" }),
    };

    const first = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(first.status).toBe(400);

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-legacy/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);

    const second = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(second.status).toBe(200);
    const payload = await second.json() as {
      ok?: boolean;
      monthly?: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.monthly)).toBe(true);
  });

  it("ignores legacy unscoped overrides and only applies batch-scoped override in cashflow projection", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-legacy" }),
    };
    const expenseTxnId = "bbbbbbbbbbbbbbbbbbbbbbbb";

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-legacy/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);

    await upsertLegacyUnscopedTxnOverride(expenseTxnId, { category: "fixed" });
    const legacyIgnored = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(legacyIgnored.status).toBe(200);
    const legacyPayload = await legacyIgnored.json() as {
      profilePatch?: { monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };
    expect(legacyPayload.profilePatch?.monthlyEssentialExpenses).toBe(0);
    expect(legacyPayload.profilePatch?.monthlyDiscretionaryExpenses).toBe(200000);

    await upsertBatchTxnOverride({
      batchId: "batch-legacy",
      txnId: expenseTxnId,
      categoryId: "housing",
    });
    const scopedApplied = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(scopedApplied.status).toBe(200);
    const scopedPayload = await scopedApplied.json() as {
      profilePatch?: { monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };
    expect(scopedPayload.profilePatch?.monthlyEssentialExpenses).toBe(200000);
    expect(scopedPayload.profilePatch?.monthlyDiscretionaryExpenses).toBe(0);
  });

  it("prefers stored snapshot rows and stored account binding when stored and legacy batches share the same id", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-legacy" }),
    };

    await saveStoredShadowBatch({
      batchId: "batch-legacy",
      accountId: "acc-stored",
      createdAt: "2026-03-10T00:00:00.000Z",
      rows: [
        { txnId: "cccccccccccccccc", date: "2026-03-05", amountKrw: 4000000, description: "salary" },
        { txnId: "dddddddddddddddd", date: "2026-03-06", amountKrw: -1000000, description: "rent" },
      ],
    });

    const response = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      monthly?: Array<{ month?: string; incomeKrw?: number; expenseKrw?: number }>;
      profilePatch?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };
    expect(payload.monthly).toHaveLength(1);
    expect(payload.monthly?.[0]?.month).toBe("2026-03");
    expect(payload.monthly?.[0]?.incomeKrw).toBe(4000000);
    expect(payload.monthly?.[0]?.expenseKrw).toBe(-1000000);
    expect(payload.profilePatch?.monthlyIncomeNet).toBe(4000000);
  });

  it("updates same-id coexistence through route-local success branch and keeps cashflow/detail stored-first", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-legacy" }),
    };

    await saveStoredShadowBatch({
      batchId: "batch-legacy",
      accountId: "acc-stored",
      createdAt: "2026-03-10T00:00:00.000Z",
      attachRowAccountId: false,
      rows: [
        { txnId: "cccccccccccccccc", date: "2026-03-05", amountKrw: 500000, description: "salary" },
        { txnId: "dddddddddddddddd", date: "2026-03-05", amountKrw: -500000, description: "same-account paired expense" },
      ],
    });

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-legacy/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);
    const bindPayload = await bind.json() as {
      ok?: boolean;
      batch?: {
        id?: string;
        createdAt?: string;
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      updatedTransactionCount?: number;
    };
    expect(bindPayload.ok).toBe(true);
    expect(bindPayload.batch).toEqual({
      id: "batch-legacy",
      createdAt: "2026-03-10T00:00:00.000Z",
      kind: "csv",
      total: 2,
      ok: 2,
      failed: 0,
      accountId: "acc-main",
      accountHint: "acc-main",
    });
    expect(bindPayload.updatedTransactionCount).toBe(2);

    const response = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy/cashflow?csrf=test"),
      context,
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      monthly?: Array<{ month?: string; incomeKrw?: number; expenseKrw?: number; transferNetKrw?: number }>;
      profilePatch?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };
    expect(payload.monthly).toHaveLength(1);
    expect(payload.monthly?.[0]?.month).toBe("2026-03");
    expect(payload.monthly?.[0]?.incomeKrw).toBe(500000);
    expect(payload.monthly?.[0]?.expenseKrw).toBe(-500000);
    expect(payload.monthly?.[0]?.transferNetKrw).toBe(0);
    expect(payload.profilePatch?.monthlyIncomeNet).toBe(500000);
    expect(payload.profilePatch?.monthlyDiscretionaryExpenses).toBe(500000);

    const detail = await batchDetailGET(
      requestGet("/api/planning/v3/transactions/batches/batch-legacy?csrf=test"),
      context,
    );
    expect(detail.status).toBe(200);
    const detailPayload = await detail.json() as {
      batch?: { accountId?: string; accountHint?: string };
      transactions?: Array<{ accountId?: string }>;
    };
    expect(detailPayload.batch?.accountId).toBe("acc-main");
    expect(detailPayload.batch?.accountHint).toBe("acc-main");
    expect(detailPayload.transactions?.every((row) => row.accountId === "acc-main")).toBe(true);
  });

  it("keeps same-id coexistence success when visible binding matches even if legacy updated count is zero", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-zero-count" }),
    };

    const txDir = path.join(root, "v3", "transactions");
    fs.appendFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "batch-zero-count",
      createdAt: "2026-03-08T00:00:00.000Z",
      kind: "csv",
      fileName: "zero-count.csv",
      total: 2,
      ok: 2,
      failed: 0,
      accountId: "acc-main",
      accountHint: "acc-main",
    })}\n`);
    fs.appendFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "t-zero-1",
        txnId: "eeeeeeeeeeeeeeeeeeeeeeee",
        batchId: "batch-zero-count",
        createdAt: "2026-03-08T00:00:00.000Z",
        date: "2026-03-07",
        amountKrw: 700000,
        accountId: "acc-main",
        description: "salary",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "t-zero-2",
        txnId: "ffffffffffffffffffffffff",
        batchId: "batch-zero-count",
        createdAt: "2026-03-08T00:00:00.000Z",
        date: "2026-03-07",
        amountKrw: -700000,
        accountId: "acc-main",
        description: "same-account pair",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    await saveStoredShadowBatch({
      batchId: "batch-zero-count",
      accountId: "acc-stored-before",
      createdAt: "2026-03-10T00:00:00.000Z",
      attachRowAccountId: false,
      rows: [
        { txnId: "1111111111111111", date: "2026-03-07", amountKrw: 700000, description: "salary" },
        { txnId: "2222222222222222", date: "2026-03-07", amountKrw: -700000, description: "same-account pair" },
      ],
    });

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-zero-count/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);
    const bindPayload = await bind.json() as {
      ok?: boolean;
      batch?: { accountId?: string; accountHint?: string };
      updatedTransactionCount?: number;
    };
    expect(bindPayload.ok).toBe(true);
    expect(bindPayload.batch?.accountId).toBe("acc-main");
    expect(bindPayload.batch?.accountHint).toBe("acc-main");
    expect(bindPayload.updatedTransactionCount).toBe(0);

    const detail = await batchDetailGET(
      requestGet("/api/planning/v3/transactions/batches/batch-zero-count?csrf=test"),
      context,
    );
    expect(detail.status).toBe(200);
    const detailPayload = await detail.json() as {
      batch?: { accountId?: string; accountHint?: string };
      transactions?: Array<{ accountId?: string }>;
    };
    expect(detailPayload.batch?.accountId).toBe("acc-main");
    expect(detailPayload.batch?.accountHint).toBe("acc-main");
    expect(detailPayload.transactions?.every((row) => row.accountId === "acc-main")).toBe(true);
  });

  it("updates account binding through stored meta writer when only stored metadata exists", async () => {
    const context: RouteContext = {
      params: Promise.resolve({ id: "batch-stored-only" }),
    };

    await saveStoredShadowBatch({
      batchId: "batch-stored-only",
      accountId: "acc-stored",
      createdAt: "2026-03-12T00:00:00.000Z",
      attachRowAccountId: false,
      rows: [
        { txnId: "eeeeeeeeeeeeeeee", date: "2026-03-07", amountKrw: 500000, description: "salary" },
        { txnId: "ffffffffffffffff", date: "2026-03-07", amountKrw: -500000, description: "same-account transfer-like pair" },
      ],
    });

    const bind = await bindAccountPOST(
      requestPost("/api/planning/v3/transactions/batches/batch-stored-only/account", {
        accountId: "acc-main",
      }),
      context,
    );
    expect(bind.status).toBe(200);
    const bindPayload = await bind.json() as {
      ok?: boolean;
      batch?: { accountId?: string; accountHint?: string };
      updatedTransactionCount?: number;
    };
    expect(bindPayload.ok).toBe(true);
    expect(bindPayload.batch?.accountId).toBe("acc-main");
    expect(bindPayload.batch?.accountHint).toBe("acc-main");
    expect(bindPayload.updatedTransactionCount).toBe(0);

    const cashflow = await cashflowGET(
      requestGet("/api/planning/v3/transactions/batches/batch-stored-only/cashflow?csrf=test"),
      context,
    );
    expect(cashflow.status).toBe(200);
    const cashflowPayload = await cashflow.json() as {
      monthly?: Array<{ month?: string; incomeKrw?: number; expenseKrw?: number; transferNetKrw?: number }>;
      profilePatch?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };
    expect(cashflowPayload.monthly).toHaveLength(1);
    expect(cashflowPayload.monthly?.[0]?.month).toBe("2026-03");
    expect(cashflowPayload.monthly?.[0]?.incomeKrw).toBe(500000);
    expect(cashflowPayload.monthly?.[0]?.expenseKrw).toBe(-500000);
    expect(cashflowPayload.monthly?.[0]?.transferNetKrw).toBe(0);
    expect(cashflowPayload.profilePatch?.monthlyIncomeNet).toBe(500000);
    expect(cashflowPayload.profilePatch?.monthlyDiscretionaryExpenses).toBe(500000);

    const detail = await batchDetailGET(
      requestGet("/api/planning/v3/transactions/batches/batch-stored-only?csrf=test"),
      context,
    );
    expect(detail.status).toBe(200);
    const detailPayload = await detail.json() as {
      batch?: { accountId?: string; accountHint?: string };
      meta?: { accounts?: Array<{ id?: string }> };
      transactions?: Array<{ accountId?: string }>;
    };
    expect(detailPayload.batch?.accountId).toBe("acc-main");
    expect(detailPayload.batch?.accountHint).toBe("acc-main");
    expect(detailPayload.meta?.accounts?.[0]?.id).toBe("acc-main");
    expect(detailPayload.transactions?.[0]?.accountId).toBe("acc-main");
  });
});
