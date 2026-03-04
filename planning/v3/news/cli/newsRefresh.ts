import path from "node:path";
import { IngestResultSchema, type IngestResult, type NewsSource, type RuntimeState, type TopicDailyStat } from "../contracts";
import { fetchFeed } from "../ingest/fetchFeed";
import { normalizeEntry } from "../ingest/normalizeEntry";
import { parseFeed } from "../ingest/parseFeed";
import { buildDigest } from "../digest";
import { buildDigestDay } from "../digest/buildDigest";
import { loadEffectiveNewsConfig } from "../settings";
import { NEWS_SOURCES } from "../sources";
import { buildScenarios } from "../scenario";
import { rewriteDigestScenarioTextWithLocalLlm } from "../llmAdapter";
import { selectTopFromStore } from "../selectTop";
import { type TopicDailyStat as ScenarioTrendStat } from "../trend/contracts";
import {
  hasItem,
  readAllItems,
  readDailyStats,
  readDailyStatsLastNDays,
  readState,
  type TrendCacheTopic,
  upsertItems,
  writeDailyStats,
  writeDigest,
  writeScenariosCache,
  writeState,
  writeTodayCache,
  writeTrendsCache,
} from "../store";
import { buildRollingDailyStats, shiftKstDay, toKstDayKey } from "../trend";
import { sanitizeV3LogMessage } from "../../security/whitelist";
import { loadEffectiveScenarioLibrary } from "../../scenarios/library";

type RunNewsRefreshOptions = {
  rootDir?: string;
  sources?: NewsSource[];
  fetchImpl?: typeof fetch;
  throttleMs?: number;
  now?: Date;
};

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(now?: Date): string {
  const date = now ?? new Date();
  return date.toISOString();
}

