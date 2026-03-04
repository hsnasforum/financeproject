import {
  ScoredNewsItemSchema,
  ScorePartsSchema,
  type NewsItem,
  type NewsSource,
  type NewsTopic,
  type ScoreParts,
  type ScoredNewsItem,
  type TopicTag,
} from "../contracts";
import { NEWS_SOURCES } from "../sources";
import { canonicalizeTopicId } from "../taxonomy";
import { tagTopics } from "./tagTopics";
import { type BurstGrade } from "../contracts";
import { extractEntities, normalizeEntityIds } from "../entities/extract";
import { classifyEventTypes, normalizeEventTypes } from "../events/classify";

type ScoreOptions = {
  now?: Date;
  sourceWeights?: Record<string, number>;
  topics?: NewsTopic[];
  topicBurstGrades?: Record<string, BurstGrade>;
};

const FALLBACK_TOPIC = {
  id: "general",
  label: "일반",
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function titleSortKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toWeightMap(sources: NewsSource[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const source of sources) {
    const weight = Number(source.weight);
    map[source.id] = Number.isFinite(weight) ? weight : 0;
  }
  return map;
}

function parsePublishedAt(item: NewsItem): number {
  const preferred = Date.parse(item.publishedAt ?? "");
  if (Number.isFinite(preferred)) return preferred;
  const fetched = Date.parse(item.fetchedAt);
  return Number.isFinite(fetched) ? fetched : 0;
}

function recencyTier(item: NewsItem, now: Date): number {
  const publishedMs = parsePublishedAt(item);
  if (!Number.isFinite(publishedMs) || publishedMs <= 0) return 0;
  const ageHours = Math.max(0, (now.getTime() - publishedMs) / (1000 * 60 * 60));
  if (ageHours <= 24) return 3;
  if (ageHours <= 72) return 2;
  if (ageHours <= 7 * 24) return 1;
  return 0;
}

function totalKeywordHits(tags: TopicTag[]): number {
  return tags.reduce((sum, tag) => sum + Math.max(0, Number(tag.keywordHits) || 0), 0);
}

function buildScoreParts(
  item: NewsItem,
  tags: TopicTag[],
  sourceWeight: number,
  now: Date,
  _topicBurstGrades?: Record<string, BurstGrade>,
): ScoreParts {
  return ScorePartsSchema.parse({
    sourceWeight: round3(sourceWeight),
    recency: recencyTier(item, now),
    keywordHits: totalKeywordHits(tags),
    // Integration hook exists, but V3-NEWS-003 keeps burst boost fixed to 0.
    burstPlaceholder: 0,
  });
}

function totalFromParts(parts: ScoreParts): number {
  return round3(parts.sourceWeight + parts.recency + parts.keywordHits + parts.burstPlaceholder);
}

export function compareScoredItems(a: ScoredNewsItem, b: ScoredNewsItem): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
  const aPub = a.publishedAt ?? "";
  const bPub = b.publishedAt ?? "";
  if (aPub !== bPub) return bPub.localeCompare(aPub);
  const titleDiff = titleSortKey(a.title).localeCompare(titleSortKey(b.title));
  if (titleDiff !== 0) return titleDiff;
  return a.id.localeCompare(b.id);
}

export function scoreItem(item: NewsItem, options: ScoreOptions = {}): ScoredNewsItem {
  const now = options.now ?? new Date();
  const sourceWeights = options.sourceWeights ?? toWeightMap(NEWS_SOURCES);
  const sourceWeight = sourceWeights[item.sourceId] ?? 0;
  const tags = tagTopics(item, { topics: options.topics });
  const entities = normalizeEntityIds(item.entities && item.entities.length > 0
    ? item.entities
    : extractEntities({ title: item.title, snippet: item.snippet }));
  const entityPayload = entities.length > 0 ? { entities } : {};
  const eventTypes = normalizeEventTypes(item.eventTypes && item.eventTypes.length > 0
    ? item.eventTypes
    : classifyEventTypes({
      title: item.title,
      snippet: item.snippet,
      entities,
    }));
  const eventPayload = eventTypes.length > 0 ? { eventTypes } : {};
  const primary = tags[0]
    ? { id: canonicalizeTopicId(tags[0].topicId), label: tags[0].topicLabel }
    : FALLBACK_TOPIC;
  const scoreParts = buildScoreParts(item, tags, sourceWeight, now, options.topicBurstGrades);

  return ScoredNewsItemSchema.parse({
    ...item,
    ...entityPayload,
    ...eventPayload,
    tags,
    primaryTopicId: primary.id,
    primaryTopicLabel: primary.label,
    scoreParts,
    totalScore: totalFromParts(scoreParts),
  });
}

export function scoreItems(items: NewsItem[], options: ScoreOptions = {}): ScoredNewsItem[] {
  return items
    .map((item) => scoreItem(item, options))
    .sort(compareScoredItems);
}
