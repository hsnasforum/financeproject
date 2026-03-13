import { describe, expect, it } from "vitest";
import { diffRuns } from "../../src/lib/planning/v2/diffRuns";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function runFixture(input: {
  id: string;
  endNetWorthKrw: number;
  worstCashKrw: number;
  goalsAchieved: number;
  warnings: string[];
  healthWarnings: string[];
}): PlanningRunRecord {
  return {
    version: 1,
    id: input.id,
    profileId: "profile-1",
    createdAt: "2026-02-28T00:00:00.000Z",
    input: {
      horizonMonths: 120,
    },
    meta: {
      health: {
        warningsCodes: input.healthWarnings,
        criticalCount: 0,
      },
    },
    outputs: {
      simulate: {
        ref: {
          name: "simulate",
          path: `.data/test/planning-v2-diff/${input.id}/simulate.json`,
        },
        summary: {
          endNetWorthKrw: input.endNetWorthKrw,
          worstCashKrw: input.worstCashKrw,
        },
        warnings: input.warnings,
        goalsStatus: [
          { goalId: "g1", achieved: input.goalsAchieved >= 1 },
          { goalId: "g2", achieved: input.goalsAchieved >= 2 },
        ],
        keyTimelinePoints: [],
      },
    },
  };
}

describe("planning v2 diffRuns", () => {
  it("computes metric deltas and warning/health set deltas", () => {
    const base = runFixture({
      id: "run-a",
      endNetWorthKrw: 100_000_000,
      worstCashKrw: 3_000_000,
      goalsAchieved: 1,
      warnings: ["NEGATIVE_CASHFLOW", "GOAL_MISSED"],
      healthWarnings: ["SNAPSHOT_MISSING"],
    });
    const other = runFixture({
      id: "run-b",
      endNetWorthKrw: 120_000_000,
      worstCashKrw: 2_000_000,
      goalsAchieved: 2,
      warnings: ["GOAL_MISSED", "HIGH_DEBT_RATIO"],
      healthWarnings: ["SNAPSHOT_MISSING", "OPTIMISTIC_RETURN"],
    });

    const diff = diffRuns(base, other);
    expect(diff.keyMetrics.endNetWorthDeltaKrw).toBe(20_000_000);
    expect(diff.keyMetrics.worstCashDeltaKrw).toBe(-1_000_000);
    expect(diff.keyMetrics.goalsAchievedDelta).toBe(1);
    expect(diff.warningsDelta).toEqual({
      added: ["HIGH_DEBT_RATIO"],
      removed: ["NEGATIVE_CASHFLOW"],
    });
    expect(diff.healthWarningsDelta).toEqual({
      added: ["OPTIMISTIC_RETURN"],
      removed: [],
    });
  });
});
