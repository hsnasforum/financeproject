export type WarningGlossaryEntry = {
  title: string;
  meaning: string;
  impact: string;
  suggestion: string;
};

const DEFAULT_ENTRY: WarningGlossaryEntry = {
  title: "주의 신호",
  meaning: "결과 해석에 영향을 줄 수 있는 신호가 감지되었습니다.",
  impact: "현금흐름·목표 달성·부채 부담 중 일부가 예상보다 불안정해질 수 있습니다.",
  suggestion: "요약 지표를 먼저 확인한 뒤 지출·상환·적립 비율을 한 단계씩 조정해 보세요.",
};

export const WARNING_GLOSSARY_KO: Record<string, WarningGlossaryEntry> = {
  NEGATIVE_CASHFLOW: {
    title: "월 현금흐름 적자",
    meaning: "일부 구간에서 수입보다 지출·상환이 더 크게 나타났습니다.",
    impact: "현금 여유가 빠르게 줄어 계획이 쉽게 흔들릴 수 있습니다.",
    suggestion: "필수·선택지출을 먼저 점검하고 자동이체 적립액을 현실적인 수준으로 조정해 보세요.",
  },
  HIGH_DEBT_SERVICE: {
    title: "부채 상환 부담 높음",
    meaning: "월 소득 대비 대출 상환 비중이 높은 상태입니다.",
    impact: "지출이 변동되면 목표 적립 여력이 빠르게 줄어들 수 있습니다.",
    suggestion: "대출 기간·금리·상환방식을 비교해 월 상환액을 낮출 수 있는지 확인해 보세요.",
  },
  HIGH_DEBT_RATIO: {
    title: "부채 비중 높음",
    meaning: "자산 대비 부채 비중이 높아 재무 완충력이 낮은 상태입니다.",
    impact: "금리 변동이나 소득 감소가 생기면 부담이 더 크게 느껴질 수 있습니다.",
    suggestion: "고금리 부채부터 우선순위를 두고 상환 계획을 재조정해 보세요.",
  },
  EMERGENCY_FUND_SHORT: {
    title: "비상금 부족",
    meaning: "권장 비상자금 수준보다 적은 상태입니다.",
    impact: "돌발 지출이 발생하면 다른 목표 적립이 중단될 수 있습니다.",
    suggestion: "비상금 확보를 우선순위로 두고 월 적립 배분을 다시 정해 보세요.",
  },
  GOAL_MISSED: {
    title: "목표 기한 미달",
    meaning: "설정한 목표월까지 목표 금액 달성이 어려운 상태입니다.",
    impact: "핵심 목표의 달성 시점이 늦어질 수 있습니다.",
    suggestion: "목표월을 조정하거나 목표별 월 적립액을 현실적인 수준으로 다시 설정해 보세요.",
  },
  RETIREMENT_SHORT: {
    title: "은퇴 자금 부족",
    meaning: "은퇴 시점 또는 은퇴 이후 자금 여력이 충분하지 않을 수 있습니다.",
    impact: "은퇴 후 자금 인출이 예상보다 빨리 어려워질 가능성이 있습니다.",
    suggestion: "은퇴 시점·인출률·적립 비율을 보수적으로 조정한 시나리오를 함께 확인해 보세요.",
  },
  CONTRIBUTION_SKIPPED: {
    title: "자동 적립 누락",
    meaning: "현금 부족으로 일부 월 적립이 자동으로 건너뛰어진 기록이 있습니다.",
    impact: "목표 달성 시점이 늦어지거나 누적 적립금이 줄어들 수 있습니다.",
    suggestion: "월 적립액을 낮추거나 목표 우선순위를 재정렬해 누락 구간을 줄여 보세요.",
  },
  SNAPSHOT_MISSING: {
    title: "스냅샷 없음",
    meaning: "최신 가정 스냅샷이 없어 기본 가정으로 계산되었습니다.",
    impact: "금리·물가 등 외부 조건이 현재 상황과 달라 결과 해석 편차가 커질 수 있습니다.",
    suggestion: "`/ops/assumptions`에서 스냅샷을 동기화한 뒤 같은 입력으로 다시 확인해 보세요.",
  },
  SNAPSHOT_STALE: {
    title: "스냅샷 오래됨",
    meaning: "사용한 가정 스냅샷의 갱신 시점이 오래되었습니다.",
    impact: "최근 시장 변화가 충분히 반영되지 않아 결과 편차가 생길 수 있습니다.",
    suggestion: "스냅샷 동기화 후 동일 입력으로 다시 실행해 차이를 비교해 보세요.",
  },
  SNAPSHOT_VERY_STALE: {
    title: "스냅샷 매우 오래됨",
    meaning: "가정 데이터가 장기간 갱신되지 않았습니다.",
    impact: "결과 해석이 현재 환경과 크게 어긋날 수 있습니다.",
    suggestion: "우선 스냅샷을 갱신한 뒤 결과를 다시 확인해 주세요.",
  },
  OPTIMISTIC_RETURN_HIGH: {
    title: "수익률 가정 과도",
    meaning: "입력한 기대수익률이 다소 낙관적으로 설정되었을 수 있습니다.",
    impact: "실제 수익률이 낮으면 목표 달성률이 예상보다 낮아질 수 있습니다.",
    suggestion: "기대수익률을 낮춘 보수 시나리오와 함께 비교해 결과 민감도를 확인해 보세요.",
  },
};

export function lookupWarningGlossaryKo(code: string): WarningGlossaryEntry {
  const key = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!key) return DEFAULT_ENTRY;
  return WARNING_GLOSSARY_KO[key] ?? {
    ...DEFAULT_ENTRY,
    title: key,
  };
}
