import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as transfersGET } from "../src/app/api/planning/v3/transactions/batches/[id]/transfers/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4920";
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

describe("planning v3 transfers API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-transfers-api-"));
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

  it("returns detections and unassignedCount decreases after account override", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,-50000,transfer out",
        "2026-03-01,50000,transfer in",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "unassigned",
      fileName: "tx.csv",
    });

    const batchId = created.batch.id;
    const before = await transfersGET(
      requestGet(`/api/planning/v3/transactions/batches/${batchId}/transfers?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(before.status).toBe(200);
    const beforePayload = await before.json() as {
      ok?: boolean;
      data?: { detections?: Array<unknown>; unassignedCount?: number };
    };
    expect(beforePayload.ok).toBe(true);
    expect((beforePayload.data?.detections ?? []).length).toBe(1);
    expect(beforePayload.data?.unassignedCount).toBe(2);

    const detectedDebitId = (beforePayload.data?.detections?.[0] as { debitTxnId?: string } | undefined)?.debitTxnId;
    if (detectedDebitId) {
      await upsertAccountMappingOverride({
        batchId,
        txnId: detectedDebitId,
        accountId: "acc-main",
      });
    }

    const after = await transfersGET(
      requestGet(`/api/planning/v3/transactions/batches/${batchId}/transfers?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(after.status).toBe(200);
    const afterPayload = await after.json() as {
      ok?: boolean;
      data?: { unassignedCount?: number };
    };
    expect(afterPayload.ok).toBe(true);
    expect(afterPayload.data?.unassignedCount).toBe(1);
  });

  it("keeps same-id coexistence transfer stats on the stored-first visible binding view", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-05-01,-50000,legacy transfer out",
        "2026-05-01,50000,legacy transfer in",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-legacy",
      fileName: "coexist-transfers.csv",
    });

    await saveStoredShadowBatch({
      batchId: created.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-05-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-05-05", amountKrw: -50000, description: "stored paired expense" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-05-05", amountKrw: 50000, description: "stored paired income" },
      ],
    });

    const response = await transfersGET(
      requestGet(`/api/planning/v3/transactions/batches/${created.batch.id}/transfers?csrf=test`),
      { params: Promise.resolve({ id: created.batch.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        detections?: Array<unknown>;
        stats?: { totalTxns?: number; transfers?: number };
        unassignedCount?: number;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.stats?.totalTxns).toBe(2);
    expect(payload.data?.stats?.transfers).toBe(0);
    expect((payload.data?.detections ?? []).length).toBe(0);
    expect(payload.data?.unassignedCount).toBe(0);
  });
});
