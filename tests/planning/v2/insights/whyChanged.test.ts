import { describe, expect, it } from "vitest";
import { summarizeRunDiff } from "../../../../src/lib/planning/v2/insights/whyChanged";
import { type ResultDtoV1 } from "../../../../src/lib/planning/v2/resultDto";

function dtoFixture(overrides?: Partial<ResultDtoV1>): ResultDtoV1 {
  const base: ResultDtoV1 = {
    version: 1,
    meta: {
      generatedAt: "2026-03-01T00:00:00.000Z",
      snapshot: { id: "snap-a" },
    },
    summary: {
      endNetWorthKrw: 180_000_000,
      worstCashKrw: 1_200_000,
      worstCashMonthIndex: 10,
      goalsAchieved: { achieved: 2, total: 3 },
      dsrPct: 45,
      criticalWarnings: 0,
      totalWarnings: 1,
    },
    warnings: {
      aggregated: [
        { code: "SNAPSHOT_STALE", severity: "warn", count: 1, sampleMessage: "stale" },
      ],
      top: [],
    },
    goals: [],
    timeline: { points: [] },
    monteCarlo: {
      probabilities: {
        retirementDepletionBeforeEnd: 0.12,
      },
      percentiles: {},
      notes: [],
    },
    raw: {},
  };

  return {
    ...base,
    ...overrides,
    meta: {
      ...base.meta,
      ...(overrides?.meta ?? {}),
      snapshot: {
        ...base.meta.snapshot,
        ...(overrides?.meta?.snapshot ?? {}),
      },
    },
    summary: {
      ...base.summary,
      ...(overrides?.summary ?? {}),
    },
    warnings: {
      ...base.warnings,
      ...(overrides?.warnings ?? {}),
    },
    monteCarlo: overrides?.monteCarlo === undefined
      ? base.monteCarlo
      : overrides.monteCarlo,
  };
}

describe("summarizeRunDiff", () => {
  it("creates at least 3 bullets reflecting key metric and warning changes", () => {
    const base = dtoFixture();
    const compare = dtoFixture({
      summary: {
        endNetWorthKrw: 160_000_000,
        worstCashKrw: -300_000,
        dsrPct: 52,
        goalsAchieved: { achieved: 1, total: 3 },
        totalWarnings: 2,
      },
      warnings: {
        aggregated: [
          { code: "NEGATIVE_CASHFLOW", severity: "critical", count: 2, sampleMessage: "cash" },
          { code: "SNAPSHOT_STALE", severity: "warn", count: 1, sampleMessage: "stale" },
        ],
        top: [],
      },
      monteCarlo: {
        probabilities: {
          retirementDepletionBeforeEnd: 0.31,
        },
        percentiles: {},
        notes: [],
      },
    });

    const summary = summarizeRunDiff({
      base,
      compare,
      baseLabel: "run A",
      compareLabel: "run B",
    });

    expect(summary.headline).toContain("run A");
    expect(summary.bullets.length).toBeGreaterThanOrEqual(3);
    expect(summary.bullets.join(" ")).toContain("최저 현금");
    expect(summary.bullets.join(" ")).toContain("DSR");
    expect(summary.bullets.join(" ")).toContain("경고");
  });
});
