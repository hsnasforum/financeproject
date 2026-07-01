import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as mergeBatchesPOST } from "../src/app/api/planning/v3/transactions/batches/merge/route";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3900";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

installPlanningAuthRequiredFalseForTest();

function requestJson(pathName: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
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

describe("POST /api/planning/v3/transactions/batches/merge", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batches-merge-"));
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

  it("keeps legacy merge disabled for user requests", async () => {
    const from = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-07-01,3000000,salary",
        "2026-07-02,-1000000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "from.csv",
    });

    const into = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-07-02,-1000000, rent ",
        "2026-07-03,-200000,coffee",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "into.csv",
    });
    const legacyBatchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    const legacyRecordsPath = path.join(root, "v3", "transactions", "records.ndjson");
    const beforeBatchesRaw = fs.readFileSync(legacyBatchesPath, "utf-8");
    const beforeRecordsRaw = fs.readFileSync(legacyRecordsPath, "utf-8");
    const intoBefore = await readBatchTransactions(into.batch.id);
    const beforeTxnIds = (intoBefore?.transactions ?? []).map((row) => row.txnId).sort();

    const response = await mergeBatchesPOST(requestJson("/api/planning/v3/transactions/batches/merge", {
      fromBatchId: from.batch.id,
      intoBatchId: into.batch.id,
    }));

    expect(response.status).toBe(410);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(fs.readFileSync(legacyBatchesPath, "utf-8")).toBe(beforeBatchesRaw);
    expect(fs.readFileSync(legacyRecordsPath, "utf-8")).toBe(beforeRecordsRaw);

    const intoAfter = await readBatchTransactions(into.batch.id);
    expect(intoAfter).not.toBeNull();
    expect(intoAfter?.transactions).toEqual(intoBefore?.transactions);
    expect((intoAfter?.transactions ?? []).map((row) => row.txnId).sort()).toEqual(beforeTxnIds);
  });
});
