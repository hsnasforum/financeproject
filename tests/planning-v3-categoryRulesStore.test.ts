import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteRule, listRules, upsertRule } from "../src/lib/planning/v3/store/categoryRulesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 categoryRulesStore", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-category-rules-"));
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

  it("stores deterministic order by priority desc then id asc", async () => {
    await upsertRule({
      id: "rule-b",
      categoryId: "food",
      match: { type: "contains", value: "food" },
      priority: 100,
      enabled: true,
    });
    await upsertRule({
      id: "rule-a",
      categoryId: "housing",
      match: { type: "contains", value: "rent" },
      priority: 100,
      enabled: true,
    });
    await upsertRule({
      id: "rule-c",
      categoryId: "tax",
      match: { type: "contains", value: "tax" },
      priority: 10,
      enabled: true,
    });

    const rows = await listRules();
    const idxA = rows.findIndex((row) => row.id === "rule-a");
    const idxB = rows.findIndex((row) => row.id === "rule-b");
    const idxC = rows.findIndex((row) => row.id === "rule-c");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxC).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("deleteRule removes existing item", async () => {
    await upsertRule({
      id: "rule-x",
      categoryId: "etc",
      match: { type: "contains", value: "x" },
      priority: 1,
      enabled: true,
    });
    expect(await deleteRule("rule-x")).toBe(true);
    expect((await listRules()).some((row) => row.id === "rule-x")).toBe(false);
  });
});

