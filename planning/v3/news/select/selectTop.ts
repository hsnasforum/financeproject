import {
  SelectTopResultSchema,
  TopTopicSchema,
  type NewsItem,
  type NewsTopic,
  type ScoredNewsItem,
  type SelectTopResult,
  type TopTopic,
} from "../contracts";
import { loadEffectiveNewsConfig } from "../settings";
import { readAllItems } from "../store";
import { TOPIC_PRIORITY, canonicalizeTopicId } from "../taxonomy";
import { clusterByTitle } from "./clusterByTitle";
import { compareScoredItems, scoreItems } from "./score";

type SelectTopOptions = {
  rootDir?: string;
  now?: Date;
  windowHours?: number;
  topN?: number;
  topM?: number;
  sourceWeights?: Record<string, number>;
  topics?: NewsTopic[];
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function priorityIndex(topicId: string): number {
  const index = TOPIC_PRIORITY.indexOf(canonicalizeTopicId(topicId));
  return index >= 0 ? index : TOPIC_PRIORITY.length;
}

function aggregateTopTopics(items: ScoredNewsItem[], topM: number): TopTopic[] {
  const map = new Map<string, TopTopic>();
  for (const item of items) {
    const topicId = canonicalizeTopicId(item.primaryTopicId);
    const prev = map.get(topicId) ?? {
      topicId,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      scoreSum: 0,
      topScore: 0,
    };
    const next = TopTopicSchema.parse({
      ...prev,
      count: prev.count + 1,
      scoreSum: round3(prev.scoreSum + item.totalScore),
      topScore: Math.max(prev.topScore, item.totalScore),
    });
    map.set(topicId, next);
  }

  return [...map.values()]
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (a.scoreSum !== b.scoreSum) return b.scoreSum - a.scoreSum;
      const priorityDiff = priorityIndex(a.topicId) - priorityIndex(b.topicId);
      if (priorityDiff !== 0) return priorityDiff;
      return a.topicId.localeCompare(b.topicId);
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

  const scored = scoreItems(candidates, {
    now,
    sourceWeights: options.sourceWeights,
    topics: options.topics,
  });
  const clusters = clusterByTitle(scored);
  const representatives = clusters.map((cluster) => cluster.representative).sort(compareScoredItems);

  return SelectTopResultSchema.parse({
    windowHours,
    totalCandidates: candidates.length,
    topItems: representatives.slice(0, topN),
    clusters,
    topTopics: aggregateTopTopics(representatives, topM),
  });
}

export function selectTopFromStore(options: SelectTopOptions = {}): SelectTopResult {
  const effective = loadEffectiveNewsConfig(options.rootDir);
  const items = readAllItems(options.rootDir);
  return selectTopFromItems(items, {
    ...options,
    sourceWeights: options.sourceWeights ?? Object.fromEntries(effective.sources.map((row) => [row.id, row.weight])),
    topics: options.topics ?? effective.topics,
  });
}
