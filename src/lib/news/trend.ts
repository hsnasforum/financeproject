import { type BurstLevel, type TopicDailyStat, type TopicTrend, type TopicTrendSeriesPoint, type TopicTrendsArtifact } from "./types";

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function shiftDay(dayKst: string, deltaDays: number): string {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const baseUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = new Date(baseUtc + deltaDays * 24 * 60 * 60 * 1000);
  const yyyy = String(shifted.getUTCFullYear());
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateSeries(todayKst: string, windowDays: number): string[] {
  const out: string[] = [];
  const span = Math.max(1, Math.trunc(windowDays));
  for (let i = span - 1; i >= 0; i -= 1) {
    out.push(shiftDay(todayKst, -i));
  }
  return out;
}

function avg(values: number[]): number {
  if (values.length < 1) return 0;
  return values.reduce((sum, row) => sum + row, 0) / values.length;
}

function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, row) => sum + ((row - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function burstLevelFromZ(z: number, highThreshold = 2.0, midThreshold = 1.0): BurstLevel {
  if (z >= highThreshold) return "상";
  if (z >= midThreshold) return "중";
  return "하";
}

function buildTopicTrend(args: {
  topicId: string;
  topicLabel: string;
  todayKst: string;
  seriesDays: string[];
  rowsByDate: Map<string, TopicDailyStat>;
  burstWindowDays: number;
  historyMinDays: number;
  highThreshold: number;
  midThreshold: number;
}): TopicTrend {
  const todayRow = args.rowsByDate.get(args.todayKst);
  const yesterdayRow = args.rowsByDate.get(shiftDay(args.todayKst, -1));
  const todayCount = Math.max(0, Math.round(asNumber(todayRow?.count, 0)));
  const yesterdayCount = Math.max(0, Math.round(asNumber(yesterdayRow?.count, 0)));
  const delta = todayCount - yesterdayCount;
  const ratio = yesterdayCount <= 0 ? (todayCount > 0 ? 999 : 0) : (todayCount / yesterdayCount);

  const historyCounts: number[] = [];
  for (let i = 1; i <= args.burstWindowDays; i += 1) {
    const row = args.rowsByDate.get(shiftDay(args.todayKst, -i));
    if (!row) continue;
    historyCounts.push(Math.max(0, Math.round(asNumber(row.count, 0))));
  }

  const validDays = historyCounts;
  const lowHistory = validDays.length < args.historyMinDays;
  const avgLast7d = avg(validDays);
  const stddevLast7d = stddev(validDays, avgLast7d);
  const burstZRaw = lowHistory
    ? 0
    : (todayCount - avgLast7d) / Math.max(1, stddevLast7d);
  const burstZ = round2(burstZRaw);
  const burstLevel = lowHistory
    ? "하"
    : burstLevelFromZ(burstZ, args.highThreshold, args.midThreshold);

  const sourceDiversity = round2(asNumber(todayRow?.sourceDiversity, 0));
  const topSourceShare = round2(asNumber(todayRow?.topSourceShare, 1));
  const scoreSum = round2(asNumber(todayRow?.scoreSum, 0));

  const series: TopicTrendSeriesPoint[] = args.seriesDays.map((date) => {
    const row = args.rowsByDate.get(date);
    return {
      date,
      count: Math.max(0, Math.round(asNumber(row?.count, 0))),
      scoreSum: round2(asNumber(row?.scoreSum, 0)),
    };
  });

  return {
    topicId: args.topicId,
    topicLabel: args.topicLabel,
    todayCount,
    yesterdayCount,
    delta,
    ratio: round2(ratio),
    avgLast7d: round2(avgLast7d),
    stddevLast7d: round2(stddevLast7d),
    burstZ,
    burstLevel,
    lowHistory,
    sourceDiversity,
    topSourceShare,
    scoreSum,
    series,
  };
}

export function buildTopicTrendsArtifact(input: {
  generatedAt: string;
  todayKst: string;
  rows: TopicDailyStat[];
  windowDays?: number;
  burstWindowDays?: number;
  historyMinDays?: number;
  highThreshold?: number;
  midThreshold?: number;
}): TopicTrendsArtifact {
  const windowDays = Math.max(7, Math.min(30, Math.round(asNumber(input.windowDays, 30))));
  const burstWindowDays = Math.max(3, Math.min(14, Math.round(asNumber(input.burstWindowDays, 7))));
  const historyMinDays = Math.max(1, Math.min(7, Math.round(asNumber(input.historyMinDays, 3))));
  const highThreshold = asNumber(input.highThreshold, 2.0);
  const midThreshold = asNumber(input.midThreshold, 1.0);

  const seriesDays = dateSeries(input.todayKst, windowDays);
  const byTopic = new Map<string, { topicId: string; topicLabel: string; rowsByDate: Map<string, TopicDailyStat> }>();
  for (const row of input.rows) {
    const key = row.topicId;
    const bucket = byTopic.get(key) ?? {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      rowsByDate: new Map<string, TopicDailyStat>(),
    };
    bucket.rowsByDate.set(row.date, row);
    byTopic.set(key, bucket);
  }

  const topics: TopicTrend[] = [...byTopic.values()].map((topic) => buildTopicTrend({
    topicId: topic.topicId,
    topicLabel: topic.topicLabel,
    todayKst: input.todayKst,
    seriesDays,
    rowsByDate: topic.rowsByDate,
    burstWindowDays,
    historyMinDays,
    highThreshold,
    midThreshold,
  })).sort((a, b) => {
    if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
    if (a.todayCount !== b.todayCount) return b.todayCount - a.todayCount;
    return a.topicLabel.localeCompare(b.topicLabel);
  });

  const burstTopics = topics
    .filter((row) => row.burstLevel !== "하" && row.todayCount > 0)
    .sort((a, b) => {
      if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
      return a.topicLabel.localeCompare(b.topicLabel);
    });

  return {
    generatedAt: input.generatedAt,
    timezone: "Asia/Seoul",
    todayKst: input.todayKst,
    windowDays,
    topics,
    burstTopics,
  };
}

export function trimTopicTrendsWindow(artifact: TopicTrendsArtifact, windowDays: 7 | 30): TopicTrendsArtifact {
  const window = windowDays === 7 ? 7 : 30;
  const topics = artifact.topics.map((row) => ({
    ...row,
    series: row.series.slice(Math.max(0, row.series.length - window)),
  }));
  return {
    ...artifact,
    windowDays: window,
    topics,
    burstTopics: artifact.burstTopics,
  };
}
