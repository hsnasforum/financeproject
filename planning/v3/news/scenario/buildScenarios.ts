import { type DigestDay } from "../digest/contracts";
import { assertNoRecommendationText } from "../guard/noRecommendationText";
import { type TopicDailyStat } from "../trend/contracts";
import {
  ScenarioPackSchema,
  TriggerConditionSchema,
  type ScenarioCard,
  type ScenarioName,
  type ScenarioPack,
  type Trigger,
  type TriggerCondition,
} from "./contracts";
import { TOPIC_SCENARIO_TEMPLATE_MAP } from "./templates";

type BuildScenariosInput = {
  digest: DigestDay;
  trends: TopicDailyStat[];
  generatedAt?: string;
};

type TopicScore = {
  topicId: string;
  burstWeight: number;
  scoreSum: number;
  evidenceCount: number;
  sourceDiversity: number;
  burstCondition: TriggerCondition;
  shareCondition: TriggerCondition;
  diversityCondition: TriggerCondition;
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

function conditionFromBurst(grade: string | undefined): TriggerCondition {
  const normalized = (grade ?? "").trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "high";
  if (normalized === "med" || normalized === "중") return "med";
  return "low";
}

function conditionFromRatio(value: number): TriggerCondition {
  if (value >= 0.67) return "high";
  if (value >= 0.34) return "med";
  return "low";
}

function lowerCondition(value: TriggerCondition): TriggerCondition {
  if (value === "high") return "med";
  return "low";
}

function higherCondition(value: TriggerCondition): TriggerCondition {
  if (value === "low") return "med";
  return "high";
}

function computeTopicScores(digest: DigestDay, trends: TopicDailyStat[]): TopicScore[] {
  const trendMap = new Map<string, TopicDailyStat>();
  for (const trend of trends) {
    const key = trend.topicId.trim();
    if (!key) continue;
    trendMap.set(key, trend);
  }

  const evidenceCounts = new Map<string, number>();
  let evidenceTotal = 0;
  for (const evidence of digest.evidence) {
    for (const topicId of dedupe(evidence.topics)) {
      evidenceTotal += 1;
      evidenceCounts.set(topicId, (evidenceCounts.get(topicId) ?? 0) + 1);
    }
  }

  const topicIds = dedupe([
    ...trends.map((row) => row.topicId),
    ...[...evidenceCounts.keys()],
  ]);

  const scores = topicIds.map((topicId) => {
    const trend = trendMap.get(topicId);
    const evidenceCount = evidenceCounts.get(topicId) ?? 0;
    const share = evidenceTotal > 0 ? evidenceCount / evidenceTotal : 0;

    return {
      topicId,
      burstWeight: burstWeight(trend?.burstGrade),
      scoreSum: Number(trend?.scoreSum ?? 0),
      evidenceCount,
      sourceDiversity: Number(trend?.sourceDiversity ?? 0),
      burstCondition: conditionFromBurst(trend?.burstGrade),
      shareCondition: conditionFromRatio(share),
      diversityCondition: conditionFromRatio(Number(trend?.sourceDiversity ?? 0)),
    } satisfies TopicScore;
  });

  return scores.sort((a, b) => {
    if (a.burstWeight !== b.burstWeight) return b.burstWeight - a.burstWeight;
    if (a.scoreSum !== b.scoreSum) return b.scoreSum - a.scoreSum;
    if (a.evidenceCount !== b.evidenceCount) return b.evidenceCount - a.evidenceCount;
    return a.topicId.localeCompare(b.topicId);
  });
}

function buildTriggers(topic: TopicScore, mode: ScenarioName): Trigger[] {
  const burst = mode === "Bull"
    ? lowerCondition(topic.burstCondition)
    : mode === "Bear"
      ? higherCondition(topic.burstCondition)
      : topic.burstCondition;

  const share = mode === "Bull"
    ? lowerCondition(topic.shareCondition)
    : mode === "Bear"
      ? higherCondition(topic.shareCondition)
      : topic.shareCondition;

  const diversity = mode === "Bull"
    ? lowerCondition(topic.diversityCondition)
    : mode === "Bear"
      ? higherCondition(topic.diversityCondition)
      : topic.diversityCondition;

  const burstCondition = TriggerConditionSchema.parse(burst);
  const shareCondition = TriggerConditionSchema.parse(share);
  const diversityCondition = TriggerConditionSchema.parse(diversity);

  const triggers: Trigger[] = [
    { kind: "topicBurst", topicId: topic.topicId, condition: burstCondition, note: `${topic.topicId} 토픽 강도` },
    { kind: "topicShare", topicId: topic.topicId, condition: shareCondition, note: `${topic.topicId} 토픽 비중` },
    { kind: "sourceDiversity", topicId: topic.topicId, condition: diversityCondition, note: `${topic.topicId} 토픽 소스 다양성` },
  ];

  return triggers;
}

function buildCard(input: {
  name: ScenarioName;
  linkedTopics: string[];
  primary: TopicScore;
  topicLabelById: Record<string, string>;
}): ScenarioCard {
  const template = TOPIC_SCENARIO_TEMPLATE_MAP.get(input.primary.topicId)
    ?? TOPIC_SCENARIO_TEMPLATE_MAP.get("general");
  if (!template) {
    throw new Error("missing_scenario_template");
  }

  const modeKey = input.name === "Base" ? "base" : input.name === "Bull" ? "bull" : "bear";
  const linkedLabel = input.linkedTopics.map((topicId) => input.topicLabelById[topicId] ?? topicId).join("·");

  const observation = `${template.observation[modeKey]} 연결 토픽: ${linkedLabel}.`;
  const invalidation = template.invalidation[modeKey].slice(0, 2);
  const options = template.options[modeKey].slice(0, 3);
  const indicators = input.linkedTopics;
  const triggers = buildTriggers(input.primary, input.name);

  assertNoRecommendationText([
    observation,
    ...invalidation,
    ...options,
    ...triggers.map((row) => row.note ?? ""),
    ...indicators,
  ]);

  return {
    name: input.name,
    observation,
    triggers,
    invalidation,
    indicators,
    options,
    linkedTopics: input.linkedTopics,
  };
}

export function buildScenarios(input: BuildScenariosInput): ScenarioPack {
  const ranked = computeTopicScores(input.digest, input.trends);
  const fallback: TopicScore = {
    topicId: "general",
    burstWeight: 1,
    scoreSum: 0,
    evidenceCount: 0,
    sourceDiversity: 0,
    burstCondition: "low",
    shareCondition: "low",
    diversityCondition: "low",
  };

  const primary = ranked[0] ?? fallback;
  const linkedTopics = dedupe([
    primary.topicId,
    ...ranked.slice(1).map((row) => row.topicId),
  ]).slice(0, 3);

  const topicLabelById: Record<string, string> = {};
  for (const trend of input.trends) {
    topicLabelById[trend.topicId] = trend.topicLabel;
  }

  const cards: ScenarioCard[] = (["Base", "Bull", "Bear"] as const)
    .map((name) => buildCard({ name, linkedTopics, primary, topicLabelById }));

  const generatedAt = input.generatedAt ?? `${input.digest.date}T00:00:00.000Z`;

  return ScenarioPackSchema.parse({
    schemaVersion: 1,
    generatedAt,
    cards,
  });
}
