import { describe, expect, it } from "vitest";
import { applyPrefsToAlerts, defaultAlertPrefs, mergePrefs, type AlertBuckets } from "../src/lib/dart/alertPreferences";

const prefs = mergePrefs(defaultAlertPrefs(), {
  minScore: 70,
  includeCategories: [],
  excludeFlags: ["정정"],
  maxPerCorp: 2,
  maxItems: 10,
});

function alertsA(): AlertBuckets {
  return {
    generatedAt: "2026-02-26T10:00:00.000Z",
    newHigh: [
      { corpName: "B", categoryLabel: "공급계약/소송", title: "단일판매 공급계약 체결", rceptNo: "2", clusterScore: 85 },
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "1", clusterScore: 90 },
    ],
    newMid: [
      { corpName: "C", categoryLabel: "지배구조/임원", title: "주주총회 소집결의", rceptNo: "3", clusterScore: 72 },
    ],
    updatedHigh: [
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "4", clusterScore: 88 },
    ],
    updatedMid: [],
  };
}

function alertsB(): AlertBuckets {
  return {
    generatedAt: "2026-02-26T10:00:00.000Z",
    newHigh: [
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "1", clusterScore: 90 },
      { corpName: "B", categoryLabel: "공급계약/소송", title: "단일판매 공급계약 체결", rceptNo: "2", clusterScore: 85 },
    ],
    newMid: [
      { corpName: "C", categoryLabel: "지배구조/임원", title: "주주총회 소집결의", rceptNo: "3", clusterScore: 72 },
    ],
    updatedHigh: [
      { corpName: "A", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "4", clusterScore: 88 },
    ],
    updatedMid: [],
  };
}

describe("alerts filter stability", () => {
  it("produces deterministic output regardless of input order", () => {
    const filteredA = applyPrefsToAlerts(alertsA(), prefs);
    const filteredB = applyPrefsToAlerts(alertsB(), prefs);
    expect(filteredA).toEqual(filteredB);
  });
});
