import {
  TopicDailyStatSchema,
  type BurstGrade,
  type NewsItem,
  type NewsTopic,
  type TopicDailyStat,
} from "./contracts";
import { scoreItems } from "./score";
import { canonicalizeTopicId } from "./taxonomy";
import { computeBurst } from "./trend/computeBurst";
import { type TopicDailyStat as TrendTopicDailyStat } from "./trend/contracts";
import { computeDailyStats } from "./trend/computeDailyStats";

type TopicCountRow = {
  topicId: string;
  topicLabel: string;
  count: number;
  scoreSum?: number;
  sourceDiversity?: number;
};

type BuildTopicDailyStatsInput = {
  dateKst: string;
  topicCounts: TopicCountRow[];
  historyCountsByTopic: Record<string, number[]>;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeBurstGradeForTrend(
  grade: TopicDailyStat["burstGrade"],
): TrendTopicDailyStat["burstGrade"] {
  if (grade === "상") return "High";
  if (grade === "중") return "Med";
  if (grade === "하") return "Low";
  if (grade === "High" || grade === "Med" || grade === "Low") return grade;
  return "Unknown";
}

function burstGradeWeight(grade: BurstGrade): number {
  if (grade === "High" || grade === "상") return 4;
  if (grade === "Med" || grade === "중") return 3;
  if (grade === "Low" || grade === "하") return 2;
  return 1;
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

export function computeBurstGrade(todayCount: number, historyCounts: number[]): BurstGrade {
  return computeBurst({
    today: { count: todayCount },
    last7: historyCounts.map((count) => ({ count })),
  }).grade;
}

export function computeBurstMetrics(todayCount: number, historyCounts: number[]): {
  baselineMean: number;
  baselineStddev: number;
  burstZ: number;
  burstGrade: BurstGrade;
} {
  const history = historyCounts
    .map((value) => Math.max(0, Math.round(Number(value) || 0)))
    .slice(-7);
  const baselineMean = history.length > 0
    ? history.reduce((sum, value) => sum + value, 0) / history.length
    : 0;
  const variance = history.length > 0
    ? history.reduce((sum, current) => sum + ((current - baselineMean) ** 2), 0) / history.length
    : 0;
  const baselineStddev = Math.sqrt(variance);
  const burstZ = history.length > 0
    ? (todayCount - baselineMean) / Math.max(1, baselineStddev)
    : 0;
  const burstGrade = computeBurstGrade(todayCount, history);
  return {
    baselineMean: round3(baselineMean),
    baselineStddev: round3(baselineStddev),
    burstZ: round3(burstZ),
    burstGrade,
  };
}

export function aggregateDailyTopicCounts(
  items: NewsItem[],
  dateKst: string,
  now: Date,
  options: {
    sourceWeights?: Record<string, number>;
    topics?: NewsTopic[];
  } = {},
): TopicCountRow[] {
  const scored = scoreItems(items, {
    now,
    sourceWeights: options.sourceWeights,
    topics: options.topics,
  });
  const topicMap = new Map<string, {
    topicId: string;
    topicLabel: string;
    count: number;
    scoreSum: number;
    sources: Set<string>;
  }>();

  for (const item of scored) {
    const day = toKstDayKey(item.publishedAt ?? item.fetchedAt);
    if (day !== dateKst) continue;

    const key = canonicalizeTopicId(item.primaryTopicId);
    const prev = topicMap.get(key) ?? {
      topicId: key,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      scoreSum: 0,
      sources: new Set<string>(),
    };
    prev.count += 1;
    prev.scoreSum += Number(item.totalScore) || 0;
    prev.sources.add(item.sourceId);
    topicMap.set(key, prev);
  }

  return [...topicMap.values()]
    .map((row) => ({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      scoreSum: round3(row.scoreSum),
      sourceDiversity: row.count > 0 ? round3(row.sources.size / row.count) : 0,
    }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if ((a.scoreSum ?? 0) !== (b.scoreSum ?? 0)) return (b.scoreSum ?? 0) - (a.scoreSum ?? 0);
      return a.topicId.localeCompare(b.topicId);
    });
}

export function buildTopicDailyStats(input: BuildTopicDailyStatsInput): TopicDailyStat[] {
  return [...input.topicCounts]
    .map((row) => {
      const canonicalTopicId = canonicalizeTopicId(row.topicId);
      const history = (input.historyCountsByTopic[canonicalTopicId] ?? input.historyCountsByTopic[row.topicId] ?? []).slice(-7);
      const burst = computeBurstMetrics(row.count, history);
      return TopicDailyStatSchema.parse({
        dateKst: input.dateKst,
        topicId: canonicalTopicId,
        topicLabel: row.topicLabel,
        count: row.count,
        scoreSum: round3(Number(row.scoreSum) || 0),
        sourceDiversity: round3(Math.max(0, Math.min(1, Number(row.sourceDiversity) || 0))),
        baselineMean: burst.baselineMean,
        baselineStddev: burst.baselineStddev,
        burstZ: burst.burstZ,
        burstGrade: burst.burstGrade,
      });
    })
    .sort((a, b) => {
      const gradeDiff = burstGradeWeight(b.burstGrade) - burstGradeWeight(a.burstGrade);
      if (gradeDiff !== 0) return gradeDiff;
      if (a.count !== b.count) return b.count - a.count;
      if (a.scoreSum !== b.scoreSum) return b.scoreSum - a.scoreSum;
      return a.topicId.localeCompare(b.topicId);
    });
}

export function buildRollingDailyStats(args: {
  items: NewsItem[];
  dateKst: string;
  historyStatsByDay: Record<string, TopicDailyStat[]>;
  baselineDays?: number;
  now: Date;
  sourceWeights?: Record<string, number>;
  topics?: NewsTopic[];
}): TopicDailyStat[] {
  const baselineDays = Math.max(1, Math.min(30, Math.round(args.baselineDays ?? 7)));
  const historyByTopic: Record<string, TrendTopicDailyStat[]> = {};
  for (let offset = baselineDays; offset >= 1; offset -= 1) {
    const day = shiftKstDay(args.dateKst, -offset);
    const rows = args.historyStatsByDay[day] ?? [];
    for (const row of rows) {
      const topicId = canonicalizeTopicId(row.topicId);
      const bucket = historyByTopic[topicId] ?? [];
      bucket.push({
        dateKst: row.dateKst,
        topicId,
        topicLabel: row.topicLabel,
        count: row.count,
        scoreSum: row.scoreSum,
        sourceDiversity: row.sourceDiversity,
        burstGrade: normalizeBurstGradeForTrend(row.burstGrade),
      });
      historyByTopic[topicId] = bucket;
    }
  }

  return computeDailyStats({
    items: args.items,
    dateKst: args.dateKst,
    now: args.now,
    sourceWeights: args.sourceWeights,
    topics: args.topics,
    historyByTopic,
  }).map((row) => {
    const history = historyByTopic[canonicalizeTopicId(row.topicId)] ?? [];
    const burst = computeBurstMetrics(
      row.count,
      history.slice(-baselineDays).map((entry) => entry.count),
    );
    return TopicDailyStatSchema.parse({
      ...row,
      baselineMean: burst.baselineMean,
      baselineStddev: burst.baselineStddev,
      burstZ: burst.burstZ,
      burstGrade: burst.burstGrade,
    });
  });
}
