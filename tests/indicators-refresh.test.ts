import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIndicatorsRefresh } from "../src/lib/indicators/refresh";
import { readSeriesObservations, resolveSeriesPath } from "../src/lib/indicators/store";

describe("indicators refresh", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dry run creates local series files and keeps second run idempotent", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-refresh-"));
    roots.push(root);
    const now = new Date("2026-03-04T00:00:00.000Z");

    const first = await runIndicatorsRefresh({
      cwd: process.cwd(),
      rootDir: root,
      now,
      dry: true,
    });
    expect(first.sourcesProcessed).toBeGreaterThan(0);
    expect(first.seriesProcessed).toBeGreaterThan(0);
    expect(first.seriesUpdated).toBeGreaterThan(0);
    expect(first.observationsAppended).toBeGreaterThan(0);
    expect(first.errors).toHaveLength(0);

    const oneSeriesPath = resolveSeriesPath("kr_base_rate", root);
    expect(fs.existsSync(oneSeriesPath)).toBe(true);
    expect(readSeriesObservations("kr_base_rate", root).length).toBeGreaterThan(0);

    const second = await runIndicatorsRefresh({
      cwd: process.cwd(),
      rootDir: root,
      now,
      dry: true,
    });
    expect(second.observationsAppended).toBe(0);
    expect(second.errors).toHaveLength(0);
  });
});
