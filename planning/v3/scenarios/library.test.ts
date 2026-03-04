import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_LIBRARY_SSOT,
  loadEffectiveScenarioLibrary,
  mergeScenarioLibraryWithOverrides,
  readScenarioLibraryOverrides,
  writeScenarioLibraryOverrides,
} from "./library";

describe("planning v3 scenario library", () => {
  it("merges enabled/order overrides deterministically", () => {
    const merged = mergeScenarioLibraryWithOverrides(SCENARIO_LIBRARY_SSOT, {
      schemaVersion: 1,
      items: [
        { topicId: "inflation", enabled: false, order: 9 },
        { topicId: "fx", enabled: true, order: 0 },
      ],
    });

    expect(merged[0]?.topicId).toBe("fx");
    expect(merged.find((row) => row.topicId === "inflation")?.enabled).toBe(false);
    expect(merged.every((row, index) => row.order === index)).toBe(true);
  });

  it("writes and reads overrides.json under local scenarios data dir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scenario-library-"));
    const dataDir = path.join(root, ".data", "scenarios");
    writeScenarioLibraryOverrides({
      items: [
        { topicId: "rates", enabled: false, order: 2 },
        { topicId: "fx", enabled: true, order: 0 },
      ],
    }, dataDir);

    const loaded = readScenarioLibraryOverrides(dataDir);
    expect(loaded.items.length).toBe(2);
    expect(loaded.items[0]?.topicId).toBe("fx");
    expect(loaded.items[1]?.topicId).toBe("rates");
    expect(fs.existsSync(path.join(dataDir, "overrides.json"))).toBe(true);
  });

  it("falls back to SSOT templates when all entries are disabled", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scenario-library-fallback-"));
    const dataDir = path.join(root, ".data", "scenarios");
    writeScenarioLibraryOverrides({
      items: SCENARIO_LIBRARY_SSOT.map((row, index) => ({
        topicId: row.topicId,
        enabled: false,
        order: index,
      })),
    }, dataDir);

    const effective = loadEffectiveScenarioLibrary(dataDir);
    expect(effective.templates.length).toBeGreaterThan(0);
    expect(effective.templates.some((row) => row.topicId === "general")).toBe(true);
  });
});
