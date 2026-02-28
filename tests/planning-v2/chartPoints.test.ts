import { describe, expect, it } from "vitest";
import { buildPlanningChartPoints } from "../../src/lib/planning/v2/chartPoints";

describe("buildPlanningChartPoints", () => {
  it("builds chart points from full timeline rows", () => {
    const points = buildPlanningChartPoints({
      timeline: [
        { month: 0, netWorth: 1_000_000, liquidAssets: 300_000, totalDebt: 5_000_000 },
        { month: 1, netWorth: 1_050_000, liquidAssets: 320_000, totalDebt: 4_960_000 },
      ],
    });

    expect(points).toEqual([
      { monthIndex: 0, netWorthKrw: 1_000_000, cashKrw: 300_000, totalDebtKrw: 5_000_000 },
      { monthIndex: 1, netWorthKrw: 1_050_000, cashKrw: 320_000, totalDebtKrw: 4_960_000 },
    ]);
  });

  it("falls back to keyTimelinePoints when timeline is missing", () => {
    const points = buildPlanningChartPoints({
      keyTimelinePoints: [
        {
          monthIndex: 0,
          row: { netWorth: 2_000_000, liquidAssets: 500_000, totalDebt: 3_000_000 },
        },
        {
          monthIndex: 12,
          row: { netWorth: 2_500_000, liquidAssets: 900_000, totalDebt: 2_300_000 },
        },
      ],
    });

    expect(points).toEqual([
      { monthIndex: 0, netWorthKrw: 2_000_000, cashKrw: 500_000, totalDebtKrw: 3_000_000 },
      { monthIndex: 12, netWorthKrw: 2_500_000, cashKrw: 900_000, totalDebtKrw: 2_300_000 },
    ]);
  });

  it("sorts by month and removes invalid/duplicate points", () => {
    const points = buildPlanningChartPoints({
      timeline: [
        { month: 12, netWorthKrw: 1_200_000, cashKrw: 600_000, totalDebtKrw: 2_500_000 },
        { month: 0, netWorthKrw: 900_000, cashKrw: 300_000, totalDebtKrw: 3_000_000 },
        { month: 12, netWorthKrw: 1_250_000, cashKrw: 650_000, totalDebtKrw: 2_400_000 },
        { month: 24, netWorthKrw: null, cashKrw: 700_000, totalDebtKrw: 2_100_000 },
      ],
    });

    expect(points).toEqual([
      { monthIndex: 0, netWorthKrw: 900_000, cashKrw: 300_000, totalDebtKrw: 3_000_000 },
      { monthIndex: 12, netWorthKrw: 1_200_000, cashKrw: 600_000, totalDebtKrw: 2_500_000 },
    ]);
  });
});
