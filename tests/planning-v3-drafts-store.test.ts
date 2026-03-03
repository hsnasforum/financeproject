import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDraft, deleteDraft, getDraft, listDrafts } from "../src/lib/planning/v3/store/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function sampleDraftInput() {
  return {
    source: {
      kind: "csv" as const,
      filename: "sample.csv",
      rows: 3,
      months: 2,
    },
    cashflow: [
      { ym: "2026-01", incomeKrw: 1_000_000, expenseKrw: -300_000, netKrw: 700_000, txCount: 2 },
      { ym: "2026-02", incomeKrw: 1_200_000, expenseKrw: -200_000, netKrw: 1_000_000, txCount: 1 },
    ],
    draftPatch: {
      monthlyIncomeNet: 850_000,
      monthlyEssentialExpenses: 350_000,
      monthlyDiscretionaryExpenses: 150_000,
      assumptions: ["v3 assumption"],
      monthsConsidered: 2,
    },
  };
}

describe("planning v3 draft store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-store-"));
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

  it("supports create/list/get/delete with file persistence", async () => {
    const created = await createDraft(sampleDraftInput());

    expect(created.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
    expect(created.source.kind).toBe("csv");
    expect(created.source.rows).toBe(3);
    expect(created.source.months).toBe(2);

    const filePath = path.join(root, "v3", "drafts", `${created.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    const onDiskText = fs.readFileSync(filePath, "utf-8");
    const onDisk = JSON.parse(onDiskText) as { id?: string; cashflow?: unknown[] };
    expect(onDisk.id).toBe(created.id);
    expect(Array.isArray(onDisk.cashflow)).toBe(true);

    const listed = await listDrafts();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const loaded = await getDraft(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(created.id);
    expect(loaded?.cashflow).toHaveLength(2);

    await expect(deleteDraft(created.id)).resolves.toBe(true);
    await expect(deleteDraft(created.id)).resolves.toBe(false);
    await expect(getDraft(created.id)).resolves.toBeNull();
    await expect(listDrafts()).resolves.toEqual([]);
  });
});
