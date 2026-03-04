import { describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { aggregateDailyTopicCounts, buildTopicDailyStats, computeBurstGrade, computeBurstMetrics } from "./trend";

describe("planning v3 news trend", () => {
  it("computes burst grade from synthetic 7-day baseline", () => {
    const high = computeBurstMetrics(18, [2, 3, 2, 3, 2, 3, 2]);
    const medium = computeBurstMetrics(3, [2, 2, 2, 2, 2, 2, 2]);
    const low = computeBurstMetrics(2, [2, 2, 2, 2, 2, 2, 2]);

    expect(high.burstGrade).toBe("상");
    expect(medium.burstGrade).toBe("중");
    expect(low.burstGrade).toBe("하");
    expect(computeBurstGrade(2.0)).toBe("상");
    expect(computeBurstGrade(1.0)).toBe("중");
    expect(computeBurstGrade(0.99)).toBe("하");
  });

  it("aggregates daily topic counts and assigns deterministic burst", () => {
    const dateKst = "2026-03-04";
    const topicCounts = aggregateDailyTopicCounts(FIXTURE_ITEMS, dateKst, new Date(FIXTURE_NOW_ISO));

    const stats = buildTopicDailyStats({
      dateKst,
      topicCounts,
      historyCountsByTopic: {
        rates: [0, 1, 0, 1, 0, 1, 0],
        fx: [1, 1, 1, 1, 1, 1, 1],
        fiscal: [0, 0, 0, 0, 0, 0, 0],
      },
    });

    expect(stats.length).toBe(2);
    const rates = stats.find((row) => row.topicId === "rates");
    const fx = stats.find((row) => row.topicId === "fx");

    expect(rates?.count).toBe(2);
    expect(rates?.burstGrade).toBe("중");
    expect(fx?.count).toBe(1);
    expect(fx?.burstGrade).toBe("하");
  });
});
