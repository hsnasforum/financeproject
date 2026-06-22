import { closeNewsDatabase, openNewsDatabase, readNewsTopicTrends, type BurstLevel } from "../news/items";

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
  const artifact = readNewsTopicTrends();
  const out = new Map<string, BurstLevel>();
  for (const row of artifact?.topics ?? []) {
    out.set(asString(row.topicId), row.burstLevel);
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
