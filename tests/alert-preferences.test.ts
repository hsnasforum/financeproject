import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPrefsToAlerts,
  defaultAlertPrefs,
  mergePrefs,
  type AlertBuckets,
} from "../src/lib/dart/alertPreferences";
import { loadDefaultPrefs } from "../src/lib/dart/alertPreferences.server";

function sampleAlerts(): AlertBuckets {
  return {
    generatedAt: "2026-02-26T10:00:00.000Z",
    newHigh: [
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "10", clusterScore: 95 },
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "[정정] 유상증자 결정", rceptNo: "11", clusterScore: 96 },
    ],
    newMid: [
      { corpName: "B", categoryLabel: "공급계약/소송", title: "단일판매 공급계약 체결", rceptNo: "20", clusterScore: 82 },
      { corpName: "C", categoryLabel: "지배구조/임원", title: "주주총회 소집결의", rceptNo: "30", clusterScore: 65 },
    ],
    updatedHigh: [
      { corpName: "B", categoryLabel: "공급계약/소송", title: "단일판매 공급계약 체결", rceptNo: "21", clusterScore: 84 },
    ],
    updatedMid: [
      { corpName: "D", categoryLabel: "공급계약/소송", title: "(공시서류제출) 소송 등의 제기", rceptNo: "40", clusterScore: 81 },
    ],
  };
}

describe("alert preferences", () => {
  it("loads fallback defaults when preference file is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alert-prefs-"));
    const prefs = loadDefaultPrefs(path.join(tmpDir, "missing.json"));
    expect(prefs).toEqual(defaultAlertPrefs());
  });

  it("filters alerts by score/category/flags and limits", () => {
    const prefs = mergePrefs(defaultAlertPrefs(), {
      minScore: 80,
      includeCategories: ["공급계약/소송", "자본/증자/감자"],
      excludeFlags: ["정정", "공시서류제출"],
      maxPerCorp: 1,
      maxItems: 2,
    });

    const filtered = applyPrefsToAlerts(sampleAlerts(), prefs);
    expect(filtered.newHigh).toHaveLength(1);
    expect(filtered.newHigh[0]?.title).toBe("유상증자 결정");
    expect(filtered.updatedMid).toHaveLength(0);
    expect(filtered.updatedHigh).toHaveLength(1);
    expect(filtered.newMid).toHaveLength(0);
    expect(filtered.newHigh[0]?.clusterScore).toBeGreaterThanOrEqual(filtered.updatedHigh[0]?.clusterScore ?? 0);
  });
});
