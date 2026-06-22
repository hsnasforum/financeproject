import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import { loadEffectiveNewsConfig } from "@/lib/planning/v3/news/settings";
import { readAllItems, readTrendsCache } from "@/lib/planning/v3/news/store";
import { closeNewsDatabase, openNewsDatabase, readNewsTopicTrends, type BurstLevel } from "../news/items";
import { resolveNewsRootDir } from "../../../../../planning/v3/news/rootDir";
import { scoreItems } from "../../../../../planning/v3/news/select/score";

export type { BurstLevel };

export type NewsItemsFilters = {
  q: string;
  topicId: string;
  sourceId: string;
  burst: "all" | BurstLevel;
  days: number;
  limit: number;
  offset: number;
};

export type NewsItemRow = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  sourceName: string;
  topicId: string;
  topicLabel: string;
  score: number;
  burstLevel: BurstLevel;
};

export type NewsTopicFacet = {
  topicId: string;
  topicLabel: string;
  count: number;
  burstLevel: BurstLevel;
};

export type NewsSourceFacet = {
  sourceId: string;
  sourceName: string;
  count: number;
};

export type NewsItemsResult = {
  total: number;
  items: NewsItemRow[];
  topics: NewsTopicFacet[];
  sources: NewsSourceFacet[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNonNegativeCount(value: unknown): number {
  const count = Number.parseInt(asNumber(value, 0).toFixed(0), 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function keywordLikePattern(input: string): string {
  const escaped = input.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped.replace(/\s+/g, "%")}%`;
}

function topicBurstMap(): Map<string, BurstLevel> {
  if (isPlanningNamespaceEnabled()) {
    return currentUserTopicBurstMap();
  }
  const artifact = readNewsTopicTrends();
  const out = new Map<string, BurstLevel>();
  for (const row of artifact?.topics ?? []) {
    out.set(asString(row.topicId), row.burstLevel);
  }
  return out;
}

function toBurstLevel(value: unknown): BurstLevel {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "상") return "상";
  if (normalized === "med" || normalized === "중") return "중";
  return "하";
}

function currentUserTopicBurstMap(): Map<string, BurstLevel> {
  const cache = readTrendsCache(30) ?? readTrendsCache(7);
  const out = new Map<string, BurstLevel>();
  for (const row of cache?.topics ?? []) {
    out.set(asString(row.topicId), toBurstLevel(row.burstGrade));
  }
  return out;
}

function buildWhere(input: {
  filters: NewsItemsFilters;
  burstMap: Map<string, BurstLevel>;
}): { whereSql: string; params: Record<string, string | number> } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  const startMs = Date.now() - (input.filters.days * 24 * 60 * 60 * 1000);
  params.startIso = new Date(startMs).toISOString();
  where.push("publishedAt >= @startIso");

  if (input.filters.q) {
    params.queryLike = keywordLikePattern(input.filters.q);
    where.push(`(
      LOWER(title) LIKE @queryLike ESCAPE '\\'
      OR LOWER(sourceName) LIKE @queryLike ESCAPE '\\'
      OR LOWER(primaryTopicLabel) LIKE @queryLike ESCAPE '\\'
    )`);
  }

  if (input.filters.topicId) {
    params.topicId = input.filters.topicId;
    where.push("primaryTopicId = @topicId");
  }

  if (input.filters.sourceId) {
    params.sourceId = input.filters.sourceId;
    where.push("sourceId = @sourceId");
  }

  if (input.filters.burst !== "all") {
    const topicIds = [...input.burstMap.entries()]
      .filter(([, level]) => level === input.filters.burst)
      .map(([topicId]) => topicId);
    if (topicIds.length < 1) {
      where.push("1 = 0");
    } else {
      const placeholders: string[] = [];
      topicIds.forEach((topicId, index) => {
        const key = `burstTopic${index}`;
        params[key] = topicId;
        placeholders.push(`@${key}`);
      });
      where.push(`primaryTopicId IN (${placeholders.join(", ")})`);
    }
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export function readCurrentUserNewsItems(filters: NewsItemsFilters): NewsItemsResult {
  if (isPlanningNamespaceEnabled()) {
    return readCurrentUserNewsItemsFromStore(filters);
  }

  const burstByTopic = topicBurstMap();
  const where = buildWhere({ filters, burstMap: burstByTopic });
  const db = openNewsDatabase();
  try {
    const itemsRows = db.prepare(`
      SELECT
        id,
        title,
        url,
        publishedAt,
        sourceId,
        sourceName,
        primaryTopicId AS topicId,
        primaryTopicLabel AS topicLabel,
        relativeScore
      FROM news_items
      ${where.whereSql}
      ORDER BY relativeScore DESC, publishedAt DESC, canonicalUrl ASC
      LIMIT @limit OFFSET @offset
    `).all({ ...where.params, limit: filters.limit, offset: filters.offset }) as Array<Record<string, unknown>>;

    const countRow = db.prepare(`
      SELECT COUNT(1) AS total
      FROM news_items
      ${where.whereSql}
    `).get(where.params) as Record<string, unknown> | undefined;

    const topicRows = db.prepare(`
      SELECT
        primaryTopicId AS topicId,
        primaryTopicLabel AS topicLabel,
        COUNT(1) AS itemCount
      FROM news_items
      ${where.whereSql}
      GROUP BY primaryTopicId, primaryTopicLabel
      ORDER BY itemCount DESC, topicLabel ASC
      LIMIT 50
    `).all(where.params) as Array<Record<string, unknown>>;

    const sourceRows = db.prepare(`
      SELECT
        sourceId,
        sourceName,
        COUNT(1) AS itemCount
      FROM news_items
      ${where.whereSql}
      GROUP BY sourceId, sourceName
      ORDER BY itemCount DESC, sourceName ASC
      LIMIT 50
    `).all(where.params) as Array<Record<string, unknown>>;

    const items: NewsItemRow[] = itemsRows.map((row) => {
      const topicId = asString(row.topicId);
      return {
        id: asString(row.id),
        title: asString(row.title),
        url: asString(row.url),
        publishedAt: asString(row.publishedAt),
        sourceId: asString(row.sourceId),
        sourceName: asString(row.sourceName),
        topicId,
        topicLabel: asString(row.topicLabel),
        score: asNumber(row.relativeScore, 0),
        burstLevel: burstByTopic.get(topicId) ?? "하",
      };
    });

    const topics: NewsTopicFacet[] = topicRows.map((row) => {
      const topicId = asString(row.topicId);
      return {
        topicId,
        topicLabel: asString(row.topicLabel),
        count: asNonNegativeCount(row.itemCount),
        burstLevel: burstByTopic.get(topicId) ?? "하",
      };
    });

    const sources: NewsSourceFacet[] = sourceRows.map((row) => ({
      sourceId: asString(row.sourceId),
      sourceName: asString(row.sourceName),
      count: asNonNegativeCount(row.itemCount),
    }));

    return {
      total: asNonNegativeCount(countRow?.total),
      items,
      topics,
      sources,
    };
  } finally {
    closeNewsDatabase(db);
  }
}

function readCurrentUserNewsItemsFromStore(filters: NewsItemsFilters): NewsItemsResult {
  const rootDir = resolveNewsRootDir();
  const burstByTopic = topicBurstMap();
  const { sources, topics } = loadEffectiveNewsConfig(rootDir);
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
  const sourceWeights = Object.fromEntries(sources.map((source) => [source.id, source.weight]));
  const scored = scoreItems(readAllItems(rootDir), {
    sourceWeights,
    topics,
  });
  const query = filters.q.trim().toLowerCase();
  const startMs = Date.now() - (filters.days * 24 * 60 * 60 * 1000);

  const filtered = scored.filter((item) => {
    const publishedAt = asString(item.publishedAt) || item.fetchedAt;
    const publishedMs = Date.parse(publishedAt);
    if (!Number.isFinite(publishedMs) || publishedMs < startMs) return false;

    const sourceName = sourceNameById.get(item.sourceId) ?? item.sourceId;
    if (query) {
      const haystack = `${item.title} ${sourceName} ${item.primaryTopicLabel}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (filters.topicId && item.primaryTopicId !== filters.topicId) return false;
    if (filters.sourceId && item.sourceId !== filters.sourceId) return false;
    if (filters.burst !== "all" && (burstByTopic.get(item.primaryTopicId) ?? "하") !== filters.burst) return false;
    return true;
  }).sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    const aPublished = asString(a.publishedAt) || a.fetchedAt;
    const bPublished = asString(b.publishedAt) || b.fetchedAt;
    if (aPublished !== bPublished) return bPublished.localeCompare(aPublished);
    return a.url.localeCompare(b.url);
  });

  const items = filtered.slice(filters.offset, filters.offset + filters.limit).map((item) => {
    const topicId = item.primaryTopicId;
    return {
      id: item.id,
      title: item.title,
      url: item.url,
      publishedAt: asString(item.publishedAt) || item.fetchedAt,
      sourceId: item.sourceId,
      sourceName: sourceNameById.get(item.sourceId) ?? item.sourceId,
      topicId,
      topicLabel: item.primaryTopicLabel,
      score: item.totalScore,
      burstLevel: burstByTopic.get(topicId) ?? "하",
    };
  });

  const topicMap = new Map<string, NewsTopicFacet>();
  const sourceMap = new Map<string, NewsSourceFacet>();
  for (const item of filtered) {
    const topicId = item.primaryTopicId;
    const topic = topicMap.get(topicId) ?? {
      topicId,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      burstLevel: burstByTopic.get(topicId) ?? "하",
    };
    topic.count += 1;
    topicMap.set(topicId, topic);

    const source = sourceMap.get(item.sourceId) ?? {
      sourceId: item.sourceId,
      sourceName: sourceNameById.get(item.sourceId) ?? item.sourceId,
      count: 0,
    };
    source.count += 1;
    sourceMap.set(item.sourceId, source);
  }

  return {
    total: filtered.length,
    items,
    topics: [...topicMap.values()].sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.topicLabel.localeCompare(b.topicLabel);
    }),
    sources: [...sourceMap.values()].sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.sourceName.localeCompare(b.sourceName);
    }),
  };
}
