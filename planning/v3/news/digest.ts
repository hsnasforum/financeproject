import {
  DateRangeSchema,
  DailyDigestSchema,
  type DailyDigest,
  type DateRange,
  type DigestWatchItem,
  type DigestWatchSpec,
  type SelectTopResult,
  type TopicDailyStat,
} from "./contracts";
import { selectTopFromStore } from "./selectTop";
import { readDailyStats } from "./store";
import { shiftKstDay } from "./trend";
import { canonicalizeTopicId } from "./taxonomy";
import { pctChange, regime, trendSlope, zscore } from "../indicators/analytics";
import { type Observation } from "../indicators/contracts";
import { normalizeSeriesId } from "../indicators/aliases";
import { readSeriesObservations } from "../indicators/store";
import { WATCHLIST_BY_TOPIC } from "./digest/templates";

const BANNED_PATTERNS = [
  /매수/gi,
  /매도/gi,
  /정답/gi,
  /무조건/gi,
  /확실/gi,
  /해야\s*한다/gi,
  /사야\s*한다/gi,
  /팔아야\s*한다/gi,
  /buy\s+now/gi,
  /sell\s+now/gi,
  /must\s+buy/gi,
  /must\s+sell/gi,
];

type WatchMetrics = {
  spec: DigestWatchSpec;
  observations: Observation[];
  latestDate: string | null;
  latestValue: number | null;
  pct: number | null;
  z: number | null;
  slope: number | null;
  reg: ReturnType<typeof regime>;
};

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function dedupeSpecs(values: DigestWatchSpec[]): DigestWatchSpec[] {
  const seen = new Set<string>();
  const out: DigestWatchSpec[] = [];
  for (const value of values) {
    const normalizedSeriesId = normalizeSeriesId(value.seriesId);
    const normalized: DigestWatchSpec = {
      ...value,
      seriesId: normalizedSeriesId,
    };
    const key = `${normalized.seriesId}|${normalized.view}|${normalized.window}|${normalized.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function parseDayToken(day: string): number {
  const [year, month, date] = day.split("-").map((token) => Number(token));
  return Date.UTC(year, month - 1, date, 12, 0, 0);
}

function assertValidRange(range: DateRange): DateRange {
  const parsed = DateRangeSchema.parse(range);
  if (parseDayToken(parsed.fromKst) > parseDayToken(parsed.toKst)) {
    throw new Error("invalid_date_range");
  }
  return parsed;
}

function hasBannedPattern(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return BANNED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function noRecommendationText(text: string): boolean {
  return !hasBannedPattern(text);
}

function assertNoRecommendationText(text: string): void {
  if (!noRecommendationText(text)) {
    throw new Error("recommendation_language_detected");
  }
}

function collectBurstTopics(dateRange: DateRange, readStats: (day: string) => TopicDailyStat[]): TopicDailyStat[] {
  const burst: TopicDailyStat[] = [];
  for (let cursor = dateRange.fromKst; parseDayToken(cursor) <= parseDayToken(dateRange.toKst); cursor = shiftKstDay(cursor, 1)) {
    const rows = readStats(cursor)
      .filter((row) => row.burstGrade !== "하")
      .map((row) => ({ ...row }));
    burst.push(...rows);
  }

  return burst
    .sort((a, b) => {
      if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
      if (a.count !== b.count) return b.count - a.count;
      return a.topicId.localeCompare(b.topicId);
    })
    .slice(0, 5);
}

function buildWatchlistSpecs(topResult: SelectTopResult, burstTopics: TopicDailyStat[]): DigestWatchSpec[] {
  const topics = dedupeStrings([
    ...topResult.topTopics.map((row) => canonicalizeTopicId(row.topicId)),
    ...burstTopics.map((row) => canonicalizeTopicId(row.topicId)),
  ]);

  const specs = topics.flatMap((topicId) => WATCHLIST_BY_TOPIC[topicId] ?? []);
  return dedupeSpecs(specs.length > 0 ? specs : WATCHLIST_BY_TOPIC.general).slice(0, 6);
}

function toDirectionLabel(value: ReturnType<typeof regime>): string {
  if (value === "up") return "상승";
  if (value === "down") return "하락";
  if (value === "flat") return "횡보";
  return "불명";
}

function buildCompactSummary(item: {
  view: DigestWatchSpec["view"];
  status: DigestWatchItem["status"];
  reg: ReturnType<typeof regime>;
  grade: DigestWatchItem["grade"];
}): string {
  if (item.status !== "ok") return "데이터 부족";

  const direction = toDirectionLabel(item.reg);
  if (item.view === "zscore") return `${direction} 이탈 · 등급 ${item.grade}`;
  if (item.view === "trend") return `${direction} 추세 · 등급 ${item.grade}`;
  if (item.view === "pctChange") return `${direction} 변화 · 등급 ${item.grade}`;
  return `${direction} 수준 · 등급 ${item.grade}`;
}

function gradeByRank(metrics: WatchMetrics[]): Map<string, DigestWatchItem["grade"]> {
  const candidates = metrics
    .filter((row) => typeof row.z === "number" && Number.isFinite(row.z))
    .map((row) => ({ seriesId: row.spec.seriesId, strength: Math.abs(row.z as number) }))
    .sort((a, b) => {
      if (a.strength !== b.strength) return b.strength - a.strength;
      return a.seriesId.localeCompare(b.seriesId);
    });

  const out = new Map<string, DigestWatchItem["grade"]>();
  if (candidates.length === 0) return out;
  if (candidates.length === 1) {
    out.set(candidates[0].seriesId, "중");
    return out;
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const rank = index / (candidates.length - 1);
    const grade: DigestWatchItem["grade"] = rank <= (1 / 3) ? "상" : rank <= (2 / 3) ? "중" : "하";
    out.set(candidates[index].seriesId, grade);
  }
  return out;
}

function analyzeWatchlist(
  specs: DigestWatchSpec[],
  readIndicatorSeries: (seriesId: string) => Observation[],
): DigestWatchItem[] {
  const metrics: WatchMetrics[] = specs.map((spec) => {
    const normalizedSeriesId = normalizeSeriesId(spec.seriesId);
    const observations = readIndicatorSeries(normalizedSeriesId);
    const latest = observations
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);

    return {
      spec: {
        ...spec,
        seriesId: normalizedSeriesId,
      },
      observations,
      latestDate: latest?.date ?? null,
      latestValue: latest?.value ?? null,
      pct: pctChange(observations, spec.window),
      z: zscore(observations, Math.max(spec.window, 3)),
      slope: trendSlope(observations, Math.max(spec.window, 3)),
      reg: regime(observations, Math.max(spec.window, 3)),
    };
  });

  const gradeMap = gradeByRank(metrics);

  return metrics.map((row) => {
    const status: DigestWatchItem["status"] = row.spec.view === "last"
      ? (typeof row.latestValue === "number" ? "ok" : "unknown")
      : row.spec.view === "pctChange"
        ? (typeof row.pct === "number" ? "ok" : "unknown")
        : row.spec.view === "zscore"
          ? (typeof row.z === "number" ? "ok" : "unknown")
          : (typeof row.slope === "number" ? "ok" : "unknown");

    const grade: DigestWatchItem["grade"] = status === "ok"
      ? (gradeMap.get(row.spec.seriesId) ?? "중")
      : "unknown";

    return {
      ...row.spec,
      status,
      grade,
      compactSummary: buildCompactSummary({
        view: row.spec.view,
        status,
        reg: row.reg,
        grade,
      }),
      asOf: row.latestDate,
    };
  });
}

function buildObservationLines(topResult: SelectTopResult, burstTopics: TopicDailyStat[], watchlist: DigestWatchItem[]): string[] {
  const topTopic = topResult.topTopics[0]?.topicLabel ?? "핵심 토픽";
  const topTopicCount = topResult.topTopics[0]?.count ?? 0;
  const burstLine = burstTopics[0]
    ? `조건부 관찰: ${burstTopics[0].topicLabel} 기사량 급증(${burstTopics[0].burstGrade})이 이어지면 변동성 확대 가능성이 있습니다.`
    : "조건부 관찰: 급증 토픽은 뚜렷하지 않으며 현재 흐름 유지 가능성이 있습니다.";

  const watchSummary = watchlist
    .slice(0, 4)
    .map((row) => `${row.label}(${row.grade})`)
    .join(", ");

  const lines = [
    `관찰: 최근 구간에서 ${topTopic} 관련 기사 비중이 상대적으로 높습니다(건수 ${topTopicCount}).`,
    burstLine,
    `모니터링: ${watchSummary || "데이터 부족"} 중심으로 확인이 필요합니다.`,
  ];

  lines.forEach(assertNoRecommendationText);
  return lines;
}

export function buildDigestFromInputs(input: {
  generatedAt: string;
  dateRange: DateRange;
  topResult: SelectTopResult;
  burstTopics: TopicDailyStat[];
  readIndicatorSeries?: (seriesId: string) => Observation[];
}): DailyDigest {
  const dateRange = assertValidRange(input.dateRange);
  const readIndicatorSeries = input.readIndicatorSeries ?? (() => []);
  const watchlistSpecs = buildWatchlistSpecs(input.topResult, input.burstTopics);
  const watchlist = analyzeWatchlist(watchlistSpecs, readIndicatorSeries);
  const observationLines = buildObservationLines(input.topResult, input.burstTopics, watchlist);

  return DailyDigestSchema.parse({
    generatedAt: input.generatedAt,
    dateRange,
    topItems: input.topResult.topItems,
    topTopics: input.topResult.topTopics,
    burstTopics: input.burstTopics,
    watchlist,
    observationLines,
  });
}

export function buildDigest(
  dateRange: DateRange,
  options: {
    rootDir?: string;
    indicatorsRootDir?: string;
    now?: Date;
    topN?: number;
    topM?: number;
    readStats?: (day: string) => TopicDailyStat[];
    readIndicatorSeries?: (seriesId: string) => Observation[];
  } = {},
): DailyDigest {
  const normalizedRange = assertValidRange(dateRange);
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();

  const topResult = selectTopFromStore({
    rootDir: options.rootDir,
    now,
    windowHours: 72,
    topN: options.topN ?? 10,
    topM: options.topM ?? 5,
  });

  const readStats = options.readStats ?? ((day: string) => readDailyStats(day, options.rootDir));
  const burstTopics = collectBurstTopics(normalizedRange, readStats);
  const readIndicatorSeries = options.readIndicatorSeries
    ?? ((seriesId: string) => readSeriesObservations(seriesId, options.indicatorsRootDir));

  return buildDigestFromInputs({
    generatedAt,
    dateRange: normalizedRange,
    topResult,
    burstTopics,
    readIndicatorSeries,
  });
}
