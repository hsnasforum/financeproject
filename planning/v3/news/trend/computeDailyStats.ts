import { type NewsItem, type NewsTopic, type ScoredNewsItem } from "../contracts";
import { scoreItems } from "../score";
import { canonicalizeTopicId } from "../taxonomy";
import { computeBurst } from "./computeBurst";
import { TopicDailyStatSchema, type TopicDailyStat } from "./contracts";

type DailyStatsInput = {
  items: NewsItem[] | ScoredNewsItem[];
  dateKst: string;
  now: Date;
  sourceWeights?: Record<string, number>;
  topics?: NewsTopic[];
  historyByTopic?: Record<string, TopicDailyStat[]>;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toKstDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function asScoredItems(input: DailyStatsInput): ScoredNewsItem[] {
  const first = input.items[0];
  if (first && typeof first === "object" && "totalScore" in first && "primaryTopicId" in first) {
    return (input.items as ScoredNewsItem[]).slice();
  }
  return scoreItems(input.items as NewsItem[], {
    now: input.now,
    sourceWeights: input.sourceWeights,
    topics: input.topics,
  });
}

export function computeDailyStats(input: DailyStatsInput): TopicDailyStat[] {
  const scored = asScoredItems(input);
  const buckets = new Map<string, {
    topicId: string;
    topicLabel: string;
    count: number;
    scoreSum: number;
    sources: Set<string>;
  }>();

  for (const item of scored) {
    const day = toKstDayKey(item.publishedAt ?? item.fetchedAt);
    if (day !== input.dateKst) continue;

    const topicId = canonicalizeTopicId(item.primaryTopicId);
    const prev = buckets.get(topicId) ?? {
      topicId,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      scoreSum: 0,
      sources: new Set<string>(),
    };
    prev.count += 1;
    prev.scoreSum += Number(item.totalScore) || 0;
    prev.sources.add(item.sourceId);
    buckets.set(topicId, prev);
  }

  const stats = [...buckets.values()].map((row) => {
    const history = (input.historyByTopic?.[row.topicId] ?? []).slice(-7);
    const burst = computeBurst({
      today: { count: row.count },
      last7: history.map((entry) => ({ count: entry.count })),
    });
    return TopicDailyStatSchema.parse({
      dateKst: input.dateKst,
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      scoreSum: round3(row.scoreSum),
      sourceDiversity: row.count > 0 ? round3(row.sources.size / row.count) : 0,
      burstGrade: burst.grade,
    });
  });

  const gradeWeight = (value: string): number => {
    if (value === "High") return 4;
    if (value === "Med") return 3;
    if (value === "Low") return 2;
    return 1;
  };

  return stats.sort((a, b) => {
    const gradeDiff = gradeWeight(b.burstGrade) - gradeWeight(a.burstGrade);
    if (gradeDiff !== 0) return gradeDiff;
    if (a.count !== b.count) return b.count - a.count;
    if (a.scoreSum !== b.scoreSum) return b.scoreSum - a.scoreSum;
    return a.topicId.localeCompare(b.topicId);
  });
}

