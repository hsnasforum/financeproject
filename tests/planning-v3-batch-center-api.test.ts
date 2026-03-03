import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as batchesGET } from "../src/app/api/planning/v3/batches/route";
import { GET as batchSummaryGET } from "../src/app/api/planning/v3/batches/[id]/summary/route";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:5110";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/batches`,
    },
  });
}

function collectKeys(value: unknown, parent = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectKeys(entry, `${parent}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const rows: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const pathKey = parent ? `${parent}.${key}` : key;
    rows.push(pathKey);
    rows.push(...collectKeys(child, pathKey));
  }
  return rows;
}

async function createFixtureBatch(): Promise<string> {
  const accountA = await createAccount({ name: "Main", kind: "checking" });
  const accountB = await createAccount({ name: "Sub", kind: "saving" });
  const imported = await appendBatchFromCsv({
    accountId: accountA.id,
    csvText: [
      "date,amount,description",
      "2026-01-01,3000000,salary",
      "2026-01-02,-1000000,rent",
      "2026-01-03,-500000,transfer out",
      "2026-01-03,500000,transfer in",
      "2026-01-04,-200000,food market",
      "2026-02-01,3100000,salary",
      "2026-02-02,-1100000,rent",
    ].join("\n"),
    mapping: {
      dateKey: "date",
      amountKey: "amount",
      descKey: "description",
    },
  });
  const loaded = await readBatchTransactions(imported.batch.id);
  const creditTxn = (loaded?.transactions ?? []).find((tx) => tx.date === "2026-01-03" && tx.amountKrw > 0);
  if (creditTxn?.txnId) {
    await upsertAccountMappingOverride({
      batchId: imported.batch.id,
      txnId: creditTxn.txnId,
      accountId: accountB.id,
    });
  }
  return imported.batch.id;
}

describe("planning v3 batch center API", () => {
  let root = "";
  let batchId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-center-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    batchId = await createFixtureBatch();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET /api/planning/v3/batches returns stable list shape", async () => {
    const response = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{
        batchId?: string;
        createdAt?: string;
        stats?: { months?: number; txns?: number; unassignedCategory?: number; transfers?: number };
      }>;
    };

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect((payload.data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(typeof payload.data?.[0]?.batchId).toBe("string");
    expect(typeof payload.data?.[0]?.createdAt).toBe("string");
    expect(typeof payload.data?.[0]?.stats?.months).toBe("number");
    expect(typeof payload.data?.[0]?.stats?.txns).toBe("number");
    expect(typeof payload.data?.[0]?.stats?.transfers).toBe("number");
  });

  it("GET /api/planning/v3/batches/[id]/summary returns 404 for missing batch", async () => {
    const id = "missing_batch";
    const response = await batchSummaryGET(
      requestGet(`/api/planning/v3/batches/${encodeURIComponent(id)}/summary?csrf=test`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(404);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("GET summary excludes forbidden raw keys", async () => {
    const response = await batchSummaryGET(
      requestGet(`/api/planning/v3/batches/${encodeURIComponent(batchId)}/summary?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    const keys = collectKeys(payload).join("\n").toLowerCase();
    expect(keys.includes("description")).toBe(false);
    expect(keys.includes("desc")).toBe(false);
    expect(keys.includes("merchant")).toBe(false);
    expect(keys.includes("rawline")).toBe(false);
    expect(keys.includes("originalcsv")).toBe(false);
    expect(keys.includes("memo")).toBe(false);
  });

  it("GET summary returns transfer-safe totals", async () => {
    const response = await batchSummaryGET(
      requestGet(`/api/planning/v3/batches/${encodeURIComponent(batchId)}/summary?csrf=test`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        totals?: { incomeKrw?: number; expenseKrw?: number; transferKrw?: number };
        counts?: { transfers?: number };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.totals?.incomeKrw).toBe(6100000);
    expect(payload.data?.totals?.expenseKrw).toBe(2300000);
    expect(payload.data?.totals?.transferKrw).toBe(1000000);
    expect(payload.data?.counts?.transfers).toBe(2);
  });
});

