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

describe("planning v3 indicators spec overrides", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
    expect(result.seriesProcessed).toBe(loadEffectiveSeriesSpecs(root).length);
    expect(readState(root).series.kr_custom_series).toBeTruthy();
  });
});
