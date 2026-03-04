import { TopicDailyStatSchema, type BurstGrade, type NewsItem, type TopicDailyStat } from "./contracts";
import { scoreItems } from "./score";
import { canonicalizeTopicId } from "./taxonomy";

type TopicCountRow = {
  topicId: string;
  topicLabel: string;
  count: number;
};

type BuildTopicDailyStatsInput = {
  dateKst: string;
  topicCounts: TopicCountRow[];
  historyCountsByTopic: Record<string, number[]>;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseKstDayParts(dayKst: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  return { year, month, day };
}

export function shiftKstDay(dayKst: string, deltaDays: number): string {
  const parsed = parseKstDayParts(dayKst);
  const baseUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
  const shifted = new Date(baseUtc + (deltaDays * 24 * 60 * 60 * 1000));
  const yyyy = String(shifted.getUTCFullYear());
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toKstDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function stddev(values: number[], mean: number): number {
  if (values.length < 1) return 0;
  const variance = values.reduce((sum, current) => sum + ((current - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function computeBurstGrade(zScore: number): BurstGrade {
  if (zScore >= 2.0) return "상";
  if (zScore >= 1.0) return "중";
  return "하";
}

export function computeBurstMetrics(todayCount: number, historyCounts: number[]): {
  baselineMean: number;
  baselineStddev: number;
  burstZ: number;
  burstGrade: BurstGrade;
} {
  const normalized = historyCounts.map((value) => Math.max(0, Math.round(Number(value) || 0)));
  const mean = normalized.length > 0
    ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length
    : 0;
  const sigma = stddev(normalized, mean);
  const zScore = (todayCount - mean) / Math.max(1, sigma);
  const roundedZ = round3(zScore);
  return {
    baselineMean: round3(mean),
    baselineStddev: round3(sigma),
    burstZ: roundedZ,
    burstGrade: computeBurstGrade(roundedZ),
  };
}

export function aggregateDailyTopicCounts(items: NewsItem[], dateKst: string, now: Date): TopicCountRow[] {
  const scored = scoreItems(items, { now });
  const topicMap = new Map<string, TopicCountRow>();

  for (const item of scored) {
    const day = toKstDayKey(item.publishedAt ?? item.fetchedAt);
    if (day !== dateKst) continue;

    const key = canonicalizeTopicId(item.primaryTopicId);
    const prev = topicMap.get(key) ?? {
      topicId: key,
      topicLabel: item.primaryTopicLabel,
      count: 0,
    };

    topicMap.set(key, {
      ...prev,
      count: prev.count + 1,
    });
  }

  return [...topicMap.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.topicId.localeCompare(b.topicId);
  });
}

export function buildTopicDailyStats(input: BuildTopicDailyStatsInput): TopicDailyStat[] {
  return [...input.topicCounts]
    .map((row) => {
      const canonicalTopicId = canonicalizeTopicId(row.topicId);
      const history = input.historyCountsByTopic[canonicalTopicId] ?? input.historyCountsByTopic[row.topicId] ?? [];
      const burst = computeBurstMetrics(row.count, history);
      return TopicDailyStatSchema.parse({
        dateKst: input.dateKst,
        topicId: canonicalTopicId,
        topicLabel: row.topicLabel,
        count: row.count,
        baselineMean: burst.baselineMean,
        baselineStddev: burst.baselineStddev,
        burstZ: burst.burstZ,
        burstGrade: burst.burstGrade,
      });
    })
    .sort((a, b) => {
      if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
      if (a.count !== b.count) return b.count - a.count;
      return a.topicId.localeCompare(b.topicId);
    });
}

export function buildRollingDailyStats(args: {
  items: NewsItem[];
  dateKst: string;
  historyStatsByDay: Record<string, TopicDailyStat[]>;
  baselineDays?: number;
  now: Date;
}): TopicDailyStat[] {
  const baselineDays = Math.max(1, Math.min(30, Math.round(args.baselineDays ?? 7)));
  const topicCounts = aggregateDailyTopicCounts(args.items, args.dateKst, args.now);

  const historyCountsByTopic: Record<string, number[]> = {};
  for (const row of topicCounts) {
    const canonicalTopicId = canonicalizeTopicId(row.topicId);
    const counts: number[] = [];
    for (let offset = baselineDays; offset >= 1; offset -= 1) {
      const day = shiftKstDay(args.dateKst, -offset);
      const historyRows = args.historyStatsByDay[day] ?? [];
      const matched = historyRows.find((entry) => canonicalizeTopicId(entry.topicId) === canonicalTopicId);
      counts.push(matched?.count ?? 0);
    }
    historyCountsByTopic[canonicalTopicId] = counts;
  }

  return buildTopicDailyStats({
    dateKst: args.dateKst,
    topicCounts,
    historyCountsByTopic,
  });
}
