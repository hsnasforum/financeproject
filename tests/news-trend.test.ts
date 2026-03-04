import { describe, expect, it } from "vitest";
import { buildTopicTrendsArtifact, burstLevelFromZ, trimTopicTrendsWindow } from "../src/lib/news/trend";
import { type TopicDailyStat } from "../src/lib/news/types";

function stat(input: Partial<TopicDailyStat> & Pick<TopicDailyStat, "date" | "topicId" | "topicLabel" | "count">): TopicDailyStat {
  return {
    date: input.date,
    topicId: input.topicId,
    topicLabel: input.topicLabel,
    count: input.count,
    scoreSum: input.scoreSum ?? 0,
    sourceDiversity: input.sourceDiversity ?? 0.5,
    topSourceShare: input.topSourceShare ?? 0.5,
    burstZ: input.burstZ ?? 0,
    burstLevel: input.burstLevel ?? "하",
    lowHistory: input.lowHistory ?? true,
  };
}

describe("news trend", () => {
  it("maps burst z-score to 상/중/하 with fixed thresholds", () => {
    expect(burstLevelFromZ(2.1)).toBe("상");
    expect(burstLevelFromZ(1.2)).toBe("중");
    expect(burstLevelFromZ(0.4)).toBe("하");
  });

  it("builds trend artifact and applies low_history when history is short", () => {
    const rows: TopicDailyStat[] = [
      stat({ date: "2026-03-03", topicId: "rates", topicLabel: "금리", count: 2 }),
      stat({ date: "2026-03-04", topicId: "rates", topicLabel: "금리", count: 6 }),
    ];
    const artifact = buildTopicTrendsArtifact({
      generatedAt: "2026-03-04T00:00:00.000Z",
      todayKst: "2026-03-04",
      rows,
      windowDays: 30,
      burstWindowDays: 7,
      historyMinDays: 3,
      highThreshold: 2,
      midThreshold: 1,
    });

    expect(artifact.topics.length).toBe(1);
    expect(artifact.topics[0]?.lowHistory).toBe(true);
    expect(artifact.topics[0]?.burstLevel).toBe("하");
    expect(artifact.topics[0]?.consensusGrade).toBe("low");

    const w7 = trimTopicTrendsWindow(artifact, 7);
    expect(w7.windowDays).toBe(7);
    expect(w7.topics[0]?.series.length).toBeLessThanOrEqual(7);
  });

  it("marks consensus high when source diversity is healthy", () => {
    const rows: TopicDailyStat[] = [
      stat({ date: "2026-02-26", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-02-27", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-02-28", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-03-01", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-03-02", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-03-03", topicId: "rates", topicLabel: "금리", count: 2, sourceDiversity: 0.5, topSourceShare: 0.5 }),
      stat({ date: "2026-03-04", topicId: "rates", topicLabel: "금리", count: 5, sourceDiversity: 0.5, topSourceShare: 0.55 }),
    ];
    const artifact = buildTopicTrendsArtifact({
      generatedAt: "2026-03-04T00:00:00.000Z",
      todayKst: "2026-03-04",
      rows,
      windowDays: 30,
      burstWindowDays: 7,
      historyMinDays: 3,
      highThreshold: 2,
      midThreshold: 1,
    });
    expect(artifact.topics[0]?.consensusGrade).toBe("high");
  });
});
