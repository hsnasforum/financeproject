import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSeriesObservations, resolveIndicatorsRoot } from "../src/lib/indicators/store";
import { buildWatchlistValues, queryIndicatorSeries } from "../src/lib/indicators/query";

describe("indicators query", () => {
  const roots: string[] = [];

  function createCwdFixture(): string {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-query-"));
    roots.push(cwd);
    fs.mkdirSync(path.join(cwd, "config"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "config", "indicators-series.json"), `${JSON.stringify({
      version: 1,
      series: [
        {
          id: "series_a",
          sourceId: "ecos",
          externalId: "dummy",
          name: "series A",
          frequency: "M",
        },
      ],
    }, null, 2)}\n`, "utf-8");
    return cwd;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("computes last/pctChange/zscore deterministically", () => {
    const cwd = createCwdFixture();
    const rootDir = resolveIndicatorsRoot(cwd);

    appendSeriesObservations("series_a", [
      { date: "2026-01-01", value: 100 },
      { date: "2026-02-01", value: 105 },
      { date: "2026-03-01", value: 110 },
      { date: "2026-04-01", value: 120 },
    ], rootDir);

    const last = queryIndicatorSeries({ cwd, seriesId: "series_a", view: "last" });
    expect(last.status).toBe("ok");
    expect(last.valueSummary).toContain("120");

    const pct = queryIndicatorSeries({ cwd, seriesId: "series_a", view: "pctChange", window: 3 });
    expect(pct.status).toBe("ok");
    expect(pct.valueSummary).toContain("+20");

    const zscore = queryIndicatorSeries({ cwd, seriesId: "series_a", view: "zscore", window: 4 });
    expect(zscore.status).toBe("ok");
    expect(zscore.valueSummary).toContain("σ");
  });

  it("returns unknown when data is insufficient", () => {
    const cwd = createCwdFixture();
    const rootDir = resolveIndicatorsRoot(cwd);
    appendSeriesObservations("series_a", [{ date: "2026-04-01", value: 120 }], rootDir);

    const pct = queryIndicatorSeries({ cwd, seriesId: "series_a", view: "pctChange", window: 3 });
    const zscore = queryIndicatorSeries({ cwd, seriesId: "series_a", view: "zscore", window: 12 });

    expect(pct.status).toBe("unknown");
    expect(zscore.status).toBe("unknown");
  });

  it("buildWatchlistValues keeps unknown for missing series", () => {
    const cwd = createCwdFixture();

    const rows = buildWatchlistValues({
      cwd,
      specs: [
        { label: "existing", seriesId: "series_a", view: "last", window: 1 },
        { label: "missing", seriesId: "series_missing", view: "last", window: 1 },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("unknown");
    expect(rows[1]?.status).toBe("unknown");
  });
});
