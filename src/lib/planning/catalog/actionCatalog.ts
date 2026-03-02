import { type ActionCode } from "../v2/actions/types";
import { REPORT_SECTION_IDS, RUN_SECTION_IDS, toHashHref } from "../navigation/sectionIds";

export type ActionCatalogId = ActionCode | "INPUT_REVIEW" | "OPEN_CANDIDATE_COMPARISON" | "MANAGE_ACTION_CENTER";

export type ActionCatalogEntry = {
  code: ActionCatalogId;
  title: string;
  description: string;
  steps: string[];
  href?: string;
};

const ACTION_CATALOG: Record<ActionCatalogId, ActionCatalogEntry> = {
  BUILD_EMERGENCY_FUND: {
    code: "BUILD_EMERGENCY_FUND",
    title: "비상금 먼저 보강",
    description: "단기 지출 충격에 버틸 수 있도록 현금 완충을 우선 확보합니다.",
    steps: [
      "고정비/선택지출 중 즉시 줄일 항목을 정합니다.",
      "비상금 목표월과 월 적립액을 현실 값으로 재설정합니다.",
      "재실행 후 비상금 커버개월이 개선됐는지 확인합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.evidence),
  },
  FIX_NEGATIVE_CASHFLOW: {
    code: "FIX_NEGATIVE_CASHFLOW",
    title: "월 잉여를 흑자로 전환",
    description: "지속 적자는 계획 중단으로 이어지므로 월 단위 흑자 전환이 우선입니다.",
    steps: [
      "수입/필수지출/선택지출을 최신 값으로 다시 입력합니다.",
      "자동이체 적립액과 추가상환액을 일시적으로 낮춥니다.",
      "다시 실행해 최저 현금이 0 이상인지 확인합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.evidence),
  },
  REDUCE_DEBT_SERVICE: {
    code: "REDUCE_DEBT_SERVICE",
    title: "부채 상환 부담 완화",
    description: "DSR이 높으면 목표 적립 여력이 급격히 줄어듭니다.",
    steps: [
      "상환기간/금리/추가상환 시나리오를 비교합니다.",
      "고금리/고상환액 대출부터 우선순위를 정합니다.",
      "재실행 후 DSR 개선폭을 확인합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.warnings),
  },
  COVER_LUMP_SUM_GOAL: {
    code: "COVER_LUMP_SUM_GOAL",
    title: "목돈 목표 일정 재설계",
    description: "미달 목표는 기한과 적립액을 함께 조정해야 달성 가능성이 올라갑니다.",
    steps: [
      "목표 우선순위를 다시 정해 한 번에 1~2개만 집중합니다.",
      "목표월을 현실적으로 조정하고 월 적립액을 재배치합니다.",
      "재실행 후 shortfall 변화를 확인합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.evidence),
  },
  IMPROVE_RETIREMENT_PLAN: {
    code: "IMPROVE_RETIREMENT_PLAN",
    title: "은퇴 구간 안전마진 점검",
    description: "은퇴 구간 고갈 확률이 높으면 인출률/지출 수준 조정이 필요합니다.",
    steps: [
      "은퇴 목표 시점과 필요자금을 다시 검증합니다.",
      "지출 상한 또는 적립액을 조정한 대안을 비교합니다.",
      "Monte Carlo 결과를 함께 확인해 고갈 확률을 낮춥니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.evidence),
  },
  SET_ASSUMPTIONS_REVIEW: {
    code: "SET_ASSUMPTIONS_REVIEW",
    title: "가정 스냅샷 최신화",
    description: "오래된 가정값은 결과 해석 정확도를 낮출 수 있습니다.",
    steps: [
      "/ops/assumptions에서 최신 스냅샷으로 동기화합니다.",
      "latest 또는 원하는 history 스냅샷을 다시 선택합니다.",
      "동일 프로필로 재실행해 차이를 비교합니다.",
    ],
    href: "/ops/assumptions",
  },
  INPUT_REVIEW: {
    code: "INPUT_REVIEW",
    title: "주요 입력값 재검증",
    description: "입력값 변경 폭을 작게 두고 재실행 비교를 진행하세요.",
    steps: [
      "수입/지출/대출 금리의 최신 값을 다시 확인합니다.",
      "한 번에 한 항목씩만 바꿔 재실행합니다.",
      "변경 전/후 경고와 목표 달성률을 비교합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.evidence),
  },
  OPEN_CANDIDATE_COMPARISON: {
    code: "OPEN_CANDIDATE_COMPARISON",
    title: "상품 후보 비교 확인",
    description: "추천이 아니라 후보 비교표에서 조건/가정 기준으로 직접 판단합니다.",
    steps: [
      "리포트의 '상품 후보 비교' 섹션으로 이동합니다.",
      "금액/세율/필터/정렬을 직접 바꿔 비교합니다.",
      "추정치 가정(단리/세율/기간)을 확인한 뒤 선택합니다.",
    ],
    href: toHashHref(REPORT_SECTION_IDS.candidates),
  },
  MANAGE_ACTION_CENTER: {
    code: "MANAGE_ACTION_CENTER",
    title: "실행 체크리스트 관리",
    description: "실행 기록의 액션 센터에서 진행 상태(todo/doing/done/snoozed)를 업데이트합니다.",
    steps: [
      "실행 기록 화면으로 이동합니다.",
      "Action Center에서 상태/메모를 갱신합니다.",
      "완료율 변화를 확인하고 필요한 항목을 재실행합니다.",
    ],
    href: `/planning/runs${toHashHref(RUN_SECTION_IDS.actionCenter)}`,
  },
};

export function listActionCatalogIds(): ActionCatalogId[] {
  return Object.keys(ACTION_CATALOG) as ActionCatalogId[];
}

export function hasActionCatalog(id: string): boolean {
  return Object.hasOwn(ACTION_CATALOG, id);
}

export function resolveActionCatalogById(id: string): ActionCatalogEntry | null {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return null;
  return ACTION_CATALOG[key as ActionCatalogId] ?? null;
}

export function resolveActionCatalog(code: ActionCode): ActionCatalogEntry {
  return ACTION_CATALOG[code];
}
