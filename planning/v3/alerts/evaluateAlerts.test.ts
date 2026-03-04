import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "./evaluateAlerts";

describe("planning v3 alerts evaluator", () => {
  it("builds deterministic events from topic/indicator triggers", () => {
    const input = {
      generatedAt: "2026-03-04T00:00:00.000Z",
      source: "news:refresh" as const,
      rules: [
        {
          id: "topic_fx_high",
          name: "환율 토픽 급증",
          enabled: true,
          level: "high" as const,
          kind: "topic_burst" as const,
          topicId: "fx",
          minBurstLevel: "상" as const,
          minTodayCount: 2,
        },
        {
          id: "fx_zscore_high",
          name: "환율 zscore",
          enabled: true,
          level: "medium" as const,
          kind: "indicator" as const,
          seriesId: "kr_usdkrw",
          metric: "zscore" as const,
          window: 4,
          condition: "high" as const,
          threshold: 1,
          targetType: "topic" as const,
          targetId: "fx",
        },
      ],
      topicTrends: [
        {
          topicId: "fx",
          topicLabel: "환율/대외",
          todayCount: 5,
          burstLevel: "상" as const,
        },
      ],
      seriesSnapshots: [
        {
          seriesId: "kr_usdkrw",
          observations: [
            { date: "2026-03-01", value: 1300 },
            { date: "2026-03-02", value: 1301 },
            { date: "2026-03-03", value: 1302 },
            { date: "2026-03-04", value: 1360 },
          ],
        },
      ],
    };

    const first = evaluateAlerts(input);
    const second = evaluateAlerts(input);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.some((row) => row.ruleKind === "topic_burst")).toBe(true);
    expect(first.some((row) => row.ruleKind === "indicator")).toBe(true);
    expect(first.every((row) => row.snapshot?.triggerStatus === "met")).toBe(true);
  });
});
