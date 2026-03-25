import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as categorizedGET } from "../src/app/api/planning/v3/transactions/batches/[id]/categorized/route";
import { readBatchTransactions, appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4800";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

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

describe("planning v3 categorized batch API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-categorized-api-"));
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

  it("returns categorized rows + monthly breakdown and keeps detailed category ids", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,3200000,salary",
        "2026-03-02,-1200000,rent fee",
        "2026-03-03,-7000,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "categorized.csv",
      accountId: "acc-main",
    });

    const batchId = created.batch.id;
    const batchRows = await readBatchTransactions(batchId);
    expect(batchRows).not.toBeNull();
    const targetTxn = (batchRows?.transactions ?? []).find((row) => (
      row.date === "2026-03-03" && Math.round(row.amountKrw) === -7000
    ));
    expect(targetTxn?.txnId).toBeTruthy();
    await upsertOverride({
      batchId,
      txnId: String(targetTxn?.txnId),
      categoryId: "housing",
    });

    const response = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/categorized?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text.includes("date,amount,description")).toBe(false);
    expect(text.includes("\"csvText\"")).toBe(false);

    const payload = JSON.parse(text) as {
      ok?: boolean;
      data?: Array<{ txnId?: string; categoryId?: string; categorySource?: string }>;
      breakdown?: Array<{ ym?: string; byCategory?: Record<string, number> }>;
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(Array.isArray(payload.breakdown)).toBe(true);
    expect((payload.breakdown ?? []).length).toBeGreaterThanOrEqual(1);
    expect((payload.breakdown ?? [])[0]?.ym).toBe("2026-03");

    const overridden = (payload.data ?? []).find((row) => row.txnId === targetTxn?.txnId);
    expect(overridden?.categoryId).toBe("housing");
    expect(overridden?.categorySource).toBe("override");
    expect(((payload.breakdown ?? [])[0]?.byCategory ?? {}).housing).toBeGreaterThanOrEqual(7000);
    expect(((payload.breakdown ?? [])[0]?.byCategory ?? {}).unknown ?? 0).toBe(0);
  });

  it("ignores legacy unscoped override and only applies batch-scoped override", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,3200000,salary",
        "2026-03-03,-7000,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "categorized-legacy-ignore.csv",
      accountId: "acc-main",
    });

    const batchId = created.batch.id;
    const batchRows = await readBatchTransactions(batchId);
    const targetTxn = (batchRows?.transactions ?? []).find((row) => (
      row.date === "2026-03-03" && Math.round(row.amountKrw) === -7000
    ));
    expect(targetTxn?.txnId).toBeTruthy();

    await upsertOverride(String(targetTxn?.txnId), { category: "health" });
    const legacyIgnored = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/categorized?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(legacyIgnored.status).toBe(200);
    const legacyPayload = await legacyIgnored.json() as {
      data?: Array<{ txnId?: string; categoryId?: string; categorySource?: string }>;
    };
    const legacyRow = (legacyPayload.data ?? []).find((row) => row.txnId === targetTxn?.txnId);
    expect(legacyRow?.categoryId).not.toBe("health");
    expect(legacyRow?.categorySource).not.toBe("override");

    await upsertOverride({
      batchId,
      txnId: String(targetTxn?.txnId),
      categoryId: "health",
    });
    const scopedApplied = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/categorized?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(scopedApplied.status).toBe(200);
    const scopedPayload = await scopedApplied.json() as {
      data?: Array<{ txnId?: string; categoryId?: string; categorySource?: string }>;
    };
    const scopedRow = (scopedPayload.data ?? []).find((row) => row.txnId === targetTxn?.txnId);
    expect(scopedRow?.categoryId).toBe("health");
    expect(scopedRow?.categorySource).toBe("override");
  });

  it("prefers stored snapshot when stored and legacy batch rows share the same id", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,-15000,lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "categorized-stored-first.csv",
      accountId: "acc-main",
    });

    await saveStoredShadowBatch({
      batchId: created.batch.id,
      accountId: "acc-main",
      createdAt: "2026-04-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-04-05", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(created.batch.id)}/categorized?csrf=test`),
      { params: Promise.resolve({ id: created.batch.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      meta?: { id?: string; rowCount?: number };
      data?: Array<{ amountKrw?: number; description?: string; batchId?: string }>;
    };
    expect(payload.meta?.id).toBe(created.batch.id);
    expect(payload.meta?.rowCount).toBe(1);
    expect(payload.data).toHaveLength(1);
    expect(payload.data?.[0]?.batchId).toBe(created.batch.id);
    expect(payload.data?.[0]?.amountKrw).toBe(9000);
    expect(payload.data?.[0]?.description).toBe("bonus");
  });

  it("keeps same-id coexistence categorized accountId on the stored-first visible binding", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-05-01,-15000,legacy lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "categorized-coexist.csv",
      accountId: "acc-legacy",
    });

    await saveStoredShadowBatch({
      batchId: created.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-05-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-05-05", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(created.batch.id)}/categorized?csrf=test`),
      { params: Promise.resolve({ id: created.batch.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      data?: Array<{ accountId?: string; amountKrw?: number; description?: string }>;
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        accountId: "acc-stored",
        amountKrw: 9000,
        description: "bonus",
      }),
    ]);
    expect(payload.data?.some((row) => row.accountId === "unassigned")).toBe(false);
  });
});
