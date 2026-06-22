import fs from "node:fs";
import path from "node:path";
import { resolveNewsSearchIndexPath } from "@/lib/news/storageSqlite";
import {
  readNewsSearchIndex as readLegacyNewsSearchIndex,
  searchNewsIndex,
  writeNewsSearchIndex as writeLegacyNewsSearchIndex,
  type NewsSearchFilters,
} from "@/lib/news/searchIndex";
import { buildScoreRationale } from "@/lib/news/scoreRationale";
import {
  type BurstLevel,
  type NewsScoreParts,
  type NewsSearchIndex,
  type NewsSearchIndexItem,
} from "@/lib/news/types";
import { readNewsTopicTrends } from "@/lib/news/trendReader";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import { loadEffectiveNewsConfig } from "@/lib/planning/v3/news/settings";
import { readAllItems, readTrendsCache } from "@/lib/planning/v3/news/store";
import { resolveNewsRootDir } from "../../../../../planning/v3/news/rootDir";
import { scoreItems } from "../../../../../planning/v3/news/select/score";

type StoreSearchIndexBuildInput = {
  generatedAt: string;
  cwd?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCurrentUserNewsSearchIndexPath(cwd = process.cwd()): string {
  if (!isPlanningNamespaceEnabled()) {
    return resolveNewsSearchIndexPath(cwd);
  }
  return path.join(resolveNewsRootDir(cwd), "cache", "search-index.latest.json");
}

function normalizeScoreParts(value: {
  sourceWeight?: number;
  recency?: number;
  keywordHits?: number;
  burstPlaceholder?: number;
}): NewsScoreParts {
  return {
    source: Number.isFinite(value.sourceWeight) ? Number(value.sourceWeight) : 0,
    recency: Number.isFinite(value.recency) ? Number(value.recency) : 0,
    keyword: Number.isFinite(value.keywordHits) ? Number(value.keywordHits) : 0,
    burst: Number.isFinite(value.burstPlaceholder) ? Number(value.burstPlaceholder) : 0,
    diversityPenalty: 0,
    duplicatePenalty: 0,
  };
}

function toBurstLevel(value: unknown): BurstLevel {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "상") return "상";
  if (normalized === "med" || normalized === "중") return "중";
  return "하";
}

function readSearchIndexFromPath(filePath: string): NewsSearchIndex | null {
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

function writeSearchIndexToPath(index: NewsSearchIndex, filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

export function readCurrentUserNewsSearchIndex(cwd = process.cwd()): NewsSearchIndex | null {
  if (!isPlanningNamespaceEnabled()) {
    return readLegacyNewsSearchIndex(cwd);
  }
  return readSearchIndexFromPath(resolveCurrentUserNewsSearchIndexPath(cwd));
}

export function writeCurrentUserNewsSearchIndex(input: StoreSearchIndexBuildInput): NewsSearchIndex {
  if (!isPlanningNamespaceEnabled()) {
    return writeLegacyNewsSearchIndex(input);
  }
  return writeNewsSearchIndexFromStore(input);
}

export function readCurrentUserNewsTopicBurstMap(): Map<string, BurstLevel> {
  if (!isPlanningNamespaceEnabled()) {
    const trends = readNewsTopicTrends();
    return new Map((trends?.topics ?? []).map((row) => [asString(row.topicId), row.burstLevel]));
  }

  const cache = readTrendsCache(30) ?? readTrendsCache(7);
  return new Map((cache?.topics ?? []).map((row) => [asString(row.topicId), toBurstLevel(row.burstGrade)]));
}

export function writeNewsSearchIndexFromStore(input: StoreSearchIndexBuildInput): NewsSearchIndex {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = resolveNewsRootDir(cwd);
  const { sources, topics } = loadEffectiveNewsConfig(rootDir);
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
  const sourceWeights = Object.fromEntries(sources.map((source) => [source.id, source.weight]));
  const scored = scoreItems(readAllItems(rootDir), {
    now: new Date(input.generatedAt),
    sourceWeights,
    topics,
  });

  const items: NewsSearchIndexItem[] = scored.map((item) => {
    const primaryTopicId = asString(item.primaryTopicId).toLowerCase();
    const topicIds = new Set(
      item.tags
        .map((tag) => asString(tag.topicId).toLowerCase())
        .filter(Boolean),
    );
    if (primaryTopicId) {
      topicIds.add(primaryTopicId);
    }

    const entities = new Set(
      (item.entities ?? [])
        .map((entity) => asString(entity).toLowerCase())
        .filter(Boolean),
    );

    const scoreParts = normalizeScoreParts(item.scoreParts);

    return {
      id: item.id,
      title: item.title,
      url: item.url,
      publishedAt: asString(item.publishedAt) || item.fetchedAt,
      sourceId: item.sourceId,
      sourceName: sourceNameById.get(item.sourceId) ?? item.sourceId,
      topicId: item.primaryTopicId,
      topicLabel: item.primaryTopicLabel,
      topics: [...topicIds].sort((a, b) => a.localeCompare(b)),
      entities: [...entities].sort((a, b) => a.localeCompare(b)),
      score: item.totalScore,
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

  writeSearchIndexToPath(index, resolveCurrentUserNewsSearchIndexPath(cwd));
  return index;
}

export {
  searchNewsIndex,
  type NewsSearchFilters,
};
