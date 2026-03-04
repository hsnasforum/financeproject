import {
  ScenarioPackSchema,
  type DailyDigest,
  type ScenarioCard,
  type ScenarioName,
  type ScenarioPack,
  type TopicDailyStat,
} from "./contracts";
import { noRecommendationText } from "./digest";

type BuildScenariosInput = {
  digest: DailyDigest;
  trends: TopicDailyStat[];
  generatedAt?: string;
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

function assertConditionalStrings(values: string[]): void {
  for (const value of values) {
    if (!noRecommendationText(value)) {
      throw new Error("recommendation_language_detected");
    }
  }
}

function pickLinkedTopics(digest: DailyDigest, trends: TopicDailyStat[]): string[] {
  const rankedTrendTopics = [...trends]
    .sort((a, b) => {
      if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
      if (a.count !== b.count) return b.count - a.count;
      return a.topicId.localeCompare(b.topicId);
    })
    .map((row) => row.topicLabel);

  const merged = dedupe([
    ...digest.topTopics.map((topic) => topic.topicLabel),
    ...digest.burstTopics.map((topic) => topic.topicLabel),
    ...rankedTrendTopics,
  ]);

  return merged.slice(0, 4).length > 0 ? merged.slice(0, 4) : ["일반"];
}

function pickIndicators(digest: DailyDigest): string[] {
  const indicators = dedupe(digest.watchlist).slice(0, 5);
  if (indicators.length > 0) {
    return indicators;
  }
  return ["정책금리", "USDKRW", "WTI"];
}

function firstBurstTopicLabel(digest: DailyDigest, trends: TopicDailyStat[]): string {
  const fromDigest = digest.burstTopics[0]?.topicLabel;
  if (fromDigest) return fromDigest;

  const fromTrend = [...trends]
    .sort((a, b) => {
      if (a.burstZ !== b.burstZ) return b.burstZ - a.burstZ;
      if (a.count !== b.count) return b.count - a.count;
      return a.topicId.localeCompare(b.topicId);
    })[0]?.topicLabel;

  return fromTrend ?? "핵심 토픽";
}

function buildImpactPath(topTopic: string): string[] {
  return [
    `${topTopic} 뉴스 흐름 변화 가능성`,
    "금리/환율/원자재 지표 반응 가능성",
    "주요 자산군 변동성 재평가 가능성",
  ];
}

function buildScenarioCard(args: {
  name: ScenarioName;
  topTopic: string;
  burstTopic: string;
  linkedTopics: string[];
  indicators: string[];
}): ScenarioCard {
  if (args.name === "Base") {
    const card = {
      name: "Base" as const,
      assumptions: [
        `${args.topTopic} 중심의 보도 비중이 단기적으로 유지될 가능성이 있습니다.`,
        `${args.burstTopic} 관련 급증 흐름이 완만하게 이어질 수 있습니다.`,
      ],
      triggers: [
        `${args.topTopic} 관련 기사 건수가 현재 범위에서 유지되는 경우`,
        "주요 거시지표가 기존 추세를 크게 벗어나지 않는 경우",
      ],
      invalidation: [
        "단일 이슈로 보도가 급격히 쏠리는 경우",
        "핵심 지표의 급반전으로 현재 관찰이 약화되는 경우",
      ],
      indicators: args.indicators,
      impactPath: buildImpactPath(args.topTopic),
      linkedTopics: args.linkedTopics,
    };

    assertConditionalStrings([
      ...card.assumptions,
      ...card.triggers,
      ...card.invalidation,
      ...card.impactPath,
    ]);
    return card;
  }

  if (args.name === "Bull") {
    const card = {
      name: "Bull" as const,
      assumptions: [
        `${args.burstTopic} 관련 보도 확산이 추가로 강화될 가능성이 있습니다.`,
        "상향 서프라이즈 지표가 겹치면 위험선호 회복이 나타날 수 있습니다.",
      ],
      triggers: [
        `${args.burstTopic} 버스트 등급이 상 수준으로 재확인되는 경우`,
        "복수 소스에서 유사한 긍정 신호가 동시 관찰되는 경우",
      ],
      invalidation: [
        "정책 불투명성 재확대로 심리 개선이 둔화되는 경우",
        "시장 변동성 지표가 재상승해 관찰 경로가 약해지는 경우",
      ],
      indicators: args.indicators,
      impactPath: [
        `${args.burstTopic} 기대 강화 가능성`,
        "금리 안정 또는 하락 기대 형성 가능성",
        "주식/위험자산 심리 회복 가능성",
      ],
      linkedTopics: args.linkedTopics,
    };

    assertConditionalStrings([
      ...card.assumptions,
      ...card.triggers,
      ...card.invalidation,
      ...card.impactPath,
    ]);
    return card;
  }

  const card = {
    name: "Bear" as const,
    assumptions: [
      `${args.topTopic} 이슈가 부정적 헤드라인으로 재해석될 가능성이 있습니다.`,
      "거시 변수 변동폭 확대로 보수적 해석이 확대될 수 있습니다.",
    ],
    triggers: [
      `${args.topTopic} 관련 부정 기사 비중이 연속 증가하는 경우`,
      "환율/유가/금리 중 두 개 이상이 동시 악화 신호를 보이는 경우",
    ],
    invalidation: [
      "핵심 리스크 지표가 빠르게 안정되며 긴장도가 낮아지는 경우",
      "정책 완화 신호가 확인되어 하방 서사가 약화되는 경우",
    ],
    indicators: args.indicators,
    impactPath: [
      `${args.topTopic} 우려 재확대 가능성`,
      "금리 및 환율의 상방 압력 재부각 가능성",
      "위험자산 변동성 확대 가능성",
    ],
    linkedTopics: args.linkedTopics,
  };

  assertConditionalStrings([
    ...card.assumptions,
    ...card.triggers,
    ...card.invalidation,
    ...card.impactPath,
  ]);
  return card;
}

export function buildScenarios(input: BuildScenariosInput): ScenarioPack {
  const generatedAt = input.generatedAt ?? input.digest.generatedAt;
  const topTopic = input.digest.topTopics[0]?.topicLabel ?? "핵심 토픽";
  const burstTopic = firstBurstTopicLabel(input.digest, input.trends);
  const linkedTopics = pickLinkedTopics(input.digest, input.trends);
  const indicators = pickIndicators(input.digest);

  const scenarioNames: ScenarioName[] = ["Base", "Bull", "Bear"];
  const cards: ScenarioCard[] = scenarioNames.map((name) => buildScenarioCard({
    name,
    topTopic,
    burstTopic,
    linkedTopics,
    indicators,
  }));

  return ScenarioPackSchema.parse({
    generatedAt,
    cards,
  });
}
