import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccount, listAccounts } from "../src/lib/planning/v3/store/accountsStore";
import {
  getAccountMappingOverrides,
  upsertAccountMappingOverride,
} from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { listRules, upsertRule } from "../src/lib/planning/v3/store/categoryRulesStore";
import { getOpeningBalances, upsertOpeningBalance } from "../src/lib/planning/v3/store/openingBalancesStore";
import {
  listBatches,
  listBatchTransactionFileIds,
  saveBatch,
} from "../src/lib/planning/v3/store/batchesStore";
import { getBatchTxnOverrides, upsertBatchTxnOverride } from "../src/lib/planning/v3/store/txnOverridesStore";
import { getTransferOverrides, upsertTransferOverride } from "../src/lib/planning/v3/store/txnTransferOverridesStore";
import { type ImportBatchMeta, type StoredTransaction } from "../src/lib/planning/v3/domain/transactions";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;
const storePathEnvKeys = [
  "PLANNING_V3_ACCOUNTS_PATH",
  "PLANNING_V3_OPENING_BALANCES_PATH",
  "PLANNING_V3_BATCHES_DIR",
  "PLANNING_V3_CATEGORY_RULES_PATH",
  "PLANNING_V3_TXN_OVERRIDES_DIR",
  "PLANNING_V3_TXN_OVERRIDES_PATH",
  "PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR",
  "PLANNING_V3_TXN_TRANSFER_OVERRIDES_DIR",
] as const;
const originalStorePathEnv = Object.fromEntries(
  storePathEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof storePathEnvKeys)[number], string | undefined>;

function txnId(index: number): string {
  return index.toString(16).padStart(24, "0");
}

function batchMeta(index: number): ImportBatchMeta {
  return {
    id: `batch-${String(index).padStart(3, "0")}`,
    createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    source: "csv",
    rowCount: 1,
  };
}

function batchTxn(index: number): StoredTransaction {
  return {
    txnId: `txn-${String(index).padStart(3, "0")}`,
    batchId: `batch-${String(index).padStart(3, "0")}`,
    date: "2026-01-01",
    amountKrw: index + 1,
    description: `row ${index}`,
    source: "csv",
  };
}

