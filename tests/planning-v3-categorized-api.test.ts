import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as categorizedGET } from "../src/app/api/planning/v3/transactions/batches/[id]/categorized/route";
import { readBatchTransactions, appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
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

  it("returns categorized rows + monthly breakdown and no raw csv dump", async () => {
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
      categoryId: "health",
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
    expect(overridden?.categoryId).toBe("health");
    expect(overridden?.categorySource).toBe("override");
    expect(((payload.breakdown ?? [])[0]?.byCategory ?? {}).health).toBeGreaterThanOrEqual(7000);
  });
});
