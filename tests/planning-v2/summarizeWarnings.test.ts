import { describe, expect, it } from "vitest";
import { aggregateWarnings } from "../../src/lib/planning/v2/report/warningsAggregate";
import { type SimulationWarningV2 } from "../../src/lib/planning/v2/types";

describe("aggregateWarnings", () => {
  it("groups repeated warnings into one row with count", () => {
    const warnings: SimulationWarningV2[] = Array.from({ length: 30 }).map((_, idx) => ({
      reasonCode: "CONTRIBUTION_SKIPPED",
      message: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
      month: idx + 1,
    }));

    const grouped = aggregateWarnings(warnings);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      code: "CONTRIBUTION_SKIPPED",
      severity: "warn",
      count: 30,
      months: { first: 0, last: 29 },
    });
  });

  it("sorts by severity first and count next", () => {
    const warnings: SimulationWarningV2[] = [
      { reasonCode: "GOAL_REACHED", message: "goal reached" },
      { reasonCode: "NEGATIVE_CASHFLOW", message: "negative", month: 2 },
      { reasonCode: "NEGATIVE_CASHFLOW", message: "negative", month: 3 },
      { reasonCode: "CONTRIBUTION_SKIPPED", message: "skipped", month: 5 },
      { reasonCode: "CONTRIBUTION_SKIPPED", message: "skipped", month: 7 },
      { reasonCode: "CONTRIBUTION_SKIPPED", message: "skipped", month: 8 },
      { reasonCode: "HIGH_DEBT_RATIO", message: "debt", month: 1 },
    ];

    const grouped = aggregateWarnings(warnings);
    expect(grouped.map((item) => item.code)).toEqual([
      "NEGATIVE_CASHFLOW",
      "CONTRIBUTION_SKIPPED",
      "HIGH_DEBT_RATIO",
      "GOAL_REACHED",
    ]);
  });

  it("reads legacy data.monthIndex when meta.monthIndex is absent", () => {
    const warnings: SimulationWarningV2[] = [
      ({
        reasonCode: "CONTRIBUTION_SKIPPED",
        message: "legacy data",
        data: { monthIndex: 2 },
      } as unknown as SimulationWarningV2),
      {
        reasonCode: "CONTRIBUTION_SKIPPED",
        message: "legacy data",
        month: 7,
      },
    ];

    const grouped = aggregateWarnings(warnings);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      code: "CONTRIBUTION_SKIPPED",
      count: 2,
      months: { first: 2, last: 6 },
    });
  });
});
