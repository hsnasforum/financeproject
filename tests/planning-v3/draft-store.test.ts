import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDraft, deleteDraft, getDraft, listDrafts } from "../../src/lib/planning/v3/drafts/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const marker = "RAW_CSV_SHOULD_NOT_BE_SAVED";

describe("planning v3 draft store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-store-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, ".data", "planning");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("saves, lists, gets and deletes draft without storing raw csv text", async () => {
    const created = await createDraft({
      source: { kind: "csv", filename: "sample.csv" },
      payload: {
        cashflow: [
          { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
        ],
        draftPatch: {
          monthlyIncomeNet: 3_000_000,
          monthlyEssentialExpenses: 1_000_000,
          monthlyDiscretionaryExpenses: 300_000,
        },
      },
      meta: { rows: 3, columns: 4 },
    });

    const injected = {
      source: { kind: "csv", filename: "sample.csv" },
      payload: {
        cashflow: [
          {
            ym: "2026-02",
            incomeKrw: 1_000_000,
            expenseKrw: -400_000,
            netKrw: 600_000,
            txCount: 2,
            narrative: marker,
          },
        ],
        draftPatch: {
          monthlyIncomeNet: 0,
          monthlyEssentialExpenses: 0,
          monthlyDiscretionaryExpenses: 0,
          includeTransfers: true,
          splitMode: "fixed",
          note: marker,
          narrative: marker,
        },
        rawLine: marker,
        originalCsv: marker,
      },
      meta: { rows: 0, columns: 0 },
    } as unknown as Parameters<typeof createDraft>[0];
    const createdUnsafe = await createDraft(injected);

    const listed = await listDrafts();
    expect(listed.length).toBeGreaterThanOrEqual(2);
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const found = await getDraft(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.meta).toEqual({ rowsParsed: 3, columnsCount: 4, warningsCount: 0 });

    const draftPath = path.join(root, ".data", "planning_v3_drafts", `${createdUnsafe.id}.json`);
    const fileText = fs.readFileSync(draftPath, "utf-8");
    expect(fileText.includes(marker)).toBe(false);
    const storedJson = JSON.parse(fileText) as Record<string, unknown>;
    expect(Object.keys(storedJson).sort()).toEqual([
      "createdAt",
      "draftPatch",
      "id",
      "meta",
      "monthlyCashflow",
      "source",
    ]);
    expect(Object.keys((storedJson.meta as Record<string, unknown>) ?? {}).sort()).toEqual([
      "columnsCount",
      "rowsParsed",
      "warningsCount",
    ]);
    const storedUnsafe = await getDraft(createdUnsafe.id);
    expect(storedUnsafe).not.toBeNull();
    expect(Object.keys(storedUnsafe?.draftPatch ?? {}).sort()).toEqual([
      "includeTransfers",
      "monthlyDiscretionaryExpenses",
      "monthlyEssentialExpenses",
      "monthlyIncomeNet",
      "splitMode",
    ]);
    expect(storedUnsafe?.draftPatch.includeTransfers).toBe(true);
    expect(storedUnsafe?.draftPatch.splitMode).toBe("fixed");

    const deleted = await deleteDraft(created.id);
    expect(deleted).toBe(true);
    const missing = await getDraft(created.id);
    expect(missing).toBeNull();
  });
});
