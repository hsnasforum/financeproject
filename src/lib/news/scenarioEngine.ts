import { type SeriesSnapshot } from "../indicators/types";
import {
  evaluateScenarioTriggers,
  type ScenarioTriggerRule,
} from "./triggerEngine";
import {
  type MacroSnapshot,
  type NewsCluster,
  type NewsScenario,
  type NewsScenarioPack,
  type RisingTopic,
  type ScenarioCard,
} from "./types";

const FORBIDDEN_DIRECTIVE_PATTERN = /(매수|매도|정답|해야|무조건|확실)/g;

type TriggerTemplateSource = Partial<Record<"Base" | "Bull" | "Bear", Array<{ label?: string; expression?: string }>>>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeDirectiveText(input: string): string {
  return asString(input).replace(FORBIDDEN_DIRECTIVE_PATTERN, "검토");
}

function sanitizeLines(lines: string[]): string[] {
  return lines.map((row) => sanitizeDirectiveText(row)).filter(Boolean);
}

function topTopicLabel(risingTopics: RisingTopic[], clusters: NewsCluster[]): string {
  const rising = risingTopics[0]?.topicLabel;
  if (rising) return rising;
  const fromCluster = clusters[0]?.topicLabel;
  if (fromCluster) return fromCluster;
  return "핵심 토픽";
}

function macroLine(snapshot: MacroSnapshot): string {
  const values: string[] = [];
  if (typeof snapshot.values.policyRatePct === "number") values.push(`정책금리 ${snapshot.values.policyRatePct}%`);
  if (typeof snapshot.values.fxUsdKrw === "number") values.push(`원/달러 ${snapshot.values.fxUsdKrw}`);
  if (typeof snapshot.values.oilBrentUsd === "number") values.push(`브렌트 ${snapshot.values.oilBrentUsd}달러`);
  if (typeof snapshot.values.cpiYoYPct === "number") values.push(`CPI ${snapshot.values.cpiYoYPct}%`);
  if (values.length < 1) return "핵심 거시 지표 데이터 부족";
  return values.join(", ");
}

function takeLeadingIndicators(topic: string): string[] {
  return sanitizeLines([
    `${topic} 기사량(일별)`,
    "정책금리 발표 일정",
    "원/달러 환율",
    "브렌트유",
  ]);
}

function takeMonitoringOptions(topic: string): string[] {
  return sanitizeLines([
    `${topic} 토픽 기사량이 3일 연속 증가하면 모니터링 빈도 상향`,
    "환율/유가 급변 시 익일 재평가",
    "정책 이벤트 전후 시나리오 재생성",
  ]);
}

function defaultRules(name: "Base" | "Bull" | "Bear"): ScenarioTriggerRule[] {
  if (name === "Base") {
    return [
      { label: "환율 5일 변화", expression: "pctChange(kr_usdkrw,5) > 0" },
      { label: "기준금리 최근값", expression: "zscore(kr_base_rate,12) <= Mid" },
    ];
  }
  if (name === "Bull") {
    return [
      { label: "통화량 확장", expression: "zscore(kr_m2,12) >= Mid" },
      { label: "환율 안정", expression: "zscore(kr_usdkrw,20) < Mid" },
    ];
  }
  return [
    { label: "환율 긴장", expression: "zscore(kr_usdkrw,20) >= High" },
    { label: "물가 상승", expression: "pctChange(us_cpi,3) > 0" },
  ];
}

function normalizeRules(input: Array<{ label?: string; expression?: string }> | undefined): ScenarioTriggerRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row, index) => ({
      label: asString(row?.label) || `trigger-${index + 1}`,
      expression: asString(row?.expression),
    }))
    .filter((row) => row.expression);
}

function resolveRulesForScenario(input: {
  name: "Base" | "Bull" | "Bear";
  templates?: TriggerTemplateSource;
}): ScenarioTriggerRule[] {
  const fromTemplate = normalizeRules(input.templates?.[input.name]);
  if (fromTemplate.length > 0) return fromTemplate;
  return defaultRules(input.name);
}

function buildScenario(input: {
  name: "Base" | "Bull" | "Bear";
  confidence: "상" | "중" | "하";
  topic: string;
  macroSnapshot: MacroSnapshot;
  assumptions: string[];
  invalidation: string[];
  rationale: string[];
  templates?: TriggerTemplateSource;
  indicatorSnapshots: SeriesSnapshot[];
}): NewsScenario {
  const rules = resolveRulesForScenario({
    name: input.name,
    templates: input.templates,
  });
  const triggerEval = evaluateScenarioTriggers({
    rules,
    snapshots: input.indicatorSnapshots,
  });

  return {
    name: input.name,
    confidence: input.confidence,
    triggerStatus: triggerEval.status,
    triggerSummary: sanitizeDirectiveText(triggerEval.summary || "trigger 데이터 부족"),
    assumptions: sanitizeLines([
      ...input.assumptions,
      macroLine(input.macroSnapshot),
    ]),
    trigger: sanitizeLines(triggerEval.details.map((row) => row.summary)),
    triggerDetails: triggerEval.details,
    leadingIndicators: takeLeadingIndicators(input.topic),
    invalidation: sanitizeLines(input.invalidation),
    impact: sanitizeDirectiveText(
      input.name === "Base"
        ? "변동성은 유지되나 방향성 확정 신호는 제한적일 가능성이 높습니다."
        : input.name === "Bull"
          ? "위험선호 회복 시그널이 강화될 수 있으나 지속성 확인이 필요합니다."
          : "단기 변동성 확대 가능성이 있으며 방어적 모니터링이 필요합니다.",
    ),
    monitoringOptions: takeMonitoringOptions(input.topic),
    rationale: sanitizeLines(input.rationale),
  };
}

