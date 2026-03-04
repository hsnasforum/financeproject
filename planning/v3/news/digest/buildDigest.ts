import { type SelectTopResult, type TopicDailyStat } from "../contracts";
import { canonicalizeTopicId } from "../taxonomy";
import { assertNoRecommendationText } from "../guard/noRecommendationText";
import {
  COUNTER_SIGNALS_BY_TOPIC,
  WATCHLIST_BY_TOPIC,
  WATCHLIST_LABELS_BY_TOPIC,
} from "./templates";
import { DigestDaySchema, type DigestDay, type DigestEvidence } from "./contracts";

type BuildDigestDayInput = {
  date: string;
  topResult: SelectTopResult;
  burstTopics: TopicDailyStat[];
};

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function burstWeight(grade: string | undefined): number {
  const normalized = (grade ?? "").trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return 4;
  if (normalized === "med" || normalized === "중") return 3;
  if (normalized === "low" || normalized === "하") return 2;
  return 1;
}

function pickTopicIds(topResult: SelectTopResult, burstTopics: TopicDailyStat[]): string[] {
  const ids = dedupe([
    ...topResult.topTopics.map((row) => canonicalizeTopicId(row.topicId)),
    ...burstTopics.map((row) => canonicalizeTopicId(row.topicId)),
  ]);
  return ids.length > 0 ? ids : ["general"];
}

function buildObservation(topResult: SelectTopResult, burstTopics: TopicDailyStat[]): string {
  const topLabels = topResult.topTopics.slice(0, 2).map((row) => row.topicLabel);
  const topicMix = topLabels.length > 0 ? topLabels.join("·") : "핵심 토픽";
  const primaryBurst = [...burstTopics].sort((a, b) => {
    const gradeDiff = burstWeight(b.burstGrade) - burstWeight(a.burstGrade);
    if (gradeDiff !== 0) return gradeDiff;
    if (a.count !== b.count) return b.count - a.count;
    return a.topicId.localeCompare(b.topicId);
  })[0];

  if (!primaryBurst) {
    return `관찰: ${topicMix} 관련 보도 비중이 유지되는 흐름이며, 단기 급증 신호는 제한적으로 관찰됩니다.`;
  }

  return `관찰: ${primaryBurst.topicLabel} 토픽의 기사량이 상대적으로 확대된 구간이며, ${topicMix} 이슈와의 동조 여부를 조건부로 점검할 필요가 있습니다.`;
}

function buildEvidence(topResult: SelectTopResult): DigestEvidence[] {
  const size = Math.min(5, Math.max(2, topResult.topItems.length));
  const picked = topResult.topItems.slice(0, size);

  return picked.map((item) => ({
    title: item.title,
    url: item.url,
    sourceId: item.sourceId,
    publishedAt: item.publishedAt ?? null,
    topics: dedupe(item.tags.map((tag) => canonicalizeTopicId(tag.topicId))).slice(0, 3),
  }));
}

function buildWatchlist(topicIds: string[]): string[] {
  const labels = topicIds.flatMap((topicId) => {
    const direct = WATCHLIST_LABELS_BY_TOPIC[topicId];
    if (direct && direct.length > 0) return direct;
    return (WATCHLIST_BY_TOPIC[topicId] ?? []).map((row) => row.label);
  });

  const out = dedupe(labels);
  if (out.length > 0) return out.slice(0, 8);
  return WATCHLIST_LABELS_BY_TOPIC.general.slice(0, 8);
}

function buildCounterSignals(topicIds: string[]): string[] {
  const fromTopic = dedupe(
    topicIds.flatMap((topicId) => COUNTER_SIGNALS_BY_TOPIC[topicId] ?? []),
  ).slice(0, 6);

  if (fromTopic.length > 0) {
    return fromTopic;
  }

  return COUNTER_SIGNALS_BY_TOPIC.general.slice(0, 3);
}

export function buildDigestDay(input: BuildDigestDayInput): DigestDay {
  const topicIds = pickTopicIds(input.topResult, input.burstTopics);
  const observation = buildObservation(input.topResult, input.burstTopics);
  const evidence = buildEvidence(input.topResult);
  const watchlist = buildWatchlist(topicIds);
  const counterSignals = buildCounterSignals(topicIds);

  assertNoRecommendationText(observation);
  assertNoRecommendationText(watchlist);
  assertNoRecommendationText(counterSignals);

  return DigestDaySchema.parse({
    date: input.date,
    observation,
    evidence,
    watchlist,
    counterSignals,
  });
}
