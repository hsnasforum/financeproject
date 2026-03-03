import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDraft, getDraft, listDrafts, saveDraft } from "../src/lib/planning/v3/drafts/store";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 drafts store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning-data");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("save/list/get/delete works deterministically with stable sort", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("draft-20260303-a")
      .mockReturnValueOnce("draft-20260303-b");

    vi.setSystemTime(new Date("2026-03-03T10:20:30.000Z"));
    const first = await saveDraft({
      source: "csv",
      meta: { rows: 3, months: 2 },
      cashflow: [
        { ym: "2026-01", incomeKrw: 1_200_000, expenseKrw: -300_000, netKrw: 900_000, txCount: 2 },
        { ym: "2026-02", incomeKrw: 1_200_000, expenseKrw: -250_000, netKrw: 950_000, txCount: 1 },
      ],
      draftPatch: {
        monthlyIncomeNet: 925_000,
        monthlyEssentialExpenses: 385_000,
        monthlyDiscretionaryExpenses: 165_000,
        assumptions: ["monthlyIncomeNet uses median monthly net (assumption)"],
        monthsConsidered: 2,
      },
    });

    vi.setSystemTime(new Date("2026-03-03T10:20:31.000Z"));
    const second = await saveDraft({
      source: "csv",
      meta: { rows: 1, months: 1 },
      cashflow: [
        { ym: "2026-03", incomeKrw: 1_500_000, expenseKrw: -450_000, netKrw: 1_050_000, txCount: 1 },
      ],
      draftPatch: {
        monthlyIncomeNet: 1_050_000,
        monthlyEssentialExpenses: 315_000,
        monthlyDiscretionaryExpenses: 135_000,
        assumptions: ["expense split 70/30 (assumption)"],
        monthsConsidered: 1,
      },
    });

    expect(first.id).toBe("draft-20260303-a");
    expect(second.id).toBe("draft-20260303-b");
    expect(first.createdAt).toBe("2026-03-03T10:20:30.000Z");
    expect(second.createdAt).toBe("2026-03-03T10:20:31.000Z");

    const listed = await listDrafts();
    expect(listed).toEqual([
      {
        id: "draft-20260303-b",
        createdAt: "2026-03-03T10:20:31.000Z",
        source: "csv",
        meta: { rows: 1, months: 1 },
      },
      {
        id: "draft-20260303-a",
        createdAt: "2026-03-03T10:20:30.000Z",
        source: "csv",
        meta: { rows: 3, months: 2 },
      },
    ]);

    expect(await getDraft(first.id)).toEqual(first);
    expect(await getDraft(second.id)).toEqual(second);

    expect(await deleteDraft(first.id)).toBe(true);
    expect(await deleteDraft(first.id)).toBe(false);
    expect(await getDraft(first.id)).toBeNull();
  });
});

