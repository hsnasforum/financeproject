import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/transactions/import/csv/route";
import { readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4200";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/transactions/import/csv`, {
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

describe("POST /api/planning/v3/transactions/import/csv account mapping", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-import-account-"));
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

  it("returns 400 when accountId is missing", async () => {
    const response = await importCsvPOST(requestJson({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000,급여",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    }));

    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("stores accountId and reflects it in transaction identity", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,급여",
      "2026-03-02,-300,커피",
    ].join("\n");

    const firstResponse = await importCsvPOST(requestJson({
      csvText,
      accountId: "acc-main",
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    }));
    expect(firstResponse.status).toBe(201);
    const firstPayload = await firstResponse.json() as {
      ok?: boolean;
      batchId?: string;
      batch?: { id?: string };
    };
    const firstBatchId = String(firstPayload.batchId || firstPayload.batch?.id || "");
    expect(firstBatchId).not.toBe("");

    const secondResponse = await importCsvPOST(requestJson({
      csvText,
      accountId: "acc-savings",
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    }));
    expect(secondResponse.status).toBe(201);
    const secondPayload = await secondResponse.json() as {
      ok?: boolean;
      batchId?: string;
      batch?: { id?: string };
    };
    const secondBatchId = String(secondPayload.batchId || secondPayload.batch?.id || "");
    expect(secondBatchId).not.toBe("");
    expect(secondBatchId).not.toBe(firstBatchId);

    const [firstBatch, secondBatch] = await Promise.all([
      readBatchTransactions(firstBatchId),
      readBatchTransactions(secondBatchId),
    ]);

    expect(firstBatch).not.toBeNull();
    expect(secondBatch).not.toBeNull();
    const firstTransactions = firstBatch?.transactions ?? [];
    const secondTransactions = secondBatch?.transactions ?? [];

    expect(firstTransactions.every((tx) => tx.accountId === "acc-main")).toBe(true);
    expect(secondTransactions.every((tx) => tx.accountId === "acc-savings")).toBe(true);
    expect(firstTransactions.map((tx) => tx.txnId)).not.toEqual(secondTransactions.map((tx) => tx.txnId));
  });
});
