import fs from "node:fs";
import path from "node:path";
import { openNewsDatabase, closeNewsDatabase, resolveNewsSearchIndexPath } from "./storageSqlite.ts";
import { buildScoreRationale } from "./scoreRationale.ts";
import { type NewsScoreParts, type NewsSearchIndex, type NewsSearchIndexItem } from "./types.ts";

type SearchIndexBuildInput = {
  generatedAt: string;
  cwd?: string;
  db?: {
    prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> };
  };
};

export type NewsSearchFilters = {
  q?: string;
  topics?: string[];
  sources?: string[];
  dateFrom?: string;
  dateTo?: string;
  days?: number;
  minScore?: number;
  limit?: number;
  offset?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTokenList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((row) => asString(row).toLowerCase()).filter(Boolean))];
}

function normalizeScoreParts(value: unknown): NewsScoreParts {
  const fallback: NewsScoreParts = {
    source: 0,
    recency: 0,
    keyword: 0,
    burst: 0,
    diversityPenalty: 0,
    duplicatePenalty: 0,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  return {
    source: asNumber(row.source, 0),
    recency: asNumber(row.recency, 0),
    keyword: asNumber(row.keyword, 0),
    burst: asNumber(row.burst, 0),
    diversityPenalty: asNumber(row.diversityPenalty, 0),
    duplicatePenalty: asNumber(row.duplicatePenalty, 0),
  };
}

function parseScorePartsJson(raw: unknown): NewsScoreParts {
  const text = asString(raw);
  if (!text) return normalizeScoreParts(null);
  try {
    return normalizeScoreParts(JSON.parse(text) as unknown);
  } catch {
    return normalizeScoreParts(null);
  }
}

function safeDateMs(value: string): number {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokenize(input: string): string[] {
  return asString(input)
    .toLowerCase()
    .split(/\s+/g)
    .map((row) => row.trim())
    .filter(Boolean);
}

function compareSearchRank(a: NewsSearchIndexItem, b: NewsSearchIndexItem): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
  return a.title.localeCompare(b.title);
}

function searchWindowMs(filters: NewsSearchFilters): { fromMs: number; toMs: number } {
  const explicitFrom = safeDateMs(filters.dateFrom ?? "");
  const explicitTo = safeDateMs(filters.dateTo ?? "");
  if (explicitFrom > 0 || explicitTo > 0) {
    return {
      fromMs: explicitFrom > 0 ? explicitFrom : 0,
      toMs: explicitTo > 0 ? explicitTo : Number.MAX_SAFE_INTEGER,
    };
  }

  const days = Math.max(1, Math.min(365, Math.round(asNumber(filters.days, 30))));
  const now = Date.now();
  return {
    fromMs: now - days * 24 * 60 * 60 * 1000,
    toMs: Number.MAX_SAFE_INTEGER,
  };
}

export function readNewsSearchIndex(cwd = process.cwd()): NewsSearchIndex | null {
  const filePath = resolveNewsSearchIndexPath(cwd);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (!Array.isArray(row.items)) return null;
    return parsed as NewsSearchIndex;
  } catch {
    return null;
  }
}

