import { readNewsDigestDay as readLegacyNewsDigestDay } from "@/lib/news/digestReader";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import {
  readDigest as readStoredDigest,
  readTodayCache as readStoredTodayCache,
  type TodayCache,
} from "@/lib/planning/v3/news/store";
import {
  type DailyDigest,
  type DigestWatchItem as V3DigestWatchItem,
  type ScoredNewsItem,
  type TopicDailyStat,
  type TopTopic,
} from "@/lib/planning/v3/news/contracts";
import { type DigestDay, type DigestWatchItem } from "@/lib/news/types";

export type { DigestDay, DigestWatchItem } from "@/lib/news/types";

function burstLevel(value: string | undefined): "상" | "중" | "하" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "상";
  if (normalized === "med" || normalized === "중") return "중";
  return "하";
}

function mapTopTopic(row: TopTopic) {
  return {
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.count,
    scoreSum: row.scoreSum,
    burstLevel: "하" as const,
  };
}

function mapBurstTopic(row: TopicDailyStat) {
  return {
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.count,
    scoreSum: row.scoreSum,
    burstLevel: burstLevel(row.burstGrade),
  };
}

function mapTopItem(item: ScoredNewsItem) {
  return {
    topicId: item.primaryTopicId,
    topicLabel: item.primaryTopicLabel,
    title: item.title,
    url: item.url,
    score: item.totalScore,
    publishedAt: item.publishedAt ?? "",
    sourceName: item.sourceId,
    rationale: item.tags.map((tag) => tag.topicLabel).join(", ") || item.primaryTopicLabel,
    scoreParts: {
      source: item.scoreParts.sourceWeight,
      recency: item.scoreParts.recency,
      keyword: item.scoreParts.keywordHits,
      burst: item.scoreParts.burstPlaceholder,
      diversityPenalty: 0,
      duplicatePenalty: 0,
    },
    snippet: item.snippet ?? "",
  };
}

function mapWatchItem(row: V3DigestWatchItem): DigestWatchItem {
  return {
    label: row.label,
    seriesId: row.seriesId,
    view: row.view === "zscore" || row.view === "pctChange" ? row.view : "last",
    window: row.window,
    status: row.status,
    valueSummary: row.compactSummary,
    asOf: row.asOf ?? null,
  };
}

function fromDailyDigest(digest: DailyDigest): DigestDay {
  return {
    date: digest.dateRange.toKst,
    generatedAt: digest.generatedAt,
    topItems: digest.topItems.map(mapTopItem),
    topTopics: digest.topTopics.map(mapTopTopic),
    burstTopics: digest.burstTopics.map(mapBurstTopic),
    watchlist: digest.watchlist.map(mapWatchItem),
    scenarioCards: [],
    summary: {
      observation: digest.observationLines[0] ?? "관찰 데이터가 아직 충분하지 않습니다.",
      evidenceLinks: digest.topItems.slice(0, 5).map((item) => item.url),
      watchVariables: digest.watchlist.map((row) => row.label),
      counterSignals: digest.observationLines.slice(1, 4),
    },
  };
}

function fromTodayCache(cache: TodayCache): DigestDay {
  return {
    date: cache.digest.date,
    generatedAt: cache.generatedAt,
    topItems: [],
    topTopics: [],
    burstTopics: [],
    watchlist: cache.digest.watchlist.map((label) => ({
      label,
      seriesId: "",
      view: "last",
      window: 1,
      status: "unknown",
      valueSummary: "데이터 부족",
      asOf: null,
    })),
    scenarioCards: cache.scenarios.cards.map((card) => ({
      name: card.name,
      confidence: "중",
      triggerStatus: card.triggers.some((trigger) => trigger.condition === "high" || trigger.condition === "med")
        ? "met"
        : "not_met",
      triggerSummary: card.triggers.map((trigger) => `${trigger.kind}:${trigger.topicId}:${trigger.condition}`).join(", "),
      observation: card.observation,
      interpretations: card.changeAttribution?.drivers ?? [card.observation],
      confirmIndicators: card.indicators,
      options: card.options,
      uncertaintyLabel: card.quality?.uncertaintyLabels?.[0] ?? "",
      consensusGrade: "med",
      assumptions: card.triggers.map((trigger) => trigger.note ?? trigger.topicId),
      trigger: card.triggers.map((trigger) => `${trigger.kind}:${trigger.topicId}:${trigger.condition}`),
      invalidation: card.invalidation,
      indicators: card.indicators,
      impactPath: card.linkedTopics.join(", "),
      monitoringOptions: card.options,
    })),
    summary: {
      observation: cache.digest.observation,
      evidenceLinks: cache.digest.evidence.map((row) => row.url),
      watchVariables: cache.digest.watchlist,
      counterSignals: cache.digest.counterSignals,
    },
  };
}

export function readNewsDigestDay(): DigestDay | null {
  const storedDigest = readStoredDigest();
  if (storedDigest) return fromDailyDigest(storedDigest);

  const todayCache = readStoredTodayCache();
  if (todayCache) return fromTodayCache(todayCache);

  if (isPlanningNamespaceEnabled()) return null;
  return readLegacyNewsDigestDay();
}
