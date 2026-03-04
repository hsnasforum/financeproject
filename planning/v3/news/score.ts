import {
  ScoredNewsItemSchema,
  ScorePartsSchema,
  type NewsItem,
  type NewsSource,
  type NewsTopic,
  type ScoreParts,
  type ScoredNewsItem,
  type TopicTag,
} from "./contracts";
import { NEWS_SOURCES } from "./sources";
import { canonicalizeTopicId, tagItemTopics } from "./taxonomy";

type ScoreOptions = {
  now?: Date;
  sourceWeights?: Record<string, number>;
  topics?: NewsTopic[];
};

const FALLBACK_TOPIC = {
  id: "general",
  label: "일반",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toWeightMap(sources: NewsSource[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const source of sources) {
    map[source.id] = clamp(Number(source.weight) || 0, 0, 2);
  }
  return map;
}

function computeRecencyScore(publishedAt: string | undefined, now: Date): number {
  if (!publishedAt) return 0;
  const publishedTs = Date.parse(publishedAt);
  if (!Number.isFinite(publishedTs)) return 0;
  const ageHours = Math.max(0, (now.getTime() - publishedTs) / (1000 * 60 * 60));

  if (ageHours <= 24) return 1.0;
  if (ageHours <= 48) return 0.6;
  if (ageHours <= 72) return 0.3;
  return 0;
}

function buildScoreParts(item: NewsItem, tags: TopicTag[], sourceWeight: number, now: Date): ScoreParts {
  const keywordHits = tags.reduce((sum, tag) => sum + tag.hits.length, 0);
  return ScorePartsSchema.parse({
    sourceWeight: round3(clamp(sourceWeight, 0, 1)),
    recency: round3(computeRecencyScore(item.publishedAt, now)),
    keywordHits,
    burstPlaceholder: 0,
  });
}

function totalFromParts(parts: ScoreParts): number {
  // Deterministic and simple: source + recency + keyword contribution.
  return round3(parts.sourceWeight + parts.recency + (parts.keywordHits * 0.25) + parts.burstPlaceholder);
}

export function scoreItem(item: NewsItem, options: ScoreOptions = {}): ScoredNewsItem {
  const now = options.now ?? new Date();
  const sourceWeights = options.sourceWeights ?? toWeightMap(NEWS_SOURCES);
  const topics = options.topics;
  const sourceWeight = sourceWeights[item.sourceId] ?? 0.5;
  const tags = tagItemTopics(item, topics);
  const primary = tags[0]
    ? { id: canonicalizeTopicId(tags[0].topicId), label: tags[0].topicLabel }
    : FALLBACK_TOPIC;

  const scoreParts = buildScoreParts(item, tags, sourceWeight, now);
  return ScoredNewsItemSchema.parse({
    ...item,
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
    .sort((a, b) => {
      if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
      const aPub = a.publishedAt ?? "";
      const bPub = b.publishedAt ?? "";
      if (aPub !== bPub) return bPub.localeCompare(aPub);
      return a.id.localeCompare(b.id);
    });
}
