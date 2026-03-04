import { TopicScenarioTemplateSchema, type TopicScenarioTemplate } from "./contracts";

const RAW_TOPIC_SCENARIO_TEMPLATES: TopicScenarioTemplate[] = [
  {
    topicId: "rates",
    topicLabel: "금리",
    observation: {
      base: "관찰: 금리 관련 보도 강도가 현재 수준으로 이어질 경우 민감도 유지 가능성이 있습니다.",
      bull: "관찰: 금리 관련 보도 강도가 완화될 경우 긴장 완화 흐름으로 해석될 수 있습니다.",
      bear: "관찰: 금리 관련 보도 강도가 강화될 경우 변동성 확대 구간으로 이어질 수 있습니다.",
    },
    invalidation: {
      base: ["금리 토픽 기사 집중이 빠르게 분산되면 현재 관찰의 설명력은 약화될 수 있습니다."],
      bull: ["금리 토픽 급증이 재확대되면 완화 가정은 약화될 수 있습니다."],
      bear: ["금리 토픽 강도가 완화되면 강화 가정은 재평가될 수 있습니다."],
    },
    options: {
      base: ["옵션: 금리 토픽의 기사 강도와 다양성 변화를 같은 주기로 점검합니다."],
      bull: ["옵션: 완화 신호가 이어지는지 조건부로 점검 목록을 유지합니다."],
      bear: ["옵션: 강화 신호가 누적되는지 관찰 빈도를 높여 병행 점검합니다."],
    },
  },
  {
    topicId: "inflation",
    topicLabel: "물가",
    observation: {
      base: "관찰: 물가 관련 이슈가 유지되는 구간에서는 비용 압력 해석이 이어질 수 있습니다.",
      bull: "관찰: 물가 관련 강도가 둔화되는 구간에서는 압력 완화 가능성을 조건부로 볼 수 있습니다.",
      bear: "관찰: 물가 관련 강도가 재확대되는 구간에서는 상방 압력 재부각 가능성이 있습니다.",
    },
    invalidation: {
      base: ["물가 토픽 대비 반대 시그널이 늘어나면 현재 관찰은 약화될 수 있습니다."],
      bull: ["물가 토픽 급증이 다시 강화되면 둔화 가정은 약화될 수 있습니다."],
      bear: ["물가 토픽 집중이 완화되면 강화 가정은 재점검될 수 있습니다."],
    },
    options: {
      base: ["옵션: 물가·원자재 토픽의 동조 여부를 확인하는 체크리스트를 유지합니다."],
      bull: ["옵션: 완화 신호의 지속성과 반대 시그널 동반 여부를 함께 점검합니다."],
      bear: ["옵션: 강화 신호 누적 시 관찰 지표 범위를 넓혀 병행 확인합니다."],
    },
  },
  {
    topicId: "fx",
    topicLabel: "환율",
    observation: {
      base: "관찰: 환율 관련 신호가 유지될 경우 대외 변수 민감도는 이어질 수 있습니다.",
      bull: "관찰: 환율 관련 신호가 완화될 경우 단기 압력은 제한될 수 있습니다.",
      bear: "관찰: 환율 관련 신호가 강화될 경우 변동 구간 확대 가능성이 있습니다.",
    },
    invalidation: {
      base: ["환율 토픽 집중이 낮아지면 현재 관찰의 강도는 약화될 수 있습니다."],
      bull: ["환율 토픽이 다시 급증하면 완화 가정은 보수적으로 조정될 수 있습니다."],
      bear: ["환율 토픽 강도가 둔화되면 강화 시나리오는 재검토될 수 있습니다."],
    },
    options: {
      base: ["옵션: 환율 토픽 기사량과 소스 분포를 함께 점검합니다."],
      bull: ["옵션: 완화 신호가 유지되는지 확인 주기를 유지합니다."],
      bear: ["옵션: 강화 신호가 반복되는지 관찰 축을 확장해 점검합니다."],
    },
  },
  {
    topicId: "general",
    topicLabel: "핵심",
    observation: {
      base: "관찰: 핵심 토픽 신호가 현재 수준에서 유지되는 흐름으로 관찰됩니다.",
      bull: "관찰: 핵심 토픽 신호가 완화되는 흐름으로 전환될 가능성이 있습니다.",
      bear: "관찰: 핵심 토픽 신호가 강화되는 흐름으로 확장될 가능성이 있습니다.",
    },
    invalidation: {
      base: ["토픽 분산이 빠르게 진행되면 현재 가정은 약화될 수 있습니다."],
      bull: ["신호 재확대가 동반되면 완화 가정은 재평가될 수 있습니다."],
      bear: ["신호 완화가 확인되면 강화 가정은 약화될 수 있습니다."],
    },
    options: {
      base: ["옵션: 핵심 토픽의 지속성과 분산 정도를 함께 점검합니다."],
      bull: ["옵션: 완화 흐름의 연속성 여부를 조건부로 확인합니다."],
      bear: ["옵션: 강화 흐름의 누적 여부를 병행 점검합니다."],
    },
  },
];

export const TOPIC_SCENARIO_TEMPLATES: TopicScenarioTemplate[] = RAW_TOPIC_SCENARIO_TEMPLATES
  .map((row) => TopicScenarioTemplateSchema.parse(row));

export const TOPIC_SCENARIO_TEMPLATE_MAP = new Map(
  TOPIC_SCENARIO_TEMPLATES.map((row) => [row.topicId, row] as const),
);
