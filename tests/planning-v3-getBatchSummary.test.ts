import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBatchSummary } from "../src/lib/planning/v3/service/getBatchSummary";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

async function createFixtureBatch(): Promise<string> {
  const accountA = await createAccount({ name: "Main", kind: "checking" });
  const accountB = await createAccount({ name: "Sub", kind: "saving" });
  const imported = await appendBatchFromCsv({
    accountId: accountA.id,
    fileName: "summary.csv",
    csvText: [
      "date,amount,description",
      "2026-01-01,3000000,salary",
      "2026-01-02,-1000000,rent",
      "2026-01-03,-500000,transfer out",
      "2026-01-03,500000,transfer in",
      "2026-01-04,-200000,food market",
      "2026-01-05,-100000,misc payment",
      "2026-02-01,3100000,salary",
      "2026-02-02,-1100000,rent",
      "2026-02-03,-300000,food market",
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
});