export function writeNewsSearchIndex(input: SearchIndexBuildInput): NewsSearchIndex {
  const cwd = input.cwd ?? process.cwd();
  const ownDb = !input.db;
  const db = input.db ?? openNewsDatabase();

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
        relativeScore,
        scorePartsJson
      FROM news_items
      ORDER BY publishedAt DESC, id ASC
    `).all() as Array<Record<string, unknown>>;

    const topicRows = db.prepare(`
      SELECT
        itemId,
        topicId,
        keywordMatches,
        entityMatches
      FROM news_item_topics
      ORDER BY itemId ASC, score DESC, topicId ASC
    `).all() as Array<Record<string, unknown>>;

    const byItem = new Map<string, { topics: Set<string>; entities: Set<string> }>();
    for (const row of topicRows) {
      const itemId = asString(row.itemId);
      if (!itemId) continue;
      const bucket = byItem.get(itemId) ?? { topics: new Set<string>(), entities: new Set<string>() };
      const topicId = asString(row.topicId).toLowerCase();
      if (topicId) bucket.topics.add(topicId);

      try {
        const entities = JSON.parse(asString(row.entityMatches) || "[]") as unknown;
        if (Array.isArray(entities)) {
          for (const entity of entities) {
            const token = asString(entity).toLowerCase();
            if (token) bucket.entities.add(token);
          }
        }
      } catch {
        // ignore malformed json
      }
      byItem.set(itemId, bucket);
    }

    const items: NewsSearchIndexItem[] = itemsRows.map((row) => {
      const id = asString(row.id);
      const topicBucket = byItem.get(id);
      const primaryTopic = asString(row.topicId).toLowerCase();
      const scoreParts = parseScorePartsJson(row.scorePartsJson);
      const topics = new Set<string>(topicBucket?.topics ?? []);
      if (primaryTopic) topics.add(primaryTopic);
      return {
        id,
        title: asString(row.title),
        url: asString(row.url),
        publishedAt: asString(row.publishedAt),
        sourceId: asString(row.sourceId),
        sourceName: asString(row.sourceName),
        topicId: asString(row.topicId),
        topicLabel: asString(row.topicLabel),
        topics: [...topics].sort((a, b) => a.localeCompare(b)),
        entities: [...(topicBucket?.entities ?? [])].sort((a, b) => a.localeCompare(b)),
        score: asNumber(row.relativeScore, 0),
        rationale: buildScoreRationale({ scoreParts }),
        scoreParts,
      };
    });

    const index: NewsSearchIndex = {
      generatedAt: input.generatedAt,
      timezone: "Asia/Seoul",
      itemCount: items.length,
      items,
    };

    const filePath = resolveNewsSearchIndexPath(cwd);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
    return index;
  } finally {
    if (ownDb) {
      closeNewsDatabase(db as ReturnType<typeof openNewsDatabase>);
    }
  }
}

export function searchNewsIndex(
  index: NewsSearchIndex,
  filters: NewsSearchFilters,
): {
  total: number;
  items: NewsSearchIndexItem[];
  topics: Array<{ topicId: string; topicLabel: string; count: number }>;
  sources: Array<{ sourceId: string; sourceName: string; count: number }>;
} {
  const qTokens = tokenize(filters.q ?? "");
  const topicsFilter = new Set(normalizeTokenList(filters.topics));
  const sourcesFilter = new Set(normalizeTokenList(filters.sources));
  const minScore = asNumber(filters.minScore, Number.NEGATIVE_INFINITY);
  const { fromMs, toMs } = searchWindowMs(filters);
  const limit = Math.max(1, Math.min(200, Math.round(asNumber(filters.limit, 100))));
  const offset = Math.max(0, Math.round(asNumber(filters.offset, 0)));

  const filtered = index.items.filter((item) => {
    const score = asNumber(item.score, 0);
    if (score < minScore) return false;

    const publishedMs = safeDateMs(item.publishedAt);
    if (publishedMs < fromMs || publishedMs > toMs) return false;

    if (topicsFilter.size > 0) {
      const matched = item.topics.some((topic) => topicsFilter.has(asString(topic).toLowerCase()))
        || topicsFilter.has(asString(item.topicId).toLowerCase());
      if (!matched) return false;
    }

    if (sourcesFilter.size > 0 && !sourcesFilter.has(asString(item.sourceId).toLowerCase())) {
      return false;
    }

    if (qTokens.length > 0) {
      const haystack = `${item.title} ${item.topicLabel} ${item.topics.join(" ")} ${item.entities.join(" ")} ${item.sourceName}`.toLowerCase();
      for (const token of qTokens) {
        if (!haystack.includes(token)) return false;
      }
    }

    return true;
  });

  const ranked = [...filtered].sort(compareSearchRank);
  const sliced = ranked.slice(offset, offset + limit);

  const topicMap = new Map<string, { topicId: string; topicLabel: string; count: number }>();
  const sourceMap = new Map<string, { sourceId: string; sourceName: string; count: number }>();
  for (const row of ranked) {
    const topicId = asString(row.topicId);
    const topic = topicMap.get(topicId) ?? {
      topicId,
      topicLabel: asString(row.topicLabel),
      count: 0,
    };
    topic.count += 1;
    topicMap.set(topicId, topic);

    const sourceId = asString(row.sourceId);
    const source = sourceMap.get(sourceId) ?? {
      sourceId,
      sourceName: asString(row.sourceName),
      count: 0,
    };
    source.count += 1;
    sourceMap.set(sourceId, source);
  }

  const topics = [...topicMap.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.topicLabel.localeCompare(b.topicLabel);
  });
  const sources = [...sourceMap.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.sourceName.localeCompare(b.sourceName);
  });

  return {
    total: ranked.length,
    items: sliced,
    topics,
    sources,
  };
}
