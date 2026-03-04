import { describe, expect, it } from "vitest";
import { evaluateScenarioTriggers } from "../src/lib/news/triggerEngine";
import { buildNewsScenarios } from "../src/lib/news/scenarioEngine";
import { type SeriesSnapshot } from "../src/lib/indicators/types";

function snapshot(seriesId: string, values: number[]): SeriesSnapshot {
  const observations = values.map((value, index) => ({
    date: `2026-0${Math.floor(index / 30) + 1}-${String((index % 28) + 1).padStart(2, "0")}`,
    value,
  }));

  return {
    seriesId,
    asOf: "2026-03-04T00:00:00.000Z",
    observations,
    meta: {
      sourceId: "test",
      externalId: seriesId,
      frequency: "D",
      transform: "none",
      lastUpdatedAt: "2026-03-04T00:00:00.000Z",
      observationCount: observations.length,
    },
  };
}

describe("news trigger engine", () => {
  it("returns deterministic trigger evaluation", () => {
    const snapshots = [snapshot("kr_usdkrw", [100, 110, 121]), snapshot("kr_m2", [10, 11, 12, 13, 14])];
    const rules = [
      { label: "fx momentum", expression: "pctChange(kr_usdkrw,1) >= 10" },
      { label: "m2 z", expression: "zscore(kr_m2,5) >= Low" },
    ];

    const first = evaluateScenarioTriggers({ rules, snapshots });
    const second = evaluateScenarioTriggers({ rules, snapshots });
    expect(first).toEqual(second);
  });

  it("returns unknown when required observations are missing", () => {
    const evaluated = evaluateScenarioTriggers({
      rules: [{ label: "fx", expression: "pctChange(kr_usdkrw,3) > 0" }],
      snapshots: [snapshot("kr_usdkrw", [100])],
    });

    expect(evaluated.status).toBe("unknown");
    expect(evaluated.details[0]?.status).toBe("unknown");
  });

  it("handles boundary comparators deterministically", () => {
    const evaluated = evaluateScenarioTriggers({
      rules: [
        { label: "eq-ge", expression: "pctChange(kr_usdkrw,1) >= 10" },
        { label: "eq-gt", expression: "pctChange(kr_usdkrw,1) > 10" },
      ],
      snapshots: [snapshot("kr_usdkrw", [100, 110])],
    });

    expect(evaluated.details[0]?.status).toBe("met");
    expect(evaluated.details[1]?.status).toBe("not_met");
    expect(evaluated.status).toBe("not_met");
  });

  it("binds trigger status into scenario output", () => {
    const pack = buildNewsScenarios({
      generatedAt: "2026-03-04T00:00:00.000Z",
      risingTopics: [{ topicId: "rates", topicLabel: "금리", todayCount: 5, yesterdayCount: 2, delta: 3, ratio: 2.5 }],
      topClusters: [],
      macroSnapshot: {
        asOf: "2026-03-04",
        source: "test",
        values: {},
      },
      indicatorSnapshots: [snapshot("kr_usdkrw", [100, 110, 120]), snapshot("kr_base_rate", [3.5, 3.5, 3.5])],
      triggerTemplates: {
        Base: [{ label: "fx", expression: "pctChange(kr_usdkrw,1) > 0" }],
        Bull: [{ label: "missing", expression: "pctChange(unknown,1) > 0" }],
        Bear: [{ label: "fx", expression: "pctChange(kr_usdkrw,1) < 0" }],
      },
    });

    expect(pack.scenarios).toHaveLength(3);
    expect(pack.scenarios[0]?.triggerStatus).toBe("met");
    expect(pack.scenarios[1]?.triggerStatus).toBe("unknown");
    expect(pack.scenarios[2]?.triggerStatus).toBe("not_met");
  });
});