export function buildNewsScenarios(input: {
  generatedAt: string;
  risingTopics: RisingTopic[];
  topClusters: NewsCluster[];
  macroSnapshot: MacroSnapshot;
  indicatorSnapshots?: SeriesSnapshot[];
  triggerTemplates?: TriggerTemplateSource;
}): NewsScenarioPack {
  const topic = topTopicLabel(input.risingTopics, input.topClusters);
  const snapshots = input.indicatorSnapshots ?? [];

  const scenarios: NewsScenario[] = [
    buildScenario({
      name: "Base",
      confidence: "중",
      topic,
      macroSnapshot: input.macroSnapshot,
      assumptions: [
        `${topic} 관련 뉴스 흐름이 현재 수준에서 점진적으로 유지`,
      ],
      invalidation: [
        `${topic} 기사량 급감/급증(2배 이상)`,
        "금리/환율/유가 동시 급변",
      ],
      rationale: [
        "최근 기사량/클러스터 분포가 단일 극단으로 치우치지 않았습니다.",
        "거시 지표가 혼조일 때는 관찰 중심 대응이 유효합니다.",
      ],
      templates: input.triggerTemplates,
      indicatorSnapshots: snapshots,
    }),
    buildScenario({
      name: "Bull",
      confidence: "하",
      topic,
      macroSnapshot: input.macroSnapshot,
      assumptions: [
        `${topic} 관련 긍정 헤드라인 비중이 확대`,
      ],
      invalidation: [
        "부정 이벤트 클러스터가 상위 점수를 차지",
        "환율/유가가 위험회피 방향으로 급변",
      ],
      rationale: [
        "상위 클러스터의 긍정 키워드 비중이 높아질 경우 확률 상향 검토가 가능합니다.",
        "단, 거시 지표 역행 시나리오가 존재해 신뢰도는 낮게 둡니다.",
      ],
      templates: input.triggerTemplates,
      indicatorSnapshots: snapshots,
    }),
    buildScenario({
      name: "Bear",
      confidence: "하",
      topic,
      macroSnapshot: input.macroSnapshot,
      assumptions: [
        `${topic} 관련 부정 헤드라인이 우세`,
      ],
      invalidation: [
        "증가 토픽이 빠르게 둔화",
        "정책 완화 신호로 리스크 프리미엄 축소",
      ],
      rationale: [
        "부정 클러스터가 상위권을 차지하면 하방 시나리오 관찰 우선순위를 높입니다.",
        "수치 확률 대신 근거 기반 등급(상/중/하)만 제공합니다.",
      ],
      templates: input.triggerTemplates,
      indicatorSnapshots: snapshots,
    }),
  ];

  return {
    generatedAt: asString(input.generatedAt) || new Date().toISOString(),
    input: {
      topTopicIds: [...new Set(input.topClusters.map((cluster) => cluster.topicId))].slice(0, 5),
      risingTopicIds: [...new Set(input.risingTopics.map((topicRow) => topicRow.topicId))].slice(0, 5),
      macroSnapshot: input.macroSnapshot,
    },
    scenarios,
  };
}

export function toScenarioCards(pack: NewsScenarioPack): ScenarioCard[] {
  return pack.scenarios.map((row) => ({
    name: row.name,
    confidence: row.confidence,
    triggerStatus: row.triggerStatus,
    triggerSummary: row.triggerSummary,
    assumptions: row.assumptions,
    trigger: row.trigger,
    invalidation: row.invalidation,
    indicators: row.leadingIndicators,
    impactPath: row.impact,
    monitoringOptions: row.monitoringOptions,
  }));
}

export function toNewsScenarioMarkdown(pack: NewsScenarioPack): string {
  const lines: string[] = [];
  lines.push("# News Scenario Pack");
  lines.push("");
  lines.push(`- Generated at: ${pack.generatedAt}`);
  lines.push(`- Macro asOf: ${pack.input.macroSnapshot.asOf} (${pack.input.macroSnapshot.source})`);
  lines.push("");

  for (const scenario of pack.scenarios) {
    lines.push(`## ${scenario.name} (확률: ${scenario.confidence})`);
    lines.push(`- Trigger status: ${scenario.triggerStatus}`);
    lines.push(`- Trigger summary: ${scenario.triggerSummary}`);
    lines.push("### Assumptions");
    for (const row of scenario.assumptions) lines.push(`- ${row}`);
    lines.push("### Trigger");
    for (const row of scenario.trigger) lines.push(`- ${row}`);
    lines.push("### Leading indicators");
    for (const row of scenario.leadingIndicators) lines.push(`- ${row}`);
    lines.push("### Invalidation");
    for (const row of scenario.invalidation) lines.push(`- ${row}`);
    lines.push("### Impact path");
    lines.push(`- ${scenario.impact}`);
    lines.push("### Monitoring options");
    for (const row of scenario.monitoringOptions) lines.push(`- ${row}`);
    lines.push("### 근거");
    for (const row of scenario.rationale) lines.push(`- ${row}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
