import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  IndicatorConfigError,
  loadEffectiveIndicatorConfig,
  writeSeriesSpecOverrides,
} from "../src/lib/planning/v3/indicators/specOverrides";
import { runIndicatorsRefresh } from "../src/lib/planning/v3/indicators/cli/refresh";
import {
  readSeriesObservations,
  readState,
  resolveSeriesPath,
} from "../src/lib/planning/v3/indicators/store";
import {
  readIndicatorsState as readLegacyIndicatorsState,
  writeIndicatorsState as writeLegacyIndicatorsState,
} from "../src/lib/indicators/state";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function writeLegacyConfig(cwd: string): void {
  writeJson(path.join(cwd, "config", "indicators-sources.json"), {
    version: 1,
    sources: [
      {
        id: "ecos",
        name: "ECOS",
        type: "ecos",
        enabled: true,
      },
    ],
  });
  writeJson(path.join(cwd, "config", "indicators-series.json"), {
    version: 1,
    series: [
      {
        id: "shared_series",
        sourceId: "ecos",
        externalId: "legacy://shared",
        name: "Legacy shared",
        frequency: "M",
        transform: "none",
      },
    ],
  });
}

describe("planning v3 indicator refresh owner contract", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses legacy config only as a compatibility base and gives runtime overrides final precedence", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-config-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-root-"));
    roots.push(cwd, rootDir);
    writeLegacyConfig(cwd);
    writeSeriesSpecOverrides([
      {
        id: "shared_series",
        sourceId: "ecos",
        externalId: "override://shared",
        name: "Runtime override",
        frequency: "M",
        transform: "none",
        enabled: true,
      },
    ], rootDir);
    writeJson(path.join(rootDir, "state.json"), {
      lastRunAt: "2026-07-11T00:00:00.000Z",
      sources: {
        ecos: {
          etag: "legacy-etag",
          cursor: "legacy-cursor",
        },
      },
    });

    const effective = loadEffectiveIndicatorConfig({ cwd, rootDir });
    expect(effective.baseSource).toBe("legacy-compat");
    expect(effective.sources.map((row) => row.id)).toContain("ecos");
    expect(effective.specs).toHaveLength(1);
    expect(effective.specs.find((row) => row.id === "shared_series")?.externalId).toBe("override://shared");

    const seenExternalIds: string[] = [];
    const result = await runIndicatorsRefresh({
      cwd,
      rootDir,
      now: new Date("2026-07-12T00:00:00.000Z"),
      retry: { maxAttempts: 1 },
      connectorResolver: (source) => ({
        sourceType: source.type,
        fetchSeries: async (spec) => {
          seenExternalIds.push(spec.externalId);
          return {
            observations: [{ date: "2026-07", value: 1 }],
            meta: {
              sourceId: spec.sourceId,
              externalId: spec.externalId,
              frequency: spec.frequency,
              transform: spec.transform,
            },
          };
        },
      }),
    });

    expect(result.errors).toEqual([]);
    expect(seenExternalIds).toContain("override://shared");
    expect(readState(rootDir)).toMatchObject({
      series: {
        shared_series: {
          observationsCount: 1,
        },
      },
    });
    expect(readState(rootDir).sources).toEqual({
      ecos: {
        etag: "legacy-etag",
        cursor: "legacy-cursor",
      },
    });

    const legacyState = readLegacyIndicatorsState(rootDir);
    expect(legacyState.series?.shared_series?.observationsCount).toBe(1);
    writeLegacyIndicatorsState(legacyState, rootDir);
    expect(readState(rootDir).series.shared_series?.observationsCount).toBe(1);
  });

  it("fails closed when only one legacy compatibility config exists", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-config-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-root-"));
    roots.push(cwd, rootDir);
    writeJson(path.join(cwd, "config", "indicators-sources.json"), {
      version: 1,
      sources: [],
    });

    expect(() => loadEffectiveIndicatorConfig({ cwd, rootDir }))
      .toThrowError(IndicatorConfigError);

    try {
      loadEffectiveIndicatorConfig({ cwd, rootDir });
    } catch (error) {
      expect(error).toMatchObject({ code: "INCOMPLETE_LEGACY_CONFIG" });
    }
  });

  it("rejects the built-in fixture base before a non-dry refresh can write canonical data", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-config-absent-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-root-"));
    roots.push(cwd, rootDir);

    await expect(runIndicatorsRefresh({
      cwd,
      rootDir,
      now: new Date("2026-07-12T00:00:00.000Z"),
    })).rejects.toMatchObject({ code: "UNSAFE_BUILT_IN_CONFIG" });

    expect(fs.readdirSync(rootDir)).toEqual([]);
  });

  it("package runner consumes the same runtime override without dropping legacy source metadata", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-package-"));
    roots.push(temp);
    const planningDataDir = path.join(temp, "planning");
    const rootDir = path.join(temp, "indicators");
    writeSeriesSpecOverrides([
      {
        id: "package_override",
        sourceId: "ecos",
        externalId: "dry://package-override",
        name: "Package override",
        frequency: "M",
        transform: "none",
        enabled: true,
      },
    ], rootDir);
    writeJson(path.join(rootDir, "state.json"), {
      lastRunAt: "2026-07-11T00:00:00.000Z",
      sources: {
        ecos: {
          lastModified: "legacy-last-modified",
        },
      },
    });

    const output = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "scripts/indicators_refresh.mjs",
      "--dry",
    ], {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        PLANNING_DATA_DIR: planningDataDir,
        PLANNING_NAMESPACE_ENABLED: "0",
      },
      timeout: 30_000,
    });

    expect(output.status, output.stderr).toBe(0);
    expect(output.stdout).toContain("config=legacy-compat");
    expect(readState(rootDir).series.package_override).toBeTruthy();
    expect(readState(rootDir).sources?.ecos?.lastModified).toBe("legacy-last-modified");

    const script = fs.readFileSync(path.join(process.cwd(), "scripts", "indicators_refresh.mjs"), "utf-8");
    expect(script).toContain("planning/v3/indicators/cli/refresh.ts");
    expect(script).not.toContain("src/lib/indicators/refresh.ts");
  });

  it("package runner returns a failure exit for partial source errors instead of reporting success", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-package-error-"));
    roots.push(temp);
    const indicatorsRoot = path.join(temp, "indicators");
    const staleSeriesPath = resolveSeriesPath("kr_usdkrw", indicatorsRoot);
    fs.mkdirSync(path.dirname(staleSeriesPath), { recursive: true });
    fs.writeFileSync(staleSeriesPath, Array.from({ length: 21 }, (_, index) => JSON.stringify({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      value: index === 20 ? 100 : index,
    })).join("\n") + "\n", "utf-8");
    const output = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "scripts/indicators_refresh.mjs",
    ], {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        PLANNING_DATA_DIR: path.join(temp, "planning"),
        PLANNING_NAMESPACE_ENABLED: "0",
        BOK_ECOS_API_KEY: "",
        ECOS_API_KEY: "",
      },
      timeout: 30_000,
    });

    expect(output.status).toBe(1);
    expect(output.stderr).toContain("errors=");
    expect(output.stderr).toContain("alerts=skipped reason=partial-refresh");
    expect(readState(indicatorsRoot)).toHaveProperty("series");
    expect(fs.existsSync(path.join(temp, "alerts", "events.jsonl"))).toBe(false);
  });

  it("does not append a second value for the same legacy monthly period", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-period-conflict-"));
    roots.push(rootDir);
    const seriesPath = resolveSeriesPath("monthly_conflict", rootDir);
    fs.mkdirSync(path.dirname(seriesPath), { recursive: true });
    fs.writeFileSync(seriesPath, JSON.stringify({ date: "2026-07-01", value: 1 }) + "\n", "utf-8");

    const result = await runIndicatorsRefresh({
      rootDir,
      sources: [{ id: "fixture", name: "Fixture", type: "fixture", enabled: true }],
      specs: [{
        id: "monthly_conflict",
        sourceId: "fixture",
        externalId: "fixture://monthly_conflict",
        name: "Monthly conflict",
        frequency: "M",
        enabled: true,
      }],
      now: new Date("2026-07-12T00:00:00.000Z"),
      retry: { maxAttempts: 1 },
      connectorResolver: () => ({
        sourceType: "fixture",
        fetchSeries: async (spec) => ({
          observations: [{ date: "2026-07", value: 2 }],
          meta: {
            sourceId: spec.sourceId,
            externalId: spec.externalId,
            frequency: spec.frequency,
          },
        }),
      }),
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        seriesId: "monthly_conflict",
        code: "PARSE",
      }),
    ]);
    expect(readSeriesObservations("monthly_conflict", rootDir)).toEqual([
      { date: "2026-07-01", value: 1 },
    ]);
  });

  it("fails closed on malformed runtime overrides instead of reverting to defaults", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-config-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-root-"));
    roots.push(cwd, rootDir);
    fs.writeFileSync(path.join(rootDir, "specOverrides.json"), "{not-json", "utf-8");

    expect(() => loadEffectiveIndicatorConfig({ cwd, rootDir }))
      .toThrowError(expect.objectContaining({ code: "INVALID_RUNTIME_OVERRIDES" }));
  });

  it("does not overwrite a malformed state file", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicator-state-corrupt-"));
    roots.push(rootDir);
    const statePath = path.join(rootDir, "state.json");
    fs.writeFileSync(statePath, "{not-json", "utf-8");

    await expect(runIndicatorsRefresh({
      rootDir,
      sources: [{ id: "fixture", name: "Fixture", type: "fixture", enabled: true }],
      specs: [{
        id: "state_guard",
        sourceId: "fixture",
        externalId: "fixture://state_guard",
        name: "State guard",
        frequency: "D",
        enabled: true,
      }],
      dry: true,
    })).rejects.toMatchObject({ code: "STORAGE_CORRUPT" });

    expect(fs.readFileSync(statePath, "utf-8")).toBe("{not-json");
  });
});
