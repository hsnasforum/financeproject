import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBatchSummary } from "../src/lib/planning/v3/service/getBatchSummary";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

async function createFixtureBatch(): Promise<string> {
  const accountA = await createAccount({ name: "Main", kind: "checking" });
  const accountB = await createAccount({ name: "Sub", kind: "saving" });
  const batchId = "summaryfixture0001";
  await saveBatch({
    id: batchId,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "csv",
    rowCount: 9,
    accounts: [{ id: accountA.id }, { id: accountB.id }],
    importMetadata: {
      diagnostics: {
        rows: 9,
        parsed: 9,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: true,
        fileName: "summary.csv",
      },
    },
  }, [
    { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", batchId, accountId: accountA.id, date: "2026-01-01", amountKrw: 3000000, description: "salary", source: "csv" },
    { txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", batchId, accountId: accountA.id, date: "2026-01-02", amountKrw: -1000000, description: "rent", source: "csv" },
    { txnId: "cccccccccccccccccccccccc", batchId, accountId: accountA.id, date: "2026-01-03", amountKrw: -500000, description: "transfer out", source: "csv" },
    { txnId: "dddddddddddddddddddddddd", batchId, accountId: accountB.id, date: "2026-01-03", amountKrw: 500000, description: "transfer in", source: "csv" },
    { txnId: "eeeeeeeeeeeeeeeeeeeeeeee", batchId, accountId: accountA.id, date: "2026-01-04", amountKrw: -200000, description: "food market", source: "csv" },
    { txnId: "ffffffffffffffffffffffff", batchId, accountId: accountA.id, date: "2026-01-05", amountKrw: -100000, description: "misc payment", source: "csv" },
    { txnId: "111111111111111111111111", batchId, accountId: accountA.id, date: "2026-02-01", amountKrw: 3100000, description: "salary", source: "csv" },
    { txnId: "222222222222222222222222", batchId, accountId: accountA.id, date: "2026-02-02", amountKrw: -1100000, description: "rent", source: "csv" },
    { txnId: "333333333333333333333333", batchId, accountId: accountA.id, date: "2026-02-03", amountKrw: -300000, description: "food market", source: "csv" },
  ]);
  return batchId;
}

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
  rowCount?: number;
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
    rowCount: input.rowCount ?? input.rows.length,
    accounts: [{ id: input.accountId }],
  }, input.rows.map((row) => ({
    ...row,
    batchId: input.batchId,
    ...(input.omitRowAccountId ? {} : { accountId: input.accountId }),
    source: "csv" as const,
  })));
}

