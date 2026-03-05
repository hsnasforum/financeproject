import { describe, expect, it } from "vitest";
import { type NewsItem } from "../contracts";
import { computeDailyStats } from "./computeDailyStats";

const NOW = new Date("2026-03-04T12:00:00.000Z");

const ITEMS: NewsItem[] = [
  {
    id: "i1",
    sourceId: "s1",
    title: "Rate hike discussion continues",
    url: "https://example.com/1",
    publishedAt: "2026-03-04T09:00:00.000Z",
    snippet: "rate hike",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "i2",
    sourceId: "s2",
    title: "Rate cut expectations rise",
    url: "https://example.com/2",
    publishedAt: "2026-03-04T08:00:00.000Z",
    snippet: "rate cut",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "i3",
    sourceId: "s2",
    title: "USDKRW moves higher",
    url: "https://example.com/3",
    publishedAt: "2026-03-04T07:00:00.000Z",
    snippet: "usdkrw",
    fetchedAt: NOW.toISOString(),
  },
];

describe("planning v3 news trend computeDailyStats", () => {
  it("aggregates by (date, topic) with count/scoreSum/sourceDiversity", () => {
    const rows = computeDailyStats({
      items: ITEMS,
      dateKst: "2026-03-04",
      now: NOW,
      historyByTopic: {
        rates: [
          { dateKst: "2026-02-26", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-02-27", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-02-28", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-03-01", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-03-02", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-03-03", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
          { dateKst: "2026-03-03", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 1, sourceDiversity: 1, burstGrade: "Low" },
        ],
      },
    });

    const rates = rows.find((row) => row.topicId === "rates");
    expect(rates).toBeTruthy();
    expect(rates?.count).toBe(2);
    expect((rates?.scoreSum ?? 0) > 0).toBe(true);
    expect((rates?.sourceDiversity ?? 0) > 0).toBe(true);
  });

  it("is deterministic for same input", () => {
    const first = computeDailyStats({
      items: ITEMS,
      dateKst: "2026-03-04",
      now: NOW,
    });
    const second = computeDailyStats({
      items: ITEMS,
      dateKst: "2026-03-04",
      now: NOW,
    });
    expect(first).toStrictEqual(second);
  });
});

