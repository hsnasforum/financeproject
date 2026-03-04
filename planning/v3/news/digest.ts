import { DateRangeSchema, DailyDigestSchema, type DailyDigest, type DateRange, type SelectTopResult, type TopicDailyStat } from "./contracts";
import { selectTopFromStore } from "./selectTop";
import { readDailyStats } from "./store";
import { shiftKstDay } from "./trend";

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

const WATCHLIST_BY_TOPIC: Record<string, string[]> = {
  rates: ["정책금리", "미국 2Y 금리", "미국 10Y 금리"],
  fx: ["USDKRW", "DXY", "엔/달러"],
  oil: ["WTI", "Brent", "미국 원유재고"],
  equity: ["KOSPI", "S&P500", "VIX"],
  policy: ["관세/규제 발표 일정", "예산/법안 일정"],
  general: ["정책금리", "USDKRW", "WTI"],
};

function dedupe(values: string[]): string[] {
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

function buildWatchlist(topResult: SelectTopResult, burstTopics: TopicDailyStat[]): string[] {
  const topics = dedupe([
    ...topResult.topTopics.map((row) => row.topicId),
    ...burstTopics.map((row) => row.topicId),
  ]);

  const watch = topics.flatMap((topicId) => WATCHLIST_BY_TOPIC[topicId] ?? []);
  return dedupe(watch).slice(0, 6);
}

function buildObservationLines(topResult: SelectTopResult, burstTopics: TopicDailyStat[], watchlist: string[]): string[] {
  const topTopic = topResult.topTopics[0]?.topicLabel ?? "핵심 토픽";
  const topTopicCount = topResult.topTopics[0]?.count ?? 0;
  const burstLine = burstTopics[0]
    ? `조건부 관찰: ${burstTopics[0].topicLabel} 기사량 급증(${burstTopics[0].burstGrade})이 이어지면 변동성 확대 가능성이 있습니다.`
    : "조건부 관찰: 급증 토픽은 뚜렷하지 않으며 현재 흐름 유지 가능성이 있습니다.";

  const lines = [
    `관찰: 최근 구간에서 ${topTopic} 관련 기사 비중이 상대적으로 높습니다(건수 ${topTopicCount}).`,
    burstLine,
    `모니터링: ${watchlist.slice(0, 4).join(", ")} 중심으로 확인이 필요합니다.`,
  ];

  lines.forEach(assertNoRecommendationText);
  return lines;
}

export function buildDigestFromInputs(input: {
  generatedAt: string;
  dateRange: DateRange;
  topResult: SelectTopResult;
  burstTopics: TopicDailyStat[];
}): DailyDigest {
  const dateRange = assertValidRange(input.dateRange);
  const watchlist = buildWatchlist(input.topResult, input.burstTopics);
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
  options: { rootDir?: string; now?: Date; topN?: number; topM?: number; readStats?: (day: string) => TopicDailyStat[] } = {},
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

  return buildDigestFromInputs({
    generatedAt,
    dateRange: normalizedRange,
    topResult,
    burstTopics,
  });
}