function saveStoredTransactionsOnly(input: {
  batchId: string;
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
}

describe("getBatchSummary", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-get-batch-summary-"));
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

  it("builds deterministic batch summary snapshot", async () => {
    const batchId = await createFixtureBatch();
    const summaryA = await getBatchSummary(batchId);
    const summaryB = await getBatchSummary(batchId);

    expect(summaryA).toStrictEqual(summaryB);
    expect(summaryA.batchId).toBe(batchId);
    expect(summaryA.range).toEqual({
      fromYm: "2026-01",
      toYm: "2026-02",
      months: 2,
    });
    expect(summaryA.monthly).toEqual([
      { ym: "2026-01", incomeKrw: 3000000, expenseKrw: 1300000, transferKrw: 1000000 },
      { ym: "2026-02", incomeKrw: 3100000, expenseKrw: 1400000, transferKrw: 0 },
    ]);
  });

  it("excludes transfers from expense totals", async () => {
    const batchId = await createFixtureBatch();
    const summary = await getBatchSummary(batchId);

    expect(summary.totals.expenseKrw).toBe(2700000);
    expect(summary.totals.transferKrw).toBe(1000000);
    expect(summary.counts.transfers).toBe(2);
  });

  it("keeps monthly rows sorted by ym ascending", async () => {
    const batchId = await createFixtureBatch();
    const summary = await getBatchSummary(batchId);

    expect(summary.monthly.map((row) => row.ym)).toEqual(["2026-01", "2026-02"]);
  });

  it("returns top expense categories sorted by total desc", async () => {
    const batchId = await createFixtureBatch();
    const summary = await getBatchSummary(batchId);

    expect(summary.topExpenseCategories[0]).toEqual({
      categoryId: "housing",
      totalKrw: 2100000,
    });
    expect(summary.topExpenseCategories[1]).toEqual({
      categoryId: "food",
      totalKrw: 500000,
    });
    expect(summary.topExpenseCategories[2]).toEqual({
      categoryId: "unknown",
      totalKrw: 100000,
    });
  });

  it("ignores legacy unscoped override and only applies batch-scoped override", async () => {
    const batchId = await createFixtureBatch();
    const targetTxnId = "ffffffffffffffffffffffff";

    await upsertOverride(targetTxnId, { category: "health" });
    const legacyIgnored = await getBatchSummary(batchId);
    expect(legacyIgnored.counts.unassignedCategory).toBe(1);
    expect(legacyIgnored.topExpenseCategories.some((row) => row.categoryId === "health")).toBe(false);

    await upsertOverride({
      batchId,
      txnId: targetTxnId,
      categoryId: "housing",
    });
    const scoped = await getBatchSummary(batchId);
    expect(scoped.counts.unassignedCategory).toBe(0);
    expect(scoped.topExpenseCategories).toContainEqual({
      categoryId: "housing",
      totalKrw: 2200000,
    });
    expect(scoped.topExpenseCategories.some((row) => row.categoryId === "unknown")).toBe(false);
  });

  it("prefers stored batch snapshot when stored and legacy rows coexist for same batch id", async () => {
    const account = await createAccount({ name: "Stored First", kind: "checking" });
    const legacy = await appendBatchFromCsv({
      accountId: account.id,
      fileName: "legacy-summary.csv",
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,salary",
        "2026-01-02,-500000,rent",
        "2026-02-01,2100000,salary",
        "2026-02-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: account.id,
      createdAt: "2026-02-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 4000000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-03-02", amountKrw: -1000000, description: "rent" },
        { txnId: "cccccccccccccccc", date: "2026-04-01", amountKrw: 4200000, description: "salary" },
        { txnId: "dddddddddddddddd", date: "2026-04-02", amountKrw: -1000000, description: "rent" },
      ],
    });

    const summary = await getBatchSummary(legacy.batch.id);
    expect(summary.range).toEqual({
      fromYm: "2026-03",
      toYm: "2026-04",
      months: 2,
    });
    expect(summary.monthly).toEqual([
      { ym: "2026-03", incomeKrw: 4000000, expenseKrw: 1000000, transferKrw: 0 },
      { ym: "2026-04", incomeKrw: 4200000, expenseKrw: 1000000, transferKrw: 0 },
    ]);
    expect(summary.totals.incomeKrw).toBe(8200000);
    expect(summary.totals.expenseKrw).toBe(2000000);
  });

  it("rejects same-id hybrid legacy fallback instead of summarizing global legacy rows", async () => {
    const account = await createAccount({ name: "Hybrid", kind: "checking" });
    const legacy = await appendBatchFromCsv({
      accountId: account.id,
      fileName: "legacy-hybrid-summary.csv",
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,salary",
        "2026-01-02,-500000,rent",
        "2026-02-01,2100000,salary",
        "2026-02-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: account.id,
      createdAt: "2026-03-10T00:00:00.000Z",
      rowCount: 6,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 9900, description: "stale" },
      ],
    });

    await expect(getBatchSummary(legacy.batch.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("omits createdAt under the shared public createdAt boundary when only stored rows exist without stored meta", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticsummary001",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", accountId: "acc-synthetic", date: "2026-06-01", amountKrw: 15000, description: "bonus" },
        { txnId: "bbbbbbbbbbbbbbbb", accountId: "acc-synthetic", date: "2026-06-02", amountKrw: -5000, description: "snack" },
      ],
    });

    const summary = await getBatchSummary("syntheticsummary001");
    expect(summary.createdAt).toBeUndefined();
    expect(summary.range).toEqual({
      fromYm: "2026-06",
      toYm: "2026-06",
      months: 1,
    });
    expect(summary.monthly).toEqual([
      { ym: "2026-06", incomeKrw: 15000, expenseKrw: 5000, transferKrw: 0 },
    ]);
  });

  it("uses stored-first account binding before transfer detection when stored rows omit accountId", async () => {
    await saveStoredShadowBatch({
      batchId: "summarybinding0001",
      accountId: "acc-stored",
      createdAt: "2026-07-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-07-01", amountKrw: 500000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-07-01", amountKrw: -500000, description: "same-account paired expense" },
      ],
    });

    const summary = await getBatchSummary("summarybinding0001");
    expect(summary.monthly).toEqual([
      { ym: "2026-07", incomeKrw: 500000, expenseKrw: 500000, transferKrw: 0 },
    ]);
    expect(summary.totals.incomeKrw).toBe(500000);
    expect(summary.totals.expenseKrw).toBe(500000);
    expect(summary.totals.transferKrw).toBe(0);
    expect(summary.counts.transfers).toBe(0);
  });

  it("keeps same-id coexistence summary projection on the stored-first binding view", async () => {
    const legacyAccount = await createAccount({ name: "Legacy Summary", kind: "checking" });
    const legacy = await appendBatchFromCsv({
      accountId: legacyAccount.id,
      fileName: "legacy-coexist-summary.csv",
      csvText: [
        "date,amount,description",
        "2026-08-01,2100000,salary",
        "2026-08-02,-700000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-08-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-08-05", amountKrw: 500000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-08-05", amountKrw: -500000, description: "same-account paired expense" },
      ],
    });

    const summary = await getBatchSummary(legacy.batch.id);
    expect(summary.createdAt).toBe("2026-08-10T00:00:00.000Z");
    expect(summary.monthly).toEqual([
      { ym: "2026-08", incomeKrw: 500000, expenseKrw: 500000, transferKrw: 0 },
    ]);
    expect(summary.totals.incomeKrw).toBe(500000);
    expect(summary.totals.expenseKrw).toBe(500000);
    expect(summary.totals.transferKrw).toBe(0);
    expect(summary.counts.transfers).toBe(0);
  });
});
