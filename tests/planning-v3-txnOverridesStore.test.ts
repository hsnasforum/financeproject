import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteLegacyUnscopedTxnOverride,
  listInternalBridgeTxnOverrides,
  listLegacyUnscopedTxnOverrides,
  upsertBatchTxnOverride,
  upsertLegacyUnscopedTxnOverride,
} from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const TXN_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TXN_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("planning v3 txnOverridesStore", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-txn-overrides-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("upserts/deletes overrides and writes deterministic key order", async () => {
    await upsertLegacyUnscopedTxnOverride(TXN_B, { kind: "expense", category: "variable" });
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
    await upsertLegacyUnscopedTxnOverride(TXN_A, { kind: "income", category: "fixed" });

    const listed = await listInternalBridgeTxnOverrides();
    expect(Object.keys(listed)).toEqual([TXN_A, TXN_B]);
    expect(listed[TXN_A]?.kind).toBe("income");
    expect(listed[TXN_B]?.category).toBe("variable");

    const filePath = path.join(root, "v3", "txn-overrides.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const indexA = raw.indexOf(TXN_A);
    const indexB = raw.indexOf(TXN_B);
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThanOrEqual(0);
    expect(indexA).toBeLessThan(indexB);

    await deleteLegacyUnscopedTxnOverride(TXN_A);
    const afterDelete = await listInternalBridgeTxnOverrides();
    expect(afterDelete[TXN_A]).toBeUndefined();
    expect(afterDelete[TXN_B]).toBeDefined();
  });

  it("keeps legacy listing separate from merged internal bridge listing", async () => {
    await upsertLegacyUnscopedTxnOverride(TXN_A, { kind: "expense", category: "variable" });
    await upsertBatchTxnOverride({ batchId: "batch-a", txnId: TXN_B, kind: "income", categoryId: "income" });

    const legacyOnly = await listLegacyUnscopedTxnOverrides();
    const merged = await listInternalBridgeTxnOverrides();

    expect(Object.keys(legacyOnly)).toEqual([TXN_A]);
    expect(legacyOnly[TXN_A]?.batchId).toBe("legacy");
    expect(legacyOnly[TXN_B]).toBeUndefined();

    expect(Object.keys(merged)).toEqual([TXN_A, TXN_B]);
    expect(merged[TXN_B]?.batchId).toBe("batch-a");
  });
});
