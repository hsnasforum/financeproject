import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GenerateDraftPatchFromBatchError,
  generateDraftPatchFromBatch,
} from "../src/lib/planning/v3/service/generateDraftPatchFromBatch";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function findTxnIdByDateAndAmount(
  rows: Array<{ txnId?: string; date: string; amountKrw: number }>,
  date: string,
  amountKrw: number,
): string {
  const found = rows.find((row) => row.date === date && Math.round(row.amountKrw) === amountKrw);
  expect(found?.txnId).toBeTruthy();
  return String(found?.txnId);
}

describe("generateDraftPatchFromBatch", () => {
  let root = "";
  let accountId = "";
  let secondAccountId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-from-batch-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    const accountA = await createAccount({ name: "Main", kind: "checking" });
    const accountB = await createAccount({ name: "Sub", kind: "checking" });
    accountId = accountA.id;
    secondAccountId = accountB.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns deterministic draft patch/evidence for the same batch", async () => {
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,3000000,salary",
        "2026-01-02,-1200000,rent",
        "2026-02-01,3200000,salary",
        "2026-02-02,-1100000,rent",
        "2026-03-01,3100000,salary",
        "2026-03-02,-1000000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "deterministic.csv",
    });

    const first = await generateDraftPatchFromBatch({ batchId: created.batch.id });
    const second = await generateDraftPatchFromBatch({ batchId: created.batch.id });

    expect(first).toEqual(second);
    expect(first.draftPatch.monthlyIncomeNet).toBe(3_100_000);
    expect(first.evidence.monthsUsed).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("excludes detected transfers from expense/fixed/variable stats", async () => {
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-03-01,2000000,salary",
        "2026-03-02,-100000,groceries",
        "2026-03-05,-300000,transfer out",
        "2026-03-05,300000,transfer in",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "transfer-safe.csv",
    });

    const loaded = await readBatchTransactions(created.batch.id);
    expect(loaded).not.toBeNull();
    const rows = loaded?.transactions ?? [];
    const debitTxnId = findTxnIdByDateAndAmount(rows, "2026-03-05", -300000);
    await upsertAccountMappingOverride({
      batchId: created.batch.id,
      txnId: debitTxnId,
      accountId: secondAccountId,
    });

    const result = await generateDraftPatchFromBatch({ batchId: created.batch.id });
    expect(result.evidence.ymStats).toHaveLength(1);
    expect(result.evidence.ymStats[0]?.expenseKrw).toBe(100_000);
    expect(result.evidence.ymStats[0]?.transferKrw).toBe(600_000);
    expect(result.draftPatch.monthlyDiscretionaryExpenses).toBe(100_000);
  });

  it("applies category override to fixed/variable split", async () => {
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-03-01,2000000,salary",
        "2026-03-03,-200000,unknown spend",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "override.csv",
    });

    const loaded = await readBatchTransactions(created.batch.id);
    const txnId = findTxnIdByDateAndAmount(loaded?.transactions ?? [], "2026-03-03", -200000);
    await upsertOverride({
      batchId: created.batch.id,
      txnId,
      categoryId: "housing",
    });

    const result = await generateDraftPatchFromBatch({ batchId: created.batch.id });
    expect(result.draftPatch.monthlyEssentialExpenses).toBe(200_000);
    expect(result.draftPatch.monthlyDiscretionaryExpenses).toBe(0);
  });

  it("keeps median stable for one-month and multi-month input", async () => {
    const oneMonth = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2025-12-01,2000000,salary",
        "2025-12-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "one-month.csv",
    });
    const oneResult = await generateDraftPatchFromBatch({ batchId: oneMonth.batch.id });
    expect(oneResult.draftPatch.monthsConsidered).toBe(1);
    expect(oneResult.draftPatch.monthlyIncomeNet).toBe(2_000_000);

    const multiMonth = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,1000000,salary",
        "2026-01-02,-100000,rent",
        "2026-02-01,3000000,salary",
        "2026-02-02,-300000,rent",
        "2026-03-01,5000000,salary",
        "2026-03-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "multi-month.csv",
    });
    const multiResult = await generateDraftPatchFromBatch({ batchId: multiMonth.batch.id });
    expect(multiResult.draftPatch.monthlyIncomeNet).toBe(3_000_000);
    expect(multiResult.draftPatch.monthlyEssentialExpenses).toBe(300_000);
  });

  it("does not include raw description markers in evidence", async () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        `2026-03-01,2000000,${marker}`,
        `2026-03-02,-500000,${marker}`,
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "pii.csv",
    });

    const result = await generateDraftPatchFromBatch({ batchId: created.batch.id });
    const asText = JSON.stringify(result);
    expect(asText.includes(marker)).toBe(false);
    expect(asText.includes("description")).toBe(false);
  });

  it("throws not-found error for missing batch id", async () => {
    await expect(generateDraftPatchFromBatch({ batchId: "b_missing_batch_id" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<GenerateDraftPatchFromBatchError>);
  });
});
