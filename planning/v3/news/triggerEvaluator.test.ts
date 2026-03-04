import { describe, expect, it } from "vitest";
import { type SeriesSnapshot } from "../indicators/contracts";
import { noRecommendationText } from "./digest";
import { SCENARIO_TEMPLATES } from "./scenarioTemplates";
import { evaluateTriggers } from "./triggerEvaluator";

function makeSnapshots(): SeriesSnapshot[] {
  return [
    {
      seriesId: "kr_base_rate",
      asOf: "2026-03-04T00:00:00.000Z",
      observations: [
        { date: "2025-11", value: 3.5 },
        { date: "2025-12", value: 3.5 },
        { date: "2026-01", value: 3.25 },
        { date: "2026-02", value: 3.25 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_base_rate",
        frequency: "M",
      },
    },
    {
      seriesId: "kr_usdkrw",
      asOf: "2026-03-04T00:00:00.000Z",
      observations: [
        { date: "2026-03-01", value: 1341.1 },
        { date: "2026-03-02", value: 1347.8 },
        { date: "2026-03-03", value: 1344.3 },
        { date: "2026-03-04", value: 1342.9 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_usdkrw",
        frequency: "D",
      },
    },
    {
      seriesId: "kr_cpi",
      asOf: "2026-03-04T00:00:00.000Z",
      observations: [
        { date: "2025-10", value: 113.1 },
        { date: "2025-11", value: 113.3 },
        { date: "2025-12", value: 113.6 },
        { date: "2026-01", value: 113.9 },
        { date: "2026-02", value: 114.0 },
        { date: "2026-03", value: 114.3 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_cpi",
        frequency: "M",
      },
    },
  ];
}

describe("planning v3 news trigger evaluator", () => {
  it("is deterministic for same snapshots and template", () => {
    const snapshots = makeSnapshots();
    const template = SCENARIO_TEMPLATES.find((row) => row.name === "Base");
    expect(template).toBeTruthy();

    const first = evaluateTriggers(snapshots, template!);
    const second = evaluateTriggers(snapshots, template!);

    expect(first).toStrictEqual(second);
    expect(["met", "not_met", "unknown"]).toContain(first.status);
    expect(first.evaluations.length).toBeGreaterThan(0);
  });

  it("returns unknown status safely when required series is missing", () => {
    const template = SCENARIO_TEMPLATES.find((row) => row.name === "Bear");
    expect(template).toBeTruthy();

    const run = () => evaluateTriggers([], template!);
    expect(run).not.toThrow();

    const result = run();
    expect(result.status).toBe("unknown");
    expect(result.evaluations.every((row) => row.status === "unknown")).toBe(true);
  });

  it("rationale text remains non-imperative", () => {
    const snapshots = makeSnapshots();
    const template = SCENARIO_TEMPLATES.find((row) => row.name === "Bull");
    expect(template).toBeTruthy();

    const result = evaluateTriggers(snapshots, template!);
    const lines = [result.rationale, ...result.evaluations.map((row) => row.rationale)];

    for (const line of lines) {
      expect(noRecommendationText(line)).toBe(true);
      expect(line).not.toMatch(/매수|매도|정답|무조건|확실|해야\s*한다/);
    }
  });
});
