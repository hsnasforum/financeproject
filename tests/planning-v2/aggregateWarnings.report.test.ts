import { describe, expect, it } from "vitest";
import { aggregateWarnings, type WarningV2 } from "../../src/lib/planning/v2/report/aggregateWarnings";

describe("report aggregateWarnings", () => {
  it("groups 30 same warning codes into one row", () => {
    const warnings: WarningV2[] = Array.from({ length: 30 }).map((_, index) => ({
      reasonCode: "CONTRIBUTION_SKIPPED",
      message: "현금 부족으로 일부 적립이 건너뛰어졌습니다.",
      month: index + 1,
    }));

    const rows = aggregateWarnings(warnings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "CONTRIBUTION_SKIPPED",
      severity: "warn",
      count: 30,
      firstMonth: 0,
      lastMonth: 29,
    });
  });
});
