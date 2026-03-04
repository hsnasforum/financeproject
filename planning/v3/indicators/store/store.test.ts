import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSeriesObservations, readSeriesObservations, readState, resolveMetaPath, resolveSeriesPath, resolveStatePath, writeSeriesMeta, writeState } from "./index";

describe("planning v3 indicators store", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("appends observations as jsonl and skips duplicate dates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-store-"));
    roots.push(root);

    const first = appendSeriesObservations("kr_base_rate", [
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
});
