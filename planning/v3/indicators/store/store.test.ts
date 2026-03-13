import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSeriesObservations, readSeriesObservations, readState, resolveMetaPath, resolveSeriesPath, resolveStatePath, writeSeriesMeta, writeState } from "./index";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 indicators store", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
  });

  it("appends observations as jsonl and skips duplicate dates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-store-"));
    roots.push(root);

    const first = appendSeriesObservations("KR_BOK_BASE_RATE", [
      { date: "2026-01", value: 3.25 },
      { date: "2026-02", value: 3.25 },
    ], root);

    expect(first.appended).toBe(2);
    expect(first.skippedDuplicate).toBe(0);

    const second = appendSeriesObservations("kr_base_rate", [
      { date: "2026-02", value: 3.25 },
      { date: "2026-03", value: 3.0 },
    ], root);

    expect(second.appended).toBe(1);
    expect(second.skippedDuplicate).toBe(1);

    const seriesPath = resolveSeriesPath("kr_base_rate", root);
    expect(fs.existsSync(seriesPath)).toBe(true);

    const rows = readSeriesObservations("kr_base_rate", root);
    expect(rows.map((row) => row.date)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("writes state and per-series meta", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-store-"));
    roots.push(root);

    writeState({
      lastRunAt: "2026-03-04T00:00:00.000Z",
      series: {
        kr_base_rate: {
          updatedAt: "2026-03-04T00:00:00.000Z",
          lastObservationDate: "2026-02",
          observationsCount: 2,
        },
      },
    }, root);

    const statePath = resolveStatePath(root);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(readState(root).series.kr_base_rate?.observationsCount).toBe(2);

    writeSeriesMeta({
      seriesId: "kr_base_rate",
      asOf: "2026-03-04T00:00:00.000Z",
      observations: [{ date: "2026-02", value: 3.25 }],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_base_rate",
        frequency: "M",
      },
    }, root);

    expect(fs.existsSync(resolveMetaPath("kr_base_rate", root))).toBe(true);
  });

  it("uses PLANNING_DATA_DIR for default root at call time", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-store-env-"));
    roots.push(root);
    env.PLANNING_DATA_DIR = path.join(root, "planning");

    const appendResult = appendSeriesObservations("kr_base_rate", [
      { date: "2026-03", value: 3.0 },
    ]);
    expect(appendResult.appended).toBe(1);

    writeState({
      lastRunAt: "2026-03-05T00:00:00.000Z",
      series: {
        kr_base_rate: {
          updatedAt: "2026-03-05T00:00:00.000Z",
          lastObservationDate: "2026-03",
          observationsCount: 1,
        },
      },
    });

    expect(resolveSeriesPath("kr_base_rate")).toBe(path.join(root, "indicators", "series", "kr_base_rate.jsonl"));
    expect(resolveStatePath()).toBe(path.join(root, "indicators", "state.json"));
    expect(readSeriesObservations("kr_base_rate")).toHaveLength(1);
    expect(readState().series.kr_base_rate?.observationsCount).toBe(1);
  });
});
