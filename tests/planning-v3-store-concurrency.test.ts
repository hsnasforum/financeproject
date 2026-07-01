import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccount, listAccounts } from "../src/lib/planning/v3/store/accountsStore";
import { getOpeningBalances, upsertOpeningBalance } from "../src/lib/planning/v3/store/openingBalancesStore";
import {
  listBatches,
  listBatchTransactionFileIds,
  saveBatch,
} from "../src/lib/planning/v3/store/batchesStore";
import { type ImportBatchMeta, type StoredTransaction } from "../src/lib/planning/v3/domain/transactions";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;

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
    delete env.PLANNING_SINGLE_USER_MODE;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningSingleUserMode === "string") env.PLANNING_SINGLE_USER_MODE = originalPlanningSingleUserMode;
    else delete env.PLANNING_SINGLE_USER_MODE;
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
