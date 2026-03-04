import { IngestResultSchema, type IngestResult, type NewsSource, type RuntimeState } from "../contracts";
import { fetchFeed } from "../ingest/fetchFeed";
import { normalizeEntry } from "../ingest/normalizeEntry";
import { parseFeed } from "../ingest/parseFeed";
import { NEWS_SOURCES } from "../sources";
import { hasItem, readAllItems, readDailyStats, readState, upsertItems, writeDailyStats, writeState } from "../store";
import { buildRollingDailyStats, shiftKstDay, toKstDayKey } from "../trend";

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

export async function runNewsRefresh(options: RunNewsRefreshOptions = {}): Promise<IngestResult> {
  const sources = (options.sources ?? NEWS_SOURCES).filter((source) => source.enabled);
  const rootDir = options.rootDir;
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
  });
  writeDailyStats(todayKst, dailyStats, rootDir);

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
  console.error(`[news:refresh] failed: ${message}`);
  process.exitCode = 1;
});
