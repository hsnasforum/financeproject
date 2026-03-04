import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIndicatorsState, writeIndicatorsState } from "../src/lib/indicators/state";
import { appendSeriesObservations, readSeriesObservations, readSeriesSnapshot } from "../src/lib/indicators/store";
import { type SeriesSpec } from "../src/lib/indicators/types";

describe("indicators store/state", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("appends observations without duplicate dates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-store-"));
    roots.push(root);

    const first = appendSeriesObservations("kr_base_rate", [
      { date: "2026-01-01", value: 3.25 },
      { date: "2026-02-01", value: 3.5 },
    ], root);
    expect(first.appended).toBe(2);

    const second = appendSeriesObservations("kr_base_rate", [
      { date: "2026-02-01", value: 3.5 },
      { date: "2026-03-01", value: 3.5 },
    ], root);
    expect(second.appended).toBe(1);

    const loaded = readSeriesObservations("kr_base_rate", root);
    expect(loaded).toHaveLength(3);
    expect(loaded.map((row) => row.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("reads and writes state safely", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-state-"));
    roots.push(root);

    const empty = readIndicatorsState(root);
    expect(empty.sources).toEqual({});

    writeIndicatorsState({
      lastRunAt: "2026-03-04T00:00:00.000Z",
      sources: {
        ecos: {
          etag: "etag-1",
          lastModified: "Tue, 04 Mar 2026 00:00:00 GMT",
          lastRunAt: "2026-03-04T00:00:00.000Z",
        },
      },
    }, root);

    const loaded = readIndicatorsState(root);
    expect(loaded.sources.ecos?.etag).toBe("etag-1");
  });

  it("builds series snapshot from stored rows", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-snapshot-"));
    roots.push(root);

    appendSeriesObservations("kr_base_rate", [
      { date: "2026-01-01", value: 3.25 },
      { date: "2026-02-01", value: 3.5 },
    ], root);

    const spec: SeriesSpec = {
      id: "kr_base_rate",
      sourceId: "ecos",
      externalId: "722Y001|0101000|||M|202001|209912",
      name: "기준금리",
      frequency: "M",
      transform: "none",
    };
    const snapshot = readSeriesSnapshot(spec, root);
    expect(snapshot.seriesId).toBe("kr_base_rate");
    expect(snapshot.observations).toHaveLength(2);
    expect(snapshot.meta.observationCount).toBe(2);
  });
});
