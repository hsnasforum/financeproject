import { describe, expect, it } from "vitest";
import { aggregateWarnings, mapGoalStatus } from "../../src/lib/planning/v2/resultGuide";

describe("planning result guide utils", () => {
  it("aggregates repeated warnings into one row", () => {
    const warnings = Array.from({ length: 30 }).map((_, idx) => ({
      reasonCode: "CONTRIBUTION_SKIPPED",
      message: "현금 부족으로 일부 적립이 건너뛰어졌습니다.",
      month: idx + 1,
    }));

    const rows = aggregateWarnings(warnings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "CONTRIBUTION_SKIPPED",
      count: 30,
      firstMonth: 1,
      lastMonth: 30,
    });
  });

  it("maps goals and computes shortfall from target/current when shortfall is missing", () => {
    const rows = mapGoalStatus([
      {
        goalId: "goal-home",
        name: "주택 마련",
        targetMonth: 24,
        targetAmount: 10_000_000,
        currentAmount: 7_250_000,
        achieved: false,
        progressPct: 72.5,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      goalId: "goal-home",
      name: "주택 마련",
      achieved: false,
      targetMonth: 24,
      shortfallKrw: 2_750_000,
    });
  });
});
