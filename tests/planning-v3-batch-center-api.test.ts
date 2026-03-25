import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as batchesGET } from "../src/app/api/planning/v3/batches/route";
import { GET as batchSummaryGET } from "../src/app/api/planning/v3/batches/[id]/summary/route";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { toStoredFirstPublicImportBatchMeta } from "../src/lib/planning/v3/transactions/store";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
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

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
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
    accountId: input.accountId,
    source: "csv" as const,
  })));
}

function saveStoredTransactionsOnly(input: {
  batchId: string;
  fileModifiedAt?: string;
  rows: Array<{
    txnId: string;
    date: string;
    amountKrw: number;
    description: string;
    accountId?: string;
  }>;
}) {
  const root = String(env.PLANNING_DATA_DIR ?? "");
  const filePath = path.join(root, "planning-v3", "batches", `${input.batchId}.ndjson`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = input.rows.map((row) => JSON.stringify({
    ...row,
    batchId: input.batchId,
    source: "csv",
  })).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
  if (input.fileModifiedAt) {
    const modifiedAt = new Date(input.fileModifiedAt);
    fs.utimesSync(filePath, modifiedAt, modifiedAt);
  }
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

  it("GET /api/planning/v3/batches keeps list createdAt aligned with stored-first summary rows", async () => {
    const legacy = await appendBatchFromCsv({
      accountId: "acc-list",
      csvText: [
        "date,amount,description",
        "2026-03-01,1200000,salary",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-list",
      createdAt: "2026-03-15T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-03-05", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ batchId?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect((payload.data ?? []).find((row) => row.batchId === legacy.batch.id)?.createdAt).toBe("2026-03-15T00:00:00.000Z");
  });

  it("batch center list expression omits hidden public createdAt instead of downgrading it to an empty string", () => {
    const meta = toStoredFirstPublicImportBatchMeta({
      meta: {
        id: "batch_hidden_created_at",
        createdAt: "2026-03-15T00:00:00.000Z",
        source: "csv",
        rowCount: 1,
      },
      metadataSource: "synthetic",
    });

    expect(meta).not.toHaveProperty("createdAt");
  });

  it("GET /api/planning/v3/batches discovers synthetic stored-only ndjson batches without an index entry", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticcenter001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-04-01",
          amountKrw: 15000,
          description: "bonus",
        },
      ],
    });

    const response = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ batchId?: string; createdAt?: string; stats?: { months?: number; txns?: number } }>;
    };
    const row = (payload.data ?? []).find((item) => item.batchId === "syntheticcenter001");
    expect(payload.ok).toBe(true);
    expect(row).toEqual(expect.objectContaining({
      batchId: "syntheticcenter001",
      stats: expect.objectContaining({
        months: 1,
        txns: 1,
      }),
    }));
    expect(row?.createdAt).toBeUndefined();
  });

  it("GET /api/planning/v3/batches synthetic batch also resolves in direct summary with the same hidden createdAt boundary", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticsummaryroute001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-04-01",
          amountKrw: 15000,
          description: "bonus",
        },
        {
          txnId: "bbbbbbbbbbbbbbbb",
          accountId: "acc-synthetic",
          date: "2026-04-02",
          amountKrw: -5000,
          description: "snack",
        },
      ],
    });

    const listResponse = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      data?: Array<{ batchId?: string; createdAt?: string }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).find((row) => row.batchId === "syntheticsummaryroute001")?.createdAt).toBeUndefined();

    const summaryResponse = await batchSummaryGET(
      requestGet("/api/planning/v3/batches/syntheticsummaryroute001/summary?csrf=test"),
      { params: Promise.resolve({ id: "syntheticsummaryroute001" }) },
    );
    expect(summaryResponse.status).toBe(200);
    const summaryPayload = await summaryResponse.json() as {
      ok?: boolean;
      data?: {
        batchId?: string;
        createdAt?: string;
        range?: { fromYm?: string; toYm?: string; months?: number };
        counts?: { txns?: number };
      };
    };
    expect(summaryPayload.ok).toBe(true);
    expect(summaryPayload.data?.batchId).toBe("syntheticsummaryroute001");
    expect(summaryPayload.data?.createdAt).toBeUndefined();
    expect(summaryPayload.data?.range).toEqual({
      fromYm: "2026-04",
      toYm: "2026-04",
      months: 1,
    });
    expect(summaryPayload.data?.counts?.txns).toBe(2);
  });

  it("GET /api/planning/v3/batches orders synthetic stored-only batches by latest row date instead of id fallback", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticaearly",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaab",
          accountId: "acc-synthetic",
          date: "2026-04-01",
          amountKrw: 15000,
          description: "older bonus",
        },
      ],
    });
    saveStoredTransactionsOnly({
      batchId: "syntheticzlate",
      rows: [
        {
          txnId: "bbbbbbbbbbbbbbbb",
          accountId: "acc-synthetic",
          date: "2099-01-05",
          amountKrw: 18000,
          description: "newer bonus",
        },
      ],
    });

    const response = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ batchId?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(
      (payload.data ?? [])
        .filter((row) => row.batchId === "syntheticzlate" || row.batchId === "syntheticaearly")
        .map((row) => row.batchId),
    ).toEqual(["syntheticzlate", "syntheticaearly"]);
    expect((payload.data ?? []).find((row) => row.batchId === "syntheticzlate")?.createdAt).toBeUndefined();
    expect((payload.data ?? []).find((row) => row.batchId === "syntheticaearly")?.createdAt).toBeUndefined();
  });

  it("GET /api/planning/v3/batches falls back from invalid row dates to file stat ordering before epoch", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticainvalidearly",
      fileModifiedAt: "2026-01-01T00:00:00.000Z",
      rows: [
        {
          txnId: "cccccccccccccccc",
          accountId: "acc-synthetic",
          date: "2026-13-40",
          amountKrw: 15000,
          description: "older invalid bonus",
        },
      ],
    });
    saveStoredTransactionsOnly({
      batchId: "syntheticzinvalidlate",
      fileModifiedAt: "2099-01-05T00:00:00.000Z",
      rows: [
        {
          txnId: "dddddddddddddddd",
          accountId: "acc-synthetic",
          date: "2026-99-99",
          amountKrw: 18000,
          description: "newer invalid bonus",
        },
      ],
    });

    const response = await batchesGET(requestGet("/api/planning/v3/batches?csrf=test&limit=20"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ batchId?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(
      (payload.data ?? [])
        .filter((row) => row.batchId === "syntheticzinvalidlate" || row.batchId === "syntheticainvalidearly")
        .map((row) => row.batchId),
    ).toEqual(["syntheticzinvalidlate", "syntheticainvalidearly"]);
    expect((payload.data ?? []).find((row) => row.batchId === "syntheticzinvalidlate")?.createdAt).toBeUndefined();
    expect((payload.data ?? []).find((row) => row.batchId === "syntheticainvalidearly")?.createdAt).toBeUndefined();
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
