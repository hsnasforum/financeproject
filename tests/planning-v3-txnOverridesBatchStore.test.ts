import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteOverride, getOverrides, upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const TXN_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TXN_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("planning v3 txnOverridesStore batch mode", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-txn-overrides-batch-"));
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

  it("stores overrides per batch with txnId-asc deterministic ordering", async () => {
    await upsertOverride({ batchId: "batch-1", txnId: TXN_B, categoryId: "food" });
    await upsertOverride({ batchId: "batch-1", txnId: TXN_A, categoryId: "housing" });

    const listed = await getOverrides("batch-1");
    expect(Object.keys(listed)).toEqual([TXN_A, TXN_B]);
    expect(listed[TXN_A]?.categoryId).toBe("housing");
    expect(listed[TXN_B]?.categoryId).toBe("food");

    const filePath = path.join(root, "planning-v3", "txn-overrides", "batch-1.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw.indexOf(TXN_A)).toBeLessThan(raw.indexOf(TXN_B));
  });

  it("deleteOverride removes only target txn in target batch", async () => {
    await upsertOverride({ batchId: "batch-1", txnId: TXN_A, categoryId: "food" });
    await upsertOverride({ batchId: "batch-2", txnId: TXN_A, categoryId: "tax" });

    await deleteOverride({ batchId: "batch-1", txnId: TXN_A });
    const b1 = await getOverrides("batch-1");
    const b2 = await getOverrides("batch-2");
    expect(b1[TXN_A]).toBeUndefined();
    expect(b2[TXN_A]?.categoryId).toBe("tax");
  });
});

