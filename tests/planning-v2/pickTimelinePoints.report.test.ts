import { describe, expect, it } from "vitest";
import { pickTimelinePoints } from "../../src/lib/planning/v2/report/pickTimelinePoints";

describe("report pickTimelinePoints", () => {
  it("picks start/mid/last rows", () => {
    const rows = Array.from({ length: 6 }).map((_, index) => ({
      monthIndex: index,
      row: {
        income: 100 + index,
        expenses: 50 + index,
        debtPayment: 10 + index,
        operatingCashflow: 40,
        liquidAssets: 1000 + index,
        netWorth: 2000 + index,
        totalDebt: 500 - index,
      },
    }));

    const points = pickTimelinePoints(rows);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ label: "시작", monthIndex: 0 });
    expect(points[1]).toMatchObject({ label: "중간", monthIndex: 2 });
    expect(points[2]).toMatchObject({ label: "마지막", monthIndex: 5 });
  });
});
