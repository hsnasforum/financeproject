import { type BurstLevel, type NewsScoringConfig, type ScoredNewsItem, type TaggedNewsItem } from "./types";

type TopicCountRow = {
  topicId: string;
  count: number;
};

type BurstMap = Record<string, BurstLevel> | Map<string, BurstLevel>;

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nowMillis(nowIso?: string): number {
  const parsed = Date.parse(nowIso ?? "");
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

function burstBoostForLevel(level: BurstLevel | null | undefined, config: NewsScoringConfig): number {
  const map = config.relativeScore?.topicBurstBoost ?? {};
  const high = asNumber(map.high, 0.4);
  const mid = asNumber(map.mid, 0.2);
  const low = asNumber(map.low, 0);
  if (level === "상") return high;
  if (level === "중") return mid;
  return low;
}

function getBurstLevel(map: BurstMap | undefined, topicId: string): BurstLevel | null {
  if (!map) return null;
  if (map instanceof Map) return map.get(topicId) ?? null;
  return map[topicId] ?? null;
}

function recencyBoost(publishedAt: string, nowTs: number, config: NewsScoringConfig): number {
  const parsed = Date.parse(publishedAt);
  if (!Number.isFinite(parsed)) return 0;
  const diffHours = Math.max(0, (nowTs - parsed) / (1000 * 60 * 60));
  const table = config.relativeScore?.recencyBoost ?? {};
  const within24h = asNumber(table.within24h, 1.0);
  const within48h = asNumber(table.within48h, 0.6);
  const within7d = asNumber(table.within7d, 0.2);
  const otherwise = asNumber(table.otherwise, 0);
  if (diffHours <= 24) return within24h;
  if (diffHours <= 48) return within48h;
  if (diffHours <= 24 * 7) return within7d;
  return otherwise;
}

function tieBreakSort(a: ScoredNewsItem, b: ScoredNewsItem): number {
  if (a.relativeScore !== b.relativeScore) return b.relativeScore - a.relativeScore;
  if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
  return a.canonicalUrl.localeCompare(b.canonicalUrl);
}

function countByTopicAndSource(items: TaggedNewsItem[]): Map<string, Map<string, number>> {
  const byTopic = new Map<string, Map<string, number>>();
  for (const item of items) {
    const sourceId = item.sourceId || "unknown";
    const bySource = byTopic.get(item.primaryTopicId) ?? new Map<string, number>();
    bySource.set(sourceId, (bySource.get(sourceId) ?? 0) + 1);
    byTopic.set(item.primaryTopicId, bySource);
  }
  return byTopic;
}

function topicTopSourceShare(byTopicSource: Map<string, Map<string, number>>, topicId: string): number {
  const bySource = byTopicSource.get(topicId);
  if (!bySource || bySource.size < 1) return 1;
  let total = 0;
  let top = 0;
  for (const count of bySource.values()) {
    total += count;
    if (count > top) top = count;
  }
  if (total < 1) return 1;
  return top / total;
}

function duplicatePenalty(item: TaggedNewsItem, duplicateCountsByKey: Map<string, number> | undefined, config: NewsScoringConfig): number {
  if (!duplicateCountsByKey) return 0;
  const count = duplicateCountsByKey.get(item.dedupeKey) ?? 1;
  if (count <= 1) return 0;
  return asNumber(config.relativeScore?.duplicatePenalty, 0.7);
}

function maxRecencyBoost(config: NewsScoringConfig): number {
  const table = config.relativeScore?.recencyBoost ?? {};
  return Math.max(
    asNumber(table.within24h, 1.0),
    asNumber(table.within48h, 0.6),
    asNumber(table.within7d, 0.2),
    asNumber(table.otherwise, 0),
    0.0001,
  );
}

export function scoreNewsItems(
  taggedItems: TaggedNewsItem[],
  config: NewsScoringConfig,
  options?: {
    nowIso?: string;
    topicCounts?: TopicCountRow[];
    burstLevelsByTopic?: BurstMap;
    duplicateCountsByKey?: Map<string, number>;
  },
): ScoredNewsItem[] {
  const nowTs = nowMillis(options?.nowIso);
  const keywordBoostCap = asNumber(config.relativeScore?.keywordBoostCap, 1.2);
  const diversityPenaltySlope = asNumber(config.relativeScore?.diversityPenaltySlope, 0.6);
  const diversityPenaltyStart = asNumber(config.relativeScore?.diversityPenaltyStart, 0.5);
  const byTopicSource = countByTopicAndSource(taggedItems);

  const sourceMax = clamp(asNumber(config.weights.sourceMax, 30), 0, 100);
  const keywordMax = clamp(asNumber(config.weights.keywordMax, 35), 0, 100);
  const recencyMax = clamp(asNumber(config.weights.recencyMax, 20), 0, 100);
  const focusMax = clamp(asNumber(config.weights.focusMax, 10), 0, 100);
  const maxRecency = maxRecencyBoost(config);

  const rows = taggedItems.map((item) => {
    const sourceWeight = clamp(asNumber((item as { sourceWeight?: number }).sourceWeight, 50), 0, 100);
    const sourceBase = sourceWeight / 100;
    const recency = recencyBoost(item.publishedAt, nowTs, config);
    const keyword = clamp(item.primaryTopicScore / 10, 0, keywordBoostCap);
    const burstLevel = getBurstLevel(options?.burstLevelsByTopic, item.primaryTopicId);
    const burst = burstBoostForLevel(burstLevel, config);
    const topShare = topicTopSourceShare(byTopicSource, item.primaryTopicId);
    const diversityPenalty = Math.max(0, topShare - diversityPenaltyStart) * diversityPenaltySlope;
    const dupPenalty = duplicatePenalty(item, options?.duplicateCountsByKey, config);
    const relativeScore = round2(sourceBase + recency + keyword + burst - diversityPenalty - dupPenalty);

    const sourceScore = round2(sourceBase * sourceMax);
    const keywordScore = round2((keyword / Math.max(keywordBoostCap, 0.0001)) * keywordMax);
    const recencyScore = round2((recency / maxRecency) * recencyMax);
    const focusScore = round2((burst / Math.max(asNumber(config.relativeScore?.topicBurstBoost?.high, 0.4), 0.0001)) * focusMax);

    return {
      ...item,
      sourceWeight,
      sourceScore,
      keywordScore,
      recencyScore,
      focusScore,
      totalScore: relativeScore,
      relativeScore,
      scoreParts: {
        source: round2(sourceBase),
        recency: round2(recency),
        keyword: round2(keyword),
        burst: round2(burst),
        diversityPenalty: round2(diversityPenalty),
        duplicatePenalty: round2(dupPenalty),
      },
    } satisfies ScoredNewsItem;
  });

  return rows.sort(tieBreakSort);
}

export function countByPrimaryTopic(items: TaggedNewsItem[]): TopicCountRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.primaryTopicId, (counts.get(item.primaryTopicId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([topicId, count]) => ({ topicId, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.topicId.localeCompare(b.topicId);
    });
}
