import { type DigestDay } from "../digest/contracts";
import { assertNoRecommendationText } from "../guard/noRecommendationText";
import { type TopicDailyStat } from "../trend/contracts";
import {
  ScenarioPackSchema,
  TopicScenarioTemplateSchema,
  TriggerConditionSchema,
  type ScenarioCard,
  type ScenarioName,
  type ScenarioPack,
  type TopicScenarioTemplate,
  type Trigger,
  type TriggerCondition,
} from "./contracts";
import { TOPIC_SCENARIO_TEMPLATE_MAP, TOPIC_SCENARIO_TEMPLATES } from "./templates";
import { computeScenarioQualityGates, type ScenarioQualityGateResult } from "./qualityGates";
import { resolveEvidenceSeriesIds } from "../evidenceGraph/ssot";

type BuildScenariosInput = {
  digest: DigestDay;
  trends: TopicDailyStat[];
  generatedAt?: string;
  libraryTemplates?: TopicScenarioTemplate[];
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

function buildChangeAttribution(input: {
  primary: TopicScore;
  linkedTopics: string[];
  topicLabelById: Record<string, string>;
  qualityGates: ScenarioQualityGateResult;
}): { title: "가능한 요인"; drivers: string[] } {
  const topicLabel = input.topicLabelById[input.primary.topicId] ?? input.primary.topicId;
  const linkedLabels = input.linkedTopics
    .map((topicId) => input.topicLabelById[topicId] ?? topicId)
    .slice(0, 3)
    .join("·");

  const burstLine = input.primary.burstCondition === "high"
    ? `가능한 요인: ${topicLabel} 토픽의 급증 강도가 높은 구간으로 관찰되어 변화 신호를 키웠을 수 있습니다.`
    : input.primary.burstCondition === "med"
      ? `가능한 요인: ${topicLabel} 토픽의 급증 강도가 중간 수준으로 누적되어 변화 흐름에 영향을 주었을 수 있습니다.`
      : `가능한 요인: ${topicLabel} 토픽의 급증 강도는 낮지만 연속 노출이 누적되어 완만한 변화로 이어졌을 수 있습니다.`;

  const shareLine = input.primary.shareCondition === "high"
    ? `가능한 요인: 연결 토픽(${linkedLabels})의 기사 비중이 높아 상대적 주제 집중이 반영되었을 수 있습니다.`
    : input.primary.shareCondition === "med"
      ? `가능한 요인: 연결 토픽(${linkedLabels})의 기사 비중이 중간 수준으로 유지되어 요약 방향에 반영되었을 수 있습니다.`
      : `가능한 요인: 연결 토픽(${linkedLabels})의 기사 비중이 분산되어 단일 흐름 강도는 제한되었을 수 있습니다.`;

  const uncertaintyLine = input.qualityGates.contradictionLevel === "high"
    ? "가능한 요인: 토픽 내부 상충 신호가 높아 해석 분기가 커졌을 수 있습니다."
    : input.qualityGates.dedupeLevel === "high"
      ? "가능한 요인: 유사 기사 중복이 높아 체감 변화 강도가 과대 인식되었을 수 있습니다."
      : "가능한 요인: 소스 다양성과 상충 신호 조합이 해석 강도 차이를 만들었을 수 있습니다.";

  return {
    title: "가능한 요인",
    drivers: [burstLine, shareLine, uncertaintyLine],
  };
}

function buildCard(input: {
  name: ScenarioName;
  linkedTopics: string[];
  primary: TopicScore;
  topicLabelById: Record<string, string>;
  templateByTopicId: Map<string, TopicScenarioTemplate>;
  fallbackTemplate: TopicScenarioTemplate;
  qualityGates: ScenarioQualityGateResult;
}): ScenarioCard {
  const template = input.templateByTopicId.get(input.primary.topicId)
    ?? input.fallbackTemplate;

  const modeKey = input.name === "Base" ? "base" : input.name === "Bull" ? "bull" : "bear";
  const linkedLabel = input.linkedTopics.map((topicId) => input.topicLabelById[topicId] ?? topicId).join("·");

  const observation = `${template.observation[modeKey]} 연결 토픽: ${linkedLabel}.`;
  const invalidation = template.invalidation[modeKey].slice(0, 2);
  const options = template.options[modeKey].slice(0, 3);
  const indicators = resolveEvidenceSeriesIds({
    topics: input.linkedTopics,
    maxSeriesIds: 6,
  });
  const triggers = buildTriggers(input.primary, input.name);
  const changeAttribution = buildChangeAttribution({
    primary: input.primary,
    linkedTopics: input.linkedTopics,
    topicLabelById: input.topicLabelById,
    qualityGates: input.qualityGates,
  });

  assertNoRecommendationText([
    observation,
    ...invalidation,
    ...options,
    ...changeAttribution.drivers,
    ...input.qualityGates.uncertaintyLabels,
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
    changeAttribution,
    quality: input.qualityGates.uncertaintyLabels.length > 0
      ? {
          dedupeLevel: input.qualityGates.dedupeLevel,
          contradictionLevel: input.qualityGates.contradictionLevel,
          uncertaintyLabels: input.qualityGates.uncertaintyLabels,
        }
      : undefined,
  };
}

export function buildScenarios(input: BuildScenariosInput): ScenarioPack {
  const libraryTemplates = Array.isArray(input.libraryTemplates)
    ? input.libraryTemplates.map((row) => TopicScenarioTemplateSchema.parse(row))
    : TOPIC_SCENARIO_TEMPLATES;
  const templateByTopicId = new Map(
    libraryTemplates.map((row) => [row.topicId, row] as const),
  );
  const fallbackTemplate = templateByTopicId.get("general")
    ?? TOPIC_SCENARIO_TEMPLATE_MAP.get("general")
    ?? TOPIC_SCENARIO_TEMPLATES[0];
  if (!fallbackTemplate) {
    throw new Error("missing_scenario_template");
  }

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
  const qualityGates = computeScenarioQualityGates({
    digest: input.digest,
    linkedTopics,
  });

  const cards: ScenarioCard[] = (["Base", "Bull", "Bear"] as const)
    .map((name) => buildCard({
      name,
      linkedTopics,
      primary,
      topicLabelById,
      templateByTopicId,
      fallbackTemplate,
      qualityGates,
    }));

  const generatedAt = input.generatedAt ?? `${input.digest.date}T00:00:00.000Z`;

  return ScenarioPackSchema.parse({
    schemaVersion: 1,
    generatedAt,
    cards,
  });
}
