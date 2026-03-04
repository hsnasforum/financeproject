import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IndicatorSource, SeriesSpec } from "../contracts";
import { ConnectorError } from "../connectors/errors";
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

    const enabledSpecs = INDICATOR_SERIES_SPECS.filter((row) => row.enabled !== false);

    const first = await runIndicatorsRefresh({
      rootDir: root,
      sources: INDICATOR_SOURCES,
      specs: INDICATOR_SERIES_SPECS,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(first.errors).toEqual([]);
    expect(first.seriesProcessed).toBe(enabledSpecs.length);
    expect(first.seriesUpdated).toBe(enabledSpecs.length);
    expect(first.observationsAppended).toBeGreaterThan(0);

    for (const spec of enabledSpecs) {
      expect(fs.existsSync(resolveSeriesPath(spec.id, root))).toBe(true);
    }

    const second = await runIndicatorsRefresh({
      rootDir: root,
      sources: INDICATOR_SOURCES,
      specs: INDICATOR_SERIES_SPECS,
      now: new Date("2026-03-04T00:10:00.000Z"),
    });

    expect(second.errors).toEqual([]);
    expect(second.seriesProcessed).toBe(enabledSpecs.length);
    expect(second.seriesUpdated).toBe(0);
    expect(second.observationsAppended).toBe(0);

    expect(fs.existsSync(resolveStatePath(root))).toBe(true);
  });

  it("retries deterministically on FETCH errors and then succeeds", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-cli-"));
    roots.push(root);

    const sources: IndicatorSource[] = [{ id: "fixture", name: "Fixture", type: "fixture", enabled: true }];
    const specs: SeriesSpec[] = [{
      id: "retry_case",
      sourceId: "fixture",
      externalId: "fixture://retry_case",
      name: "Retry Case",
      frequency: "D",
      enabled: true,
    }];

    let attempts = 0;
    const result = await runIndicatorsRefresh({
      rootDir: root,
      sources,
      specs,
      now: new Date("2026-03-04T00:00:00.000Z"),
      retry: {
        maxAttempts: 2,
        baseDelayMs: 1,
        sleep: async () => {},
      },
      connectorResolver: () => ({
        sourceType: "fixture",
        fetchSeries: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new ConnectorError("FETCH", "temporary network error");
          }
          return {
            observations: [{ date: "2026-03-04", value: 1 }],
            meta: {
              sourceId: "fixture",
              externalId: "fixture://retry_case",
              frequency: "D",
            },
          };
        },
      }),
    });

    expect(attempts).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.observationsAppended).toBe(1);
  });

  it("returns sanitized unified INPUT error without retry", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-ind-cli-"));
    roots.push(root);

    const sources: IndicatorSource[] = [{ id: "fixture", name: "Fixture", type: "fixture", enabled: true }];
    const specs: SeriesSpec[] = [{
      id: "input_error_case",
      sourceId: "fixture",
      externalId: "fixture://input_error_case",
      name: "Input Error Case",
      frequency: "D",
      enabled: true,
    }];

    let attempts = 0;
    const result = await runIndicatorsRefresh({
      rootDir: root,
      sources,
      specs,
      now: new Date("2026-03-04T00:00:00.000Z"),
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1,
        sleep: async () => {},
      },
      connectorResolver: () => ({
        sourceType: "fixture",
        fetchSeries: async () => {
          attempts += 1;
          throw new ConnectorError("INPUT", "api_key=secret invalid spec");
        },
      }),
    });

    expect(attempts).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.code).toBe("INPUT");
    expect(result.errors[0]?.message.includes("secret")).toBe(false);
  });
});
