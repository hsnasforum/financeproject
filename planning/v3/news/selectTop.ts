import {
  SelectTopResultSchema,
  TopTopicSchema,
  type NewsItem,
  type SelectTopResult,
  type TopTopic,
} from "./contracts";
import { clusterItems } from "./cluster";
import { scoreItems } from "./score";
import { readAllItems } from "./store";

type SelectTopOptions = {
  rootDir?: string;
  now?: Date;
  windowHours?: number;
  topN?: number;
  topM?: number;
};

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function publishedOrFetchedMs(item: NewsItem): number {
  const preferred = Date.parse(item.publishedAt ?? "");
  if (Number.isFinite(preferred)) return preferred;
  const fetched = Date.parse(item.fetchedAt);
  return Number.isFinite(fetched) ? fetched : 0;
}

function inWindow(item: NewsItem, nowMs: number, windowHours: number): boolean {
  const ts = publishedOrFetchedMs(item);
  if (ts <= 0) return false;
  const ageHours = (nowMs - ts) / (1000 * 60 * 60);
  return ageHours >= 0 && ageHours <= windowHours;
}

function aggregateTopTopics(items: ReturnType<typeof scoreItems>, topM: number): TopTopic[] {
  const map = new Map<string, TopTopic>();

  for (const item of items) {
    const key = item.primaryTopicId;
    const prev = map.get(key) ?? {
      topicId: item.primaryTopicId,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      scoreSum: 0,
      topScore: 0,
    };

    const next = {
      ...prev,
      count: prev.count + 1,
      scoreSum: Math.round((prev.scoreSum + item.totalScore) * 1000) / 1000,
      topScore: Math.max(prev.topScore, item.totalScore),
    };
    map.set(key, TopTopicSchema.parse(next));
  }

  return [...map.values()]
    .sort((a, b) => {
      if (a.scoreSum !== b.scoreSum) return b.scoreSum - a.scoreSum;
      if (a.count !== b.count) return b.count - a.count;
      return a.topicLabel.localeCompare(b.topicLabel);
    })
    .slice(0, topM);
}

export function selectTopFromItems(items: NewsItem[], options: SelectTopOptions = {}): SelectTopResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const windowHours = clampInteger(options.windowHours, 24, 72, 72);
  const topN = clampInteger(options.topN, 1, 100, 10);
  const topM = clampInteger(options.topM, 1, 50, 5);

  const candidates = items
    .filter((item) => inWindow(item, nowMs, windowHours))
    .sort((a, b) => a.id.localeCompare(b.id));

  const scored = scoreItems(candidates, { now });
  const clusters = clusterItems(scored);
  const representatives = clusters.map((cluster) => cluster.representative);

  return SelectTopResultSchema.parse({
    windowHours,
    totalCandidates: candidates.length,
    topItems: representatives.slice(0, topN),
    topTopics: aggregateTopTopics(representatives, topM),
  });
}

export function selectTopFromStore(options: SelectTopOptions = {}): SelectTopResult {
  const items = readAllItems(options.rootDir);
  return selectTopFromItems(items, options);
}
