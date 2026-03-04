import {
  ScenarioPackSchema,
  type DailyDigest,
  type ScenarioCard,
  type ScenarioName,
  type ScenarioPack,
  type ScenarioTemplate,
  type TopicDailyStat,
} from "./contracts";
import { noRecommendationText } from "./digest";
import { SCENARIO_TEMPLATES } from "./scenarioTemplates";
import { evaluateTriggers } from "./triggerEvaluator";
import { type SeriesSnapshot } from "../indicators/contracts";

type BuildScenariosInput = {
  digest: DailyDigest;
  trends: TopicDailyStat[];
  generatedAt?: string;
  seriesSnapshots?: SeriesSnapshot[];
  templates?: ScenarioTemplate[];
};

type ScenarioContext = {
  topTopic: string;
  burstTopic: string;
  indicators: string[];
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

function pickIndicators(digest: DailyDigest): string[] {
  const indicators = dedupe(digest.watchlist.map((row) => row.label)).slice(0, 5);
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

function buildScenarioContent(name: ScenarioName, context: ScenarioContext): Pick<ScenarioCard, "observation" | "interpretations" | "indicators" | "options" | "invalidation"> {
  if (name === "Base") {
    return {
      observation: `관찰: ${context.topTopic} 중심 보도가 이어지며 ${context.burstTopic} 관련 민감도가 유지되는 흐름입니다.`,
      interpretations: [
        `가능한 해석: ${context.topTopic} 이슈가 단기 노이즈보다 중기 변수로 해석될 가능성이 있습니다.`,
        `가능한 해석: ${context.burstTopic} 기사량이 완만히 유지되면 변동성은 제한적 범위에서 순환할 수 있습니다.`,
      ],
      indicators: context.indicators,
      options: [
        "옵션(방어): 현금흐름 완충 구간과 변동성 노출 구간을 함께 점검하는 체크리스트를 유지합니다.",
        "옵션(균형): 핵심 지표 변화와 뉴스 확산 속도를 같은 주기로 비교 점검합니다.",
        "옵션(공격): 이벤트 발생 시나리오별 민감도만 사전 점검하고 실행은 보류 상태로 둡니다.",
      ],
      invalidation: [
        `${context.topTopic} 관련 기사 편중이 급격히 약화되면 현재 관찰의 설명력이 낮아집니다.`,
        "핵심 지표가 동시 역방향으로 전환되면 본 시나리오를 재평가합니다.",
      ],
    };
  }

  if (name === "Bull") {
    return {
      observation: `관찰: ${context.burstTopic} 신호가 개선 방향으로 축적될 경우 상방 해석이 강화될 수 있습니다.`,
      interpretations: [
        `가능한 해석: 지표 완화와 긍정 헤드라인 동시 관찰 시 위험선호 회복 구간이 열릴 수 있습니다.`,
        `가능한 해석: 단일 재료보다 복수 재료의 동조 여부가 상방 해석의 지속성을 좌우할 수 있습니다.`,
      ],
      indicators: context.indicators,
      options: [
        "옵션(방어): 반대 시그널이 동반되는지 먼저 점검하는 보수적 체크리스트를 유지합니다.",
        "옵션(균형): 상방/중립 시나리오 전환 조건을 동일 기준으로 비교 점검합니다.",
        "옵션(공격): 개선 신호가 연속 확인되는 구간만 별도 모니터링 목록으로 관리합니다.",
      ],
      invalidation: [
        "변동성 지표 재상승과 정책 불투명성 확대가 동반되면 상방 시나리오를 약화합니다.",
        "주요 지표의 개선 흐름이 단절되면 상방 해석을 중립으로 되돌립니다.",
      ],
    };
  }

  return {
    observation: `관찰: ${context.topTopic} 관련 리스크 재부각 시 하방 민감도가 커질 수 있는 구간입니다.`,
    interpretations: [
      `가능한 해석: 환율·원자재·금리 중 복수 축이 동시 악화되면 보수적 해석이 우세해질 수 있습니다.`,
      `가능한 해석: 뉴스 확산 속도가 지표 악화 속도와 결합되면 변동 구간이 확대될 수 있습니다.`,
    ],
    indicators: context.indicators,
    options: [
      "옵션(방어): 하방 이벤트 발생 시 확인할 우선 지표 순서를 체크리스트로 고정합니다.",
      "옵션(균형): 완화 신호 출현 시 중립 시나리오 복귀 조건을 함께 점검합니다.",
      "옵션(공격): 리스크 완화 전환 신호가 누적되는지 관찰 목록으로 분리 관리합니다.",
    ],
    invalidation: [
      "핵심 리스크 지표가 안정 구간으로 복귀하면 하방 시나리오 가정을 약화합니다.",
      "정책 완화 신호와 지표 안정이 동시 확인되면 본 시나리오를 재설정합니다.",
    ],
  };
}

export function buildScenarios(input: BuildScenariosInput): ScenarioPack {
  const generatedAt = input.generatedAt ?? input.digest.generatedAt;
  const seriesSnapshots = input.seriesSnapshots ?? [];
  const templateMap = new Map((input.templates ?? SCENARIO_TEMPLATES).map((row) => [row.name, row]));

  const context: ScenarioContext = {
    topTopic: input.digest.topTopics[0]?.topicLabel ?? "핵심 토픽",
    burstTopic: firstBurstTopicLabel(input.digest, input.trends),
    indicators: pickIndicators(input.digest),
  };

  const scenarioNames: ScenarioName[] = ["Base", "Bull", "Bear"];
  const cards: ScenarioCard[] = scenarioNames.map((name) => {
    const template = templateMap.get(name);
    const evaluation = template
      ? evaluateTriggers(seriesSnapshots, template)
      : {
        status: "unknown" as const,
        rationale: `${name} 트리거 템플릿이 없어 평가를 보류합니다.`,
        evaluations: [{
          ruleId: `${name.toLowerCase()}-missing-template`,
          label: "템플릿 누락",
          status: "unknown" as const,
          rationale: `${name} 템플릿 누락으로 평가 보류.`,
        }],
      };

    const content = buildScenarioContent(name, context);
    const card: ScenarioCard = {
      name,
      triggerStatus: evaluation.status,
      triggerRationale: evaluation.rationale,
      triggerEvaluations: evaluation.evaluations,
      ...content,
    };

    assertConditionalStrings([
      card.triggerRationale,
      ...card.triggerEvaluations.map((row) => row.rationale),
      card.observation,
      ...card.interpretations,
      ...card.options,
      ...card.invalidation,
      ...card.indicators,
    ]);

    return card;
  });

  return ScenarioPackSchema.parse({
    generatedAt,
    cards,
  });
}
