import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as transfersGET } from "../src/app/api/planning/v3/transactions/batches/[id]/transfers/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";

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
});