describe("planning v3 store mutation concurrency", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-store-concurrency-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_SINGLE_USER_MODE;
    for (const key of storePathEnvKeys) delete env[key];
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;
    if (typeof originalPlanningSingleUserMode === "string") env.PLANNING_SINGLE_USER_MODE = originalPlanningSingleUserMode;
    else delete env.PLANNING_SINGLE_USER_MODE;
    for (const key of storePathEnvKeys) {
      if (typeof originalStorePathEnv[key] === "string") env[key] = originalStorePathEnv[key];
      else delete env[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("keeps all parallel account creates in final state", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => createAccount({
      name: `Account ${index}`,
      kind: "bank",
    })));

    expect(await listAccounts()).toHaveLength(count);
  }, 20_000);

  it("keeps all parallel opening balance upserts in final state", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertOpeningBalance(
      `acct-${String(index).padStart(3, "0")}`,
      "2026-01-01",
      index,
    )));

    expect(Object.keys(await getOpeningBalances())).toHaveLength(count);
  }, 20_000);

  it("keeps all 100 parallel category rule upserts in the same file", async () => {
    const rulesPath = path.join(root, "planning-v3", "category-rules.json");
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, `${JSON.stringify({ version: 1, items: [] })}\n`, "utf-8");

    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertRule({
      id: `parallel-rule-${String(index).padStart(3, "0")}`,
      categoryId: "food",
      match: { type: "contains", value: `merchant-${index}` },
      priority: index,
      enabled: true,
    })));

    expect(await listRules()).toHaveLength(count);
  }, 30_000);

  it("generates 100 distinct ids for parallel category rule upserts without caller ids", async () => {
    const rulesPath = path.join(root, "planning-v3", "category-rules.json");
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, `${JSON.stringify({ version: 1, items: [] })}\n`, "utf-8");

    const count = 100;
    const created = await Promise.all(Array.from({ length: count }, (_, index) => upsertRule({
      categoryId: "food",
      match: { type: "contains", value: `auto-${index}` },
      priority: index,
      enabled: true,
    })));

    expect(new Set(created.map((rule) => rule.id))).toHaveLength(count);
    expect(await listRules()).toHaveLength(count);
  }, 30_000);

  it("keeps all 100 parallel transaction override upserts in the same batch file", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertBatchTxnOverride({
      batchId: "parallel-batch",
      txnId: txnId(index),
      categoryId: "food",
      note: `transaction-${index}`,
    })));

    expect(Object.keys(await getBatchTxnOverrides("parallel-batch"))).toHaveLength(count);
  }, 30_000);

  it("keeps all 100 parallel account mapping override upserts in the same batch file", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertAccountMappingOverride({
      batchId: "parallel-batch",
      txnId: txnId(index),
      accountId: `account-${String(index).padStart(3, "0")}`,
    })));

    expect(Object.keys(await getAccountMappingOverrides("parallel-batch"))).toHaveLength(count);
  }, 30_000);

  it("keeps all 100 parallel transfer override upserts in the same batch file", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertTransferOverride({
      batchId: "parallel-batch",
      txnId: txnId(index),
      forceTransfer: true,
      note: `transfer-${index}`,
    })));

    expect(Object.keys(await getTransferOverrides("parallel-batch"))).toHaveLength(count);
  }, 30_000);

  it("uses lock-entry order as last-write-wins for competing updates to the same id", async () => {
    const rulesPath = path.join(root, "planning-v3", "category-rules.json");
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, `${JSON.stringify({ version: 1, items: [] })}\n`, "utf-8");

    const count = 25;
    await Promise.all(Array.from({ length: count }, (_, index) => upsertRule({
      id: "same-rule",
      categoryId: "food",
      match: { type: "contains", value: `merchant-${index}` },
      priority: index,
      enabled: true,
    })));
    await Promise.all(Array.from({ length: count }, (_, index) => upsertBatchTxnOverride({
      batchId: "same-id-batch",
      txnId: txnId(1),
      categoryId: "food",
      note: `transaction-${index}`,
    })));
    await Promise.all(Array.from({ length: count }, (_, index) => upsertAccountMappingOverride({
      batchId: "same-id-batch",
      txnId: txnId(1),
      accountId: `account-${String(index).padStart(3, "0")}`,
    })));
    await Promise.all(Array.from({ length: count }, (_, index) => upsertTransferOverride({
      batchId: "same-id-batch",
      txnId: txnId(1),
      forceTransfer: index % 2 === 0,
      forceNonTransfer: index % 2 === 1,
      note: `transfer-${index}`,
    })));

    expect((await listRules()).find((rule) => rule.id === "same-rule"))
      .toMatchObject({ priority: count - 1, match: { value: `merchant-${count - 1}` } });
    expect((await getBatchTxnOverrides("same-id-batch"))[txnId(1)])
      .toMatchObject({ note: `transaction-${count - 1}` });
    expect((await getAccountMappingOverrides("same-id-batch"))[txnId(1)])
      .toMatchObject({ accountId: `account-${String(count - 1).padStart(3, "0")}` });
    expect((await getTransferOverrides("same-id-batch"))[txnId(1)])
      .toMatchObject({ forceTransfer: true, note: `transfer-${count - 1}` });
  }, 30_000);

  it("preserves an earlier transaction field when a later competing patch omits it", async () => {
    await Promise.all([
      upsertBatchTxnOverride({
        batchId: "partial-patch-batch",
        txnId: txnId(1),
        kind: "expense",
      }),
      upsertBatchTxnOverride({
        batchId: "partial-patch-batch",
        txnId: txnId(1),
        categoryId: "food",
      }),
    ]);

    expect((await getBatchTxnOverrides("partial-patch-batch"))[txnId(1)])
      .toMatchObject({ kind: "expense", categoryId: "food" });
  });

  it("keeps all parallel batch saves indexed with their transaction files", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => saveBatch(
      batchMeta(index),
      [batchTxn(index)],
    )));

    expect(await listBatches()).toHaveLength(count);
    expect(await listBatchTransactionFileIds()).toHaveLength(count);
  }, 20_000);

  it("removes a newly written transaction file when batch index commit fails", async () => {
    const originalRename = fsPromises.rename.bind(fsPromises);
    vi.spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (String(newPath).endsWith(`${path.sep}index.json`)) {
        throw new Error("injected index commit failure");
      }
      return originalRename(oldPath, newPath);
    });

    await expect(saveBatch(batchMeta(1), [batchTxn(1)])).rejects.toThrow("injected index commit failure");

    expect(await listBatchTransactionFileIds()).toEqual([]);
  }, 10_000);
});
