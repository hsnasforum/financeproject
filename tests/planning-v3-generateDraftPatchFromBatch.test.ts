import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GenerateDraftPatchFromBatchError,
  generateDraftPatchFromBatch,
} from "../src/lib/planning/v3/service/generateDraftPatchFromBatch";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { upsertAccountMappingOverride } from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

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

async function importStoredCsvFixture(input: {
  accountId: string;
  csvText: string;
  fileName?: string;
}) {
  const imported = await importCsvToBatch({
    csvText: input.csvText,
    mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    ...(input.fileName ? { provenance: { fileName: input.fileName } } : {}),
    options: { accountId: input.accountId },
  });
  return {
    batch: { id: imported.batchMeta.id },
    transactions: imported.transactions,
  };
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
    const created = await importStoredCsvFixture({
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
      fileName: "deterministic.csv",
    });

    const first = await generateDraftPatchFromBatch({ batchId: created.batch.id });
    const second = await generateDraftPatchFromBatch({ batchId: created.batch.id });

    expect(first).toEqual(second);
    expect(first.draftPatch.monthlyIncomeNet).toBe(3_100_000);
    expect(first.evidence.monthsUsed).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("excludes detected transfers from expense/fixed/variable stats", async () => {
    const batchId = "drafttransfer001";
    const debitTxnId = "cccccccccccccccccccccccc";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-05T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 2000000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-03-02", amountKrw: -100000, description: "groceries" },
        { txnId: debitTxnId, date: "2026-03-05", amountKrw: -300000, description: "transfer out" },
        { txnId: "dddddddddddddddddddddddd", date: "2026-03-05", amountKrw: 300000, description: "transfer in" },
      ],
    });

    await upsertAccountMappingOverride({
      batchId,
      txnId: debitTxnId,
      accountId: secondAccountId,
    });

    const result = await generateDraftPatchFromBatch({ batchId });
    expect(result.evidence.ymStats).toHaveLength(1);
    expect(result.evidence.ymStats[0]?.expenseKrw).toBe(100_000);
    expect(result.evidence.ymStats[0]?.transferKrw).toBe(600_000);
    expect(result.draftPatch.monthlyDiscretionaryExpenses).toBe(100_000);
  });

  it("applies category override to fixed/variable split", async () => {
    const batchId = "draftcategory001";
    const txnId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-03T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 2000000, description: "salary" },
        { txnId, date: "2026-03-03", amountKrw: -200000, description: "unknown spend" },
      ],
    });

    await upsertOverride({
      batchId,
      txnId,
      categoryId: "housing",
    });

    const result = await generateDraftPatchFromBatch({ batchId });
    expect(result.draftPatch.monthlyEssentialExpenses).toBe(200_000);
    expect(result.draftPatch.monthlyDiscretionaryExpenses).toBe(0);
  });

  it("ignores legacy unscoped override in user-facing draft generation", async () => {
    const batchId = "draftlegacyignore001";
    const txnId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-03T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 2000000, description: "salary" },
        { txnId, date: "2026-03-03", amountKrw: -200000, description: "unknown spend" },
      ],
    });

    await upsertOverride(txnId, { category: "fixed" });
    const legacyIgnored = await generateDraftPatchFromBatch({ batchId });
    expect(legacyIgnored.draftPatch.monthlyEssentialExpenses).toBe(0);
    expect(legacyIgnored.draftPatch.monthlyDiscretionaryExpenses).toBe(200_000);

    await upsertOverride({
      batchId,
      txnId,
      categoryId: "housing",
    });
    const scoped = await generateDraftPatchFromBatch({ batchId });
    expect(scoped.draftPatch.monthlyEssentialExpenses).toBe(200_000);
    expect(scoped.draftPatch.monthlyDiscretionaryExpenses).toBe(0);
  });

  it("keeps median stable for one-month and multi-month input", async () => {
    const oneMonth = await importStoredCsvFixture({
      accountId,
      csvText: [
        "date,amount,description",
        "2025-12-01,2000000,salary",
        "2025-12-02,-500000,rent",
      ].join("\n"),
      fileName: "one-month.csv",
    });
    const oneResult = await generateDraftPatchFromBatch({ batchId: oneMonth.batch.id });
    expect(oneResult.draftPatch.monthsConsidered).toBe(1);
    expect(oneResult.draftPatch.monthlyIncomeNet).toBe(2_000_000);

    const multiMonth = await importStoredCsvFixture({
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
      fileName: "multi-month.csv",
    });
    const multiResult = await generateDraftPatchFromBatch({ batchId: multiMonth.batch.id });
    expect(multiResult.draftPatch.monthlyIncomeNet).toBe(3_000_000);
    expect(multiResult.draftPatch.monthlyEssentialExpenses).toBe(300_000);
  });

  it("keeps expense-flow policy independent from draft recentMonths policy", async () => {
    const batchId = "draftpolicy001";
    const txnId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-03T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: 2000000, description: "salary" },
        { txnId, date: "2026-03-03", amountKrw: -200000, description: "unknown spend" },
      ],
    });

    await upsertOverride({
      batchId,
      txnId,
      categoryId: "housing",
    });

    const result = await generateDraftPatchFromBatch({
      batchId,
      policy: { recentMonths: 1 },
    });

    expect(result.draftPatch.monthlyEssentialExpenses).toBe(200_000);
    expect(result.draftPatch.monthlyDiscretionaryExpenses).toBe(0);
  });

  it("does not include raw description markers in evidence", async () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const created = await importStoredCsvFixture({
      accountId,
      csvText: [
        "date,amount,description",
        `2026-03-01,2000000,${marker}`,
        `2026-03-02,-500000,${marker}`,
      ].join("\n"),
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

  it("prefers stored batch transactions when stored and legacy snapshots share same batch id", async () => {
    const legacy = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,salary",
        "2026-01-02,-500000,rent",
        "2026-02-01,2100000,salary",
        "2026-02-02,-500000,rent",
        "2026-03-01,2200000,salary",
        "2026-03-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "legacy-shadow.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId,
      createdAt: "2026-04-05T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-02-01", amountKrw: 4000000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-02-02", amountKrw: -1000000, description: "rent" },
        { txnId: "cccccccccccccccc", date: "2026-03-01", amountKrw: 4100000, description: "salary" },
        { txnId: "dddddddddddddddd", date: "2026-03-02", amountKrw: -1000000, description: "rent" },
        { txnId: "eeeeeeeeeeeeeeee", date: "2026-04-01", amountKrw: 4200000, description: "salary" },
        { txnId: "ffffffffffffffff", date: "2026-04-02", amountKrw: -1000000, description: "rent" },
      ],
    });

    const result = await generateDraftPatchFromBatch({ batchId: legacy.batch.id });
    expect(result.draftPatch.monthlyIncomeNet).toBe(4100000);
    expect(result.draftPatch.monthlyEssentialExpenses).toBe(1000000);
    expect(result.evidence.monthsUsed).toEqual(["2026-02", "2026-03", "2026-04"]);
  });

  it("uses stored batch account binding before transfer stats when stored rows omit accountId", async () => {
    await saveStoredShadowBatch({
      batchId: "storedbinding0002",
      accountId,
      createdAt: "2026-04-05T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "1111111111111111", date: "2026-01-01", amountKrw: 2_000_000, description: "salary" },
        { txnId: "2222222222222222", date: "2026-01-02", amountKrw: -500_000, description: "rent" },
        { txnId: "3333333333333333", date: "2026-02-01", amountKrw: 2_100_000, description: "salary" },
        { txnId: "4444444444444444", date: "2026-02-02", amountKrw: -500_000, description: "rent" },
        { txnId: "5555555555555555", date: "2026-03-01", amountKrw: 2_200_000, description: "salary" },
        { txnId: "6666666666666666", date: "2026-03-02", amountKrw: -500_000, description: "rent" },
      ],
    });

    const result = await generateDraftPatchFromBatch({ batchId: "storedbinding0002" });
    expect(result.draftPatch.monthlyIncomeNet).toBe(2_100_000);
    expect(result.stats.unassignedCount).toBe(0);
    expect(result.evidence.monthsUsed).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("keeps same-id coexistence draft generation on the stored-first visible binding", async () => {
    const legacy = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,salary",
        "2026-01-02,-500000,rent",
        "2026-02-01,2100000,salary",
        "2026-02-02,-500000,rent",
        "2026-03-01,2200000,salary",
        "2026-03-02,-500000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "legacy-coexist-draft-patch.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: secondAccountId,
      createdAt: "2026-04-05T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-02-01", amountKrw: 4000000, description: "salary" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-02-02", amountKrw: -1000000, description: "rent" },
        { txnId: "cccccccccccccccc", date: "2026-03-01", amountKrw: 4100000, description: "salary" },
        { txnId: "dddddddddddddddd", date: "2026-03-02", amountKrw: -1000000, description: "rent" },
        { txnId: "eeeeeeeeeeeeeeee", date: "2026-04-01", amountKrw: 4200000, description: "salary" },
        { txnId: "ffffffffffffffff", date: "2026-04-02", amountKrw: -1000000, description: "rent" },
      ],
    });

    const result = await generateDraftPatchFromBatch({ batchId: legacy.batch.id });
    expect(result.draftPatch.monthlyIncomeNet).toBe(4100000);
    expect(result.draftPatch.monthlyEssentialExpenses).toBe(1000000);
    expect(result.stats.unassignedCount).toBe(0);
    expect(result.evidence.monthsUsed).toEqual(["2026-02", "2026-03", "2026-04"]);
  });
});
