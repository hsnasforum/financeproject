import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readDailyRoutineChecklist,
  resolveRoutineDailyPath,
  saveDailyRoutineChecklist,
} from "./store";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

let root = "";

describe("planning v3 routines store", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-routines-store-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns default checklist when file is missing", () => {
    const checklist = readDailyRoutineChecklist("2026-03-05");
    expect(checklist.date).toBe("2026-03-05");
    expect(checklist.savedAt ?? null).toBeNull();
    expect(checklist.items.length).toBeGreaterThan(0);
    expect(checklist.items.every((row) => row.checked === false)).toBe(true);
  });

  it("saves and re-reads checklist with stable item order", () => {
    const saved = saveDailyRoutineChecklist({
      date: "2026-03-05",
      items: [
        { id: "refresh_news", checked: true },
        { id: "review_scenarios", checked: true },
      ],
    });

    expect(typeof saved.savedAt).toBe("string");
    expect(saved.items[0]?.id).toBe("refresh_news");
    expect(saved.items.find((row) => row.id === "refresh_news")?.checked).toBe(true);
    expect(saved.items.find((row) => row.id === "review_scenarios")?.checked).toBe(true);
    expect(fs.existsSync(resolveRoutineDailyPath("2026-03-05"))).toBe(true);

    const loaded = readDailyRoutineChecklist("2026-03-05");
    expect(loaded.items.find((row) => row.id === "refresh_news")?.checked).toBe(true);
    expect(loaded.items.find((row) => row.id === "write_journal")?.checked).toBe(false);
  });
});
