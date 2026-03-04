import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "../specs";
import { resolveSeriesPath, resolveStatePath } from "../store";
import { runIndicatorsRefresh } from "./refresh";

describe("planning v3 indicators refresh cli", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes series jsonl and second run appends zero duplicates", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-cli-"));
    roots.push(root);

    const first = await runIndicatorsRefresh({
      rootDir: root,
      sources: INDICATOR_SOURCES,
      specs: INDICATOR_SERIES_SPECS,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(first.errors).toEqual([]);
    expect(first.seriesProcessed).toBe(INDICATOR_SERIES_SPECS.length);
    expect(first.seriesUpdated).toBe(INDICATOR_SERIES_SPECS.length);
    expect(first.observationsAppended).toBeGreaterThan(0);

    for (const spec of INDICATOR_SERIES_SPECS) {
      expect(fs.existsSync(resolveSeriesPath(spec.id, root))).toBe(true);
    }

    const second = await runIndicatorsRefresh({
      rootDir: root,
      sources: INDICATOR_SOURCES,
      specs: INDICATOR_SERIES_SPECS,
      now: new Date("2026-03-04T00:10:00.000Z"),
    });

    expect(second.errors).toEqual([]);
    expect(second.seriesProcessed).toBe(INDICATOR_SERIES_SPECS.length);
    expect(second.seriesUpdated).toBe(0);
    expect(second.observationsAppended).toBe(0);

    expect(fs.existsSync(resolveStatePath(root))).toBe(true);
  });
});