function burstWeight(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return 4;
  if (normalized === "med" || normalized === "중") return 3;
  if (normalized === "low" || normalized === "하") return 2;
  return 1;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function aggregateTrendRows(input: {
  todayRows: TopicDailyStat[];
  windowRows: TopicDailyStat[];
}): TrendCacheTopic[] {
  const map = new Map<string, {
    topicId: string;
    topicLabel: string;
    count: number;
    diversitySum: number;
    diversityDays: number;
    burstGrade: string;
  }>();

  const todayByTopic = new Map(input.todayRows.map((row) => [row.topicId, row] as const));

  for (const row of input.windowRows) {
    const prev = map.get(row.topicId) ?? {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: 0,
      diversitySum: 0,
      diversityDays: 0,
      burstGrade: "Unknown",
    };
    prev.count += row.count;
    prev.diversitySum += row.sourceDiversity;
    prev.diversityDays += 1;
    map.set(row.topicId, prev);
  }

  const out: TrendCacheTopic[] = [...map.values()].map((row) => {
    const today = todayByTopic.get(row.topicId);
    return {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      burstGrade: today?.burstGrade ?? row.burstGrade,
      sourceDiversity: row.diversityDays > 0 ? round3(row.diversitySum / row.diversityDays) : 0,
    };
  });

  return out.sort((a, b) => {
    const gradeDiff = burstWeight(b.burstGrade) - burstWeight(a.burstGrade);
    if (gradeDiff !== 0) return gradeDiff;
    if (a.count !== b.count) return b.count - a.count;
    if (a.sourceDiversity !== b.sourceDiversity) return b.sourceDiversity - a.sourceDiversity;
    return a.topicId.localeCompare(b.topicId);
  });
}

function normalizeBurstGradeForScenario(value: string): ScenarioTrendStat["burstGrade"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "High";
  if (normalized === "med" || normalized === "중") return "Med";
  if (normalized === "low" || normalized === "하") return "Low";
  return "Unknown";
}

export async function runNewsRefresh(options: RunNewsRefreshOptions = {}): Promise<IngestResult> {
  const rootDir = options.rootDir;
  const effective = options.sources
    ? { sources: options.sources, topics: [] }
    : loadEffectiveNewsConfig(rootDir);
  const sources = (options.sources ?? effective.sources ?? NEWS_SOURCES).filter((source) => source.enabled);
  const sourceWeights = Object.fromEntries(
    (options.sources ?? effective.sources ?? NEWS_SOURCES).map((row) => [row.id, row.weight]),
  );
  const throttleMs = Math.max(0, Math.round(options.throttleMs ?? 250));

  const currentState = readState(rootDir);
  const nextState: RuntimeState = {
    ...currentState,
    sources: { ...currentState.sources },
  };

  const fetchedAt = nowIso(options.now);
  const seenIdsInRun = new Set<string>();
  const newItems = [] as ReturnType<typeof normalizeEntry>[];

  let sourcesProcessed = 0;
  let itemsFetched = 0;
  let itemsDeduped = 0;
  const errors: IngestResult["errors"] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    sourcesProcessed += 1;

    const sourceState = nextState.sources[source.id] ?? {};
    const fetched = await fetchFeed({
      feedUrl: source.feedUrl,
      etag: sourceState.etag,
      lastModified: sourceState.lastModified,
      fetchImpl: options.fetchImpl,
    });

    nextState.sources[source.id] = {
      etag: fetched.etag ?? sourceState.etag,
      lastModified: fetched.lastModified ?? sourceState.lastModified,
      lastRunAt: fetchedAt,
    };

    if (!fetched.ok) {
      errors.push({
        sourceId: source.id,
        status: fetched.status || undefined,
        message: fetched.error ?? "fetch_failed",
      });
      if (index < sources.length - 1) await sleep(throttleMs);
      continue;
    }

    if (!fetched.notModified && fetched.xml) {
      const parsedEntries = parseFeed(fetched.xml);
      for (const rawEntry of parsedEntries) {
        const normalized = normalizeEntry(rawEntry, source.id, fetchedAt);
        if (!normalized) continue;
        itemsFetched += 1;

        if (seenIdsInRun.has(normalized.id) || hasItem(normalized.id, rootDir)) {
          itemsDeduped += 1;
          continue;
        }

        seenIdsInRun.add(normalized.id);
        newItems.push(normalized);
      }
    }

    if (index < sources.length - 1) {
      await sleep(throttleMs);
    }
  }

  const persisted = upsertItems(
    newItems.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    rootDir,
  );

  itemsDeduped += persisted.itemsDeduped;
  nextState.lastRunAt = fetchedAt;
  writeState(nextState, rootDir);

  const allItems = readAllItems(rootDir);
  const todayKst = toKstDayKey(options.now ?? new Date());
  const historyStatsByDay: Record<string, ReturnType<typeof readDailyStats>> = {};
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = shiftKstDay(todayKst, -offset);
    historyStatsByDay[day] = readDailyStats(day, rootDir);
  }

  const dailyStats = buildRollingDailyStats({
    items: allItems,
    dateKst: todayKst,
    historyStatsByDay,
    baselineDays: 7,
    now: options.now ?? new Date(),
    sourceWeights,
    topics: options.sources ? undefined : effective.topics,
  });
  writeDailyStats(todayKst, dailyStats, rootDir);

  const digest = buildDigest(
    { fromKst: shiftKstDay(todayKst, -2), toKst: todayKst },
    { rootDir, now: options.now ?? new Date(), topN: 10, topM: 5 },
  );
  writeDigest(digest, rootDir);

  const topResult = selectTopFromStore({
    rootDir,
    now: options.now ?? new Date(),
    windowHours: 72,
    topN: 10,
    topM: 5,
    sourceWeights,
    topics: options.sources ? undefined : effective.topics,
  });
  const digestDay = buildDigestDay({
    date: todayKst,
    topResult,
    burstTopics: dailyStats,
  });
  const scenarioDataDir = options.rootDir
    ? path.join(path.dirname(options.rootDir), "scenarios")
    : undefined;
  const scenarioLibrary = loadEffectiveScenarioLibrary(scenarioDataDir);
  const scenarios = buildScenarios({
    digest: digestDay,
    trends: dailyStats.map((row) => ({
      dateKst: row.dateKst,
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      scoreSum: row.scoreSum,
      sourceDiversity: row.sourceDiversity,
      burstGrade: normalizeBurstGradeForScenario(row.burstGrade),
    })),
    generatedAt: fetchedAt,
    libraryTemplates: scenarioLibrary.templates,
  });

  const rewritten = await rewriteDigestScenarioTextWithLocalLlm({
    digest: digestDay,
    scenarios,
    topItems: topResult.topItems.map((item) => ({
      title: item.title,
      snippet: item.snippet,
      primaryTopicId: item.primaryTopicId,
      sourceId: item.sourceId,
    })),
  });
  const finalDigestDay = rewritten.digest;
  const finalScenarios = rewritten.scenarios;

  writeTodayCache({
    generatedAt: fetchedAt,
    date: todayKst,
    lastRefreshedAt: fetchedAt,
    digest: finalDigestDay,
    scenarios: finalScenarios,
  }, rootDir);

  writeScenariosCache({
    generatedAt: fetchedAt,
    lastRefreshedAt: fetchedAt,
    scenarios: finalScenarios,
  }, rootDir);

  const trends7Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 7, rootDir });
  const trends30Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 30, rootDir });
  writeTrendsCache({
    generatedAt: fetchedAt,
    date: todayKst,
    windowDays: 7,
    topics: aggregateTrendRows({ todayRows: dailyStats, windowRows: trends7Rows }),
  }, rootDir);
  writeTrendsCache({
    generatedAt: fetchedAt,
    date: todayKst,
    windowDays: 30,
    topics: aggregateTrendRows({ todayRows: dailyStats, windowRows: trends30Rows }),
  }, rootDir);

  return IngestResultSchema.parse({
    sourcesProcessed,
    itemsFetched,
    itemsNew: persisted.itemsNew,
    itemsDeduped,
    errors,
  });
}

async function main(): Promise<void> {
  const result = await runNewsRefresh();
  console.log(`[news:refresh] sources=${result.sourcesProcessed} fetched=${result.itemsFetched} new=${result.itemsNew} deduped=${result.itemsDeduped} errors=${result.errors.length}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(`[news:refresh] failed: ${sanitizeV3LogMessage(message)}`);
  process.exitCode = 1;
});
