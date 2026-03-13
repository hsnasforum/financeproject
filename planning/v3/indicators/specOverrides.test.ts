import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIndicatorsRefresh } from "./cli/refresh";
import {
  applyImportSeriesSpecs,
  exportSeriesSpecList,
  loadEffectiveSeriesSpecs,
  previewImportSeriesSpecs,
  readSeriesSpecOverrides,
} from "./specOverrides";
import { readState } from "./store";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 indicators spec overrides", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
  });

  it("exports effective series specs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ind-v3-spec-export-"));
    roots.push(root);
    const specs = exportSeriesSpecList(root);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((row) => typeof row.externalId === "string")).toBe(true);
  });

  it("supports strict dry-run preview", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ind-v3-spec-preview-"));
    roots.push(root);
    const preview = previewImportSeriesSpecs([
      {
        id: "KR_NEW_INDEX",
        sourceId: "fixture",
        externalId: "fixture://kr_new_index",
        name: "KR New Index",
        frequency: "M",
        transform: "none",
        enabled: true,
      },
      {
        id: "KR_NEW_INDEX",
        sourceId: "fixture",
        externalId: "fixture://kr_new_index_dup",
        name: "KR New Index Dup",
        frequency: "M",
        transform: "none",
        enabled: true,
      },
      {
        id: "bad_source",
        sourceId: "unknown",
        externalId: "x",
        name: "x",
        frequency: "M",
        enabled: true,
      },
    ], root);
    expect(preview.validRows).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.issueCount).toBe(2);
  });

  it("applies overrides and refresh uses merged specs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ind-v3-spec-apply-"));
    roots.push(root);
    const applied = applyImportSeriesSpecs([
      {
        id: "kr_custom_series",
        sourceId: "fixture",
        externalId: "fixture://kr_cpi",
        name: "KR Custom Series",
        frequency: "M",
        transform: "none",
        enabled: true,
      },
    ], root);

    expect(applied.preview.validRows).toBe(1);
    expect(readSeriesSpecOverrides(root).specs.length).toBe(1);
    expect(loadEffectiveSeriesSpecs(root).some((row) => row.id === "kr_custom_series")).toBe(true);

    const result = await runIndicatorsRefresh({ rootDir: root, retry: { maxAttempts: 1 } });
    expect(result.seriesProcessed).toBe(loadEffectiveSeriesSpecs(root).filter((row) => row.enabled !== false).length);
    expect(readState(root).series.kr_custom_series).toBeTruthy();
  });

  it("uses PLANNING_DATA_DIR for default override root at call time", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ind-v3-spec-env-"));
    roots.push(root);
    env.PLANNING_DATA_DIR = path.join(root, "planning");

    const preview = previewImportSeriesSpecs([{
      id: "kr_env_series",
      sourceId: "fixture",
      externalId: "fixture://kr_env_series",
      name: "KR Env Series",
      frequency: "M",
      transform: "none",
      enabled: true,
    }]);
    expect(preview.createCount).toBe(1);

    const applied = applyImportSeriesSpecs([{
      id: "kr_env_series",
      sourceId: "fixture",
      externalId: "fixture://kr_env_series",
      name: "KR Env Series",
      frequency: "M",
      transform: "none",
      enabled: true,
    }]);
    expect(applied.overridesCount).toBe(1);
    expect(fs.existsSync(path.join(root, "indicators", "specOverrides.json"))).toBe(true);
    expect(loadEffectiveSeriesSpecs().some((row) => row.id === "kr_env_series")).toBe(true);
  });
});
