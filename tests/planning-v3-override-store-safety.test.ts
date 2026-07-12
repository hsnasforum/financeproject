import { createHash } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccountMappingOverrides,
  upsertAccountMappingOverride,
} from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { deleteRule, listRules, upsertRule } from "../src/lib/planning/v3/store/categoryRulesStore";
import {
  getBatchTxnOverrides,
  listInternalBridgeTxnOverrides,
  upsertBatchTxnOverride,
} from "../src/lib/planning/v3/store/txnOverridesStore";
import {
  getTransferOverrides,
  upsertTransferOverride,
} from "../src/lib/planning/v3/store/txnTransferOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;
const storePathEnvKeys = [
  "PLANNING_V3_CATEGORY_RULES_PATH",
  "PLANNING_V3_TXN_OVERRIDES_DIR",
  "PLANNING_V3_TXN_OVERRIDES_PATH",
  "PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR",
  "PLANNING_V3_TXN_TRANSFER_OVERRIDES_DIR",
] as const;
const originalStorePathEnv = Object.fromEntries(
  storePathEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof storePathEnvKeys)[number], string | undefined>;

const BATCH_ID = "safety-batch";
const TXN_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

type StoreAdapter = {
  name: string;
  filePath: string;
  read: () => Promise<unknown>;
  mutate: () => Promise<unknown>;
};

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("planning v3 override store safety contract", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-override-safety-"));
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
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function adapters(): StoreAdapter[] {
    const planningV3Root = path.join(root, "planning-v3");
    return [
      {
        name: "category rules",
        filePath: path.join(planningV3Root, "category-rules.json"),
        read: () => listRules(),
        mutate: () => upsertRule({
          id: "safety-rule",
          categoryId: "food",
          match: { type: "contains", value: "merchant" },
          priority: 1,
          enabled: true,
        }),
      },
      {
        name: "transaction overrides",
        filePath: path.join(planningV3Root, "txn-overrides", `${BATCH_ID}.json`),
        read: () => getBatchTxnOverrides(BATCH_ID),
        mutate: () => upsertBatchTxnOverride({
          batchId: BATCH_ID,
          txnId: TXN_ID,
          categoryId: "food",
        }),
      },
      {
        name: "account mapping overrides",
        filePath: path.join(planningV3Root, "txn-account-overrides", `${BATCH_ID}.json`),
        read: () => getAccountMappingOverrides(BATCH_ID),
        mutate: () => upsertAccountMappingOverride({
          batchId: BATCH_ID,
          txnId: TXN_ID,
          accountId: "checking-account",
        }),
      },
      {
        name: "transfer overrides",
        filePath: path.join(planningV3Root, "txn-transfer-overrides", `${BATCH_ID}.json`),
        read: () => getTransferOverrides(BATCH_ID),
        mutate: () => upsertTransferOverride({
          batchId: BATCH_ID,
          txnId: TXN_ID,
          forceTransfer: true,
        }),
      },
    ];
  }

  it("keeps ENOENT default semantics for every store", async () => {
    const [category, transaction, accountMapping, transfer] = adapters();

    expect(await category.read()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "income-salary-ko" }),
    ]));
    expect(await transaction.read()).toEqual({});
    expect(await accountMapping.read()).toEqual({});
    expect(await transfer.read()).toEqual({});
  });

  it("treats a valid empty category rules file as an intentional empty configuration", async () => {
    const filePath = adapters()[0].filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, items: [] })}\n`, "utf-8");

    expect(await listRules()).toEqual([]);

    await upsertRule({
      id: "only-rule",
      categoryId: "food",
      match: { type: "contains", value: "merchant" },
      priority: 1,
      enabled: true,
    });
    expect(await deleteRule("only-rule")).toBe(true);
    expect(await listRules()).toEqual([]);
  });

  it("rejects malformed JSON mutations with a typed error and preserves the original checksum", async () => {
    for (const adapter of adapters()) {
      fs.mkdirSync(path.dirname(adapter.filePath), { recursive: true });
      fs.writeFileSync(adapter.filePath, '{"version":1,"items":', "utf-8");
      const before = sha256(adapter.filePath);

      await expect(adapter.mutate(), adapter.name).rejects.toMatchObject({
        name: "StorageCorruptedError",
        code: "STORAGE_CORRUPT",
        filePath: adapter.filePath,
      });
      expect(sha256(adapter.filePath), adapter.name).toBe(before);
    }
  });

  it("rejects invalid envelopes with a typed error and preserves the original checksum", async () => {
    for (const adapter of adapters()) {
      fs.mkdirSync(path.dirname(adapter.filePath), { recursive: true });
      fs.writeFileSync(adapter.filePath, `${JSON.stringify({ version: 2, items: null })}\n`, "utf-8");
      const before = sha256(adapter.filePath);

      await expect(adapter.mutate(), adapter.name).rejects.toMatchObject({
        name: "StorageCorruptedError",
        code: "STORAGE_CORRUPT",
        filePath: adapter.filePath,
      });
      expect(sha256(adapter.filePath), adapter.name).toBe(before);
    }
  });

  it("keeps tolerant reads but blocks mutations when a valid envelope contains invalid rows", async () => {
    const [category, transaction, accountMapping, transfer] = adapters();
    const fixtures: Array<{ adapter: StoreAdapter; payload: unknown; expectedKey: string }> = [
      {
        adapter: category,
        payload: {
          version: 1,
          items: [
            { id: "valid-rule", categoryId: "food", match: { type: "contains", value: "merchant" }, priority: 1, enabled: true },
            { id: "invalid-rule", categoryId: "not-supported", match: { type: "contains", value: "bad" } },
          ],
        },
        expectedKey: "valid-rule",
      },
      {
        adapter: transaction,
        payload: {
          version: 1,
          items: {
            aaaaaaaaaaaaaaaaaaaaaaaa: { batchId: BATCH_ID, txnId: TXN_ID, categoryId: "food", updatedAt: "2026-07-11T00:00:00.000Z" },
            bbbbbbbbbbbbbbbbbbbbbbbb: { batchId: BATCH_ID, txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", categoryId: "bad", updatedAt: "2026-07-11T00:00:00.000Z" },
          },
        },
        expectedKey: TXN_ID,
      },
      {
        adapter: accountMapping,
        payload: {
          version: 1,
          items: {
            aaaaaaaaaaaaaaaaaaaaaaaa: { batchId: BATCH_ID, txnId: TXN_ID, accountId: "account-main", updatedAt: "2026-07-11T00:00:00.000Z" },
            bbbbbbbbbbbbbbbbbbbbbbbb: { batchId: BATCH_ID, txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", accountId: "", updatedAt: "2026-07-11T00:00:00.000Z" },
          },
        },
        expectedKey: TXN_ID,
      },
      {
        adapter: transfer,
        payload: {
          version: 1,
          items: {
            aaaaaaaaaaaaaaaaaaaaaaaa: { batchId: BATCH_ID, txnId: TXN_ID, forceTransfer: true, updatedAt: "2026-07-11T00:00:00.000Z" },
            bbbbbbbbbbbbbbbbbbbbbbbb: { batchId: BATCH_ID, txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", updatedAt: "2026-07-11T00:00:00.000Z" },
          },
        },
        expectedKey: TXN_ID,
      },
    ];

    for (const fixture of fixtures) {
      fs.mkdirSync(path.dirname(fixture.adapter.filePath), { recursive: true });
      fs.writeFileSync(fixture.adapter.filePath, `${JSON.stringify(fixture.payload)}\n`, "utf-8");
      const before = sha256(fixture.adapter.filePath);
      const read = await fixture.adapter.read();
      const keys = Array.isArray(read)
        ? read.map((row) => String((row as { id?: unknown }).id ?? ""))
        : Object.keys(read as Record<string, unknown>);
      expect(keys, fixture.adapter.name).toEqual([fixture.expectedKey]);

      await expect(fixture.adapter.mutate(), fixture.adapter.name).rejects.toMatchObject({
        name: "StorageCorruptedError",
        code: "STORAGE_CORRUPT",
        filePath: fixture.adapter.filePath,
      });
      expect(sha256(fixture.adapter.filePath), fixture.adapter.name).toBe(before);
    }
  });

  it("wraps atomic write failures as unavailable errors and preserves existing files", async () => {
    const storeAdapters = adapters();
    for (const adapter of storeAdapters) {
      fs.mkdirSync(path.dirname(adapter.filePath), { recursive: true });
      const emptyItems = adapter.name === "category rules" ? [] : {};
      fs.writeFileSync(adapter.filePath, `${JSON.stringify({ version: 1, items: emptyItems })}\n`, "utf-8");
    }

    const originalRename = fsPromises.rename.bind(fsPromises);
    vi.spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (storeAdapters.some((adapter) => path.resolve(String(newPath)) === path.resolve(adapter.filePath))) {
        throw Object.assign(new Error("injected write permission failure"), { code: "EACCES" });
      }
      return originalRename(oldPath, newPath);
    });

    for (const adapter of storeAdapters) {
      const before = sha256(adapter.filePath);
      await expect(adapter.mutate(), adapter.name).rejects.toMatchObject({
        name: "StorageUnavailableError",
        code: "STORAGE_UNAVAILABLE",
        filePath: adapter.filePath,
      });
      expect(sha256(adapter.filePath), adapter.name).toBe(before);
    }
  });

  it("does not collapse unavailable file reads into empty/default state", async () => {
    for (const adapter of adapters()) {
      fs.mkdirSync(adapter.filePath, { recursive: true });

      await expect(adapter.read(), adapter.name).rejects.toMatchObject({
        name: "StorageUnavailableError",
        code: "STORAGE_UNAVAILABLE",
        filePath: adapter.filePath,
      });
    }
  });

  it("does not collapse an unavailable transaction override directory into an empty bridge result", async () => {
    const overridesDir = path.join(root, "planning-v3", "txn-overrides");
    fs.mkdirSync(path.dirname(overridesDir), { recursive: true });
    fs.writeFileSync(overridesDir, "not-a-directory", "utf-8");

    await expect(listInternalBridgeTxnOverrides()).rejects.toMatchObject({
      name: "StorageUnavailableError",
      code: "STORAGE_UNAVAILABLE",
      filePath: overridesDir,
    });
  });
});
