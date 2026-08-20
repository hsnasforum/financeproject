import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNewsSettings, writeNewsSettings } from "./settings";
import {
  applyImportNewsSources,
  exportNewsSourceList,
  previewImportNewsSources,
} from "./sourceTransfer";

describe("planning v3 news source transfer", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports minimal source list only", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-source-export-"));
    roots.push(root);
    const rows = exportNewsSourceList(root);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["enabled", "url", "weight"]);
  });

  it("round-trips every exported built-in source through import preview", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-source-roundtrip-"));
    roots.push(root);
    const exported = exportNewsSourceList(root);
    const preview = previewImportNewsSources(exported, { rootDir: root });

    expect(preview.issueCount).toBe(0);
    expect(preview.validRows).toBe(exported.length);
    expect(preview.createCount).toBe(0);
    expect(preview.updateCount).toBe(exported.length);
  });

  it("omits quarantined HTTP sources so exports remain importable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-source-legacy-http-"));
    roots.push(root);
    writeNewsSettings({
      sources: [{ id: "kostat_press", enabled: true }],
      topics: [],
      customSources: [{
        id: "legacy_custom",
        name: "Legacy custom",
        feedUrl: "http://feeds.example.com/rss",
        country: "ZZ",
        language: "und",
        weight: 1,
        enabled: true,
      }],
    }, root);

    const exported = exportNewsSourceList(root);
    expect(exported.some((row) => row.url.startsWith("http:"))).toBe(false);
    const preview = previewImportNewsSources(exported, { rootDir: root });
    expect(preview.issueCount).toBe(0);
    expect(preview.validRows).toBe(exported.length);
  });

  it("supports dry-run preview with duplicate filtering", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-source-preview-"));
    roots.push(root);
    const preview = previewImportNewsSources([
      { url: "https://www.federalreserve.gov/feeds/press_all.xml", weight: 1.5, enabled: true },
      { url: "https://www.federalreserve.gov/feeds/press_all.xml", weight: 1.2, enabled: false },
      { url: "https://custom.example.org/rss.xml", weight: 0.9, enabled: true },
    ], { rootDir: root });
    expect(preview.totalInput).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.createCount).toBe(1);
    expect(preview.updateCount).toBe(1);
  });

  it("applies import by updating overrides and creating custom sources", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-source-apply-"));
    roots.push(root);
    const applied = applyImportNewsSources([
      { url: "https://www.federalreserve.gov/feeds/press_all.xml", weight: 1.7, enabled: true },
      { url: "https://custom.example.org/rss.xml", weight: 0.8, enabled: false },
    ], { rootDir: root });

    expect(applied.preview.validRows).toBe(2);
    const settings = readNewsSettings(root);
    expect(settings.sources.find((row) => row.id === "fed_press_all")?.weight).toBe(1.7);
    expect(settings.customSources.length).toBe(1);
    expect(settings.customSources[0]?.feedUrl).toContain("custom.example.org");
    expect(settings.customSources[0]?.enabled).toBe(false);
  });
});
