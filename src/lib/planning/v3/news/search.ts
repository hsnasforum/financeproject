import fs from "node:fs";
import path from "node:path";
import { resolveNewsSearchIndexPath } from "@/lib/news/storageSqlite";
import {
  readNewsSearchIndex,
  searchNewsIndex,
  writeNewsSearchIndex,
  type NewsSearchFilters,
} from "@/lib/news/searchIndex";
import { buildScoreRationale } from "@/lib/news/scoreRationale";
import {
  type NewsScoreParts,
  type NewsSearchIndex,
  type NewsSearchIndexItem,
} from "@/lib/news/types";
import { readNewsTopicTrends } from "@/lib/news/trendReader";
import { resolveDataDir } from "@/lib/planning/storage/dataDir";
import { loadEffectiveNewsConfig } from "@/lib/planning/v3/news/settings";
import { readAllItems } from "@/lib/planning/v3/news/store";
import { scoreItems } from "../../../../../planning/v3/news/select/score";

type StoreSearchIndexBuildInput = {
  generatedAt: string;
  cwd?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveNewsStoreRoot(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "news");
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

export function writeNewsSearchIndexFromStore(input: StoreSearchIndexBuildInput): NewsSearchIndex {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = resolveNewsStoreRoot(cwd);
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

  const filePath = resolveNewsSearchIndexPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  return index;
}

export {
  readNewsSearchIndex,
  readNewsTopicTrends,
  searchNewsIndex,
  writeNewsSearchIndex,
  type NewsSearchFilters,
};
