import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateRulesConfig } from "../src/lib/dart/disclosureClassifier";

describe("dart disclosure rules config", () => {
  it("validates config/dart-disclosure-rules.json", () => {
    const configPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
    const result = validateRulesConfig(raw);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.rules.categories.length).toBeGreaterThan(0);
    expect(result.rules.thresholds.high).toBeGreaterThan(result.rules.thresholds.mid);
    expect(result.rules.maxHighlightsPerCorp).toBeGreaterThan(0);
    expect(result.rules.normalization.prefixes.length).toBeGreaterThan(0);
    expect(result.rules.clustering.windowDays).toBeGreaterThan(0);
    expect(result.rules.clustering.maxClusterSize).toBeGreaterThan(0);
    expect(result.rules.clustering.minTokenOverlap).toBeGreaterThanOrEqual(0);
    expect(result.rules.clustering.minTokenOverlap).toBeLessThanOrEqual(1);
  });
});
