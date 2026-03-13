export type DataSourceUserImpactState = "ready" | "partial" | "missing";

export type DataSourceUserImpactRoute = {
  href: string;
  label: string;
};

export type DataSourceUserImpactCard = {
  id: string;
  title: string;
  question: string;
  description: string;
  basis: string;
  freshness: string;
  routes: DataSourceUserImpactRoute[];
  primarySourceIds: string[];
  supportSourceIds?: string[];
  state: DataSourceUserImpactState;
};

type DataSourceUserImpactDef = Omit<DataSourceUserImpactCard, "state">;
type DataSourceStateDef = {
  primarySourceIds: string[];
  supportSourceIds?: string[];
};

export type DataSourceExpansionCandidate = {
  id: string;
  title: string;
  description: string;
  note: string;
  gate: string;
  sourceIds: string[];
  primarySourceIds: string[];
  supportSourceIds?: string[];
  state: DataSourceUserImpactState;
};

type DataSourceExpansionCandidateDef = Omit<DataSourceExpansionCandidate, "state">;

const DATA_SOURCE_USER_IMPACT_DEFS: DataSourceUserImpactDef[] = [
  {
    id: "products",
    title: "예금·적금·대출 비교",
    question: "지금 조건에서 어떤 금융상품 후보를 먼저 비교하면 좋은가요?",
    description: "금리와 기간, 우대조건, 갈아타기 후보를 묶어서 비교하는 데 도움을 줍니다.",
    basis: "공개된 상품 조건 기준의 비교용 정보입니다. 실제 가입 가능 여부와 최종 금리는 심사 결과에 따라 달라질 수 있습니다.",
    freshness: "금융사 공시 시점 기준입니다. 공시 반영 시점과 실제 가입 가능 시점이 다를 수 있습니다.",
    routes: [
      { href: "/products/deposit", label: "예금" },
      { href: "/products/saving", label: "적금" },
      { href: "/products/credit-loan", label: "신용대출" },
    ],
    primarySourceIds: ["FINLIFE"],
    supportSourceIds: ["DATAGO_KDB", "FSC_FIN_COMPANY_INFO"],
  },
  {
    id: "benefits",
    title: "정부지원·혜택 찾기",
    question: "내 상황에서 놓치기 쉬운 지원금이나 제도가 있나요?",
    description: "혜택 검색 결과를 더 실제 정책 데이터에 가깝게 보여주고, 주제별 탐색 품질을 높입니다.",
    basis: "정책 검색은 참고용이며, 신청 자격과 마감 여부는 실제 공고 원문에서 다시 확인해야 합니다.",
    freshness: "정책 공고 기준입니다. 검색 결과는 1~7일 범위 캐시가 걸릴 수 있어 신청 전 원문 재확인이 필요합니다.",
    routes: [
      { href: "/benefits", label: "혜택 탐색" },
    ],
    primarySourceIds: ["MOIS_BENEFITS"],
  },
  {
    id: "housing",
    title: "주거 의사결정",
    question: "매매·전월세 시세와 청약 일정을 같이 보며 판단할 수 있나요?",
    description: "주거비 판단, 시세 확인, 청약 일정 탐색을 같은 흐름으로 이어주는 데 쓰입니다.",
    basis: "실거래와 청약 일정은 공공 데이터 발표 시점 기준의 참고값입니다. 실제 계약 조건과 공급 공고는 별도로 확인해야 합니다.",
    freshness: "실거래는 월 단위 공개 기준이고, 청약은 공고 일정 기준입니다. 최신 계약과 공고 수정은 즉시 반영되지 않을 수 있습니다.",
    routes: [
      { href: "/housing/afford", label: "주거비 계산" },
      { href: "/housing/subscription", label: "청약 일정" },
    ],
    primarySourceIds: ["MOLIT_SALES", "MOLIT_RENT"],
    supportSourceIds: ["REB_SUBSCRIPTION"],
  },
  {
    id: "exchange",
    title: "환율 참고",
    question: "환율 변동을 기준으로 지금 환전·해외결제 비용을 가늠할 수 있나요?",
    description: "환율 기준 시점과 주요 통화 시세를 참고용으로 빠르게 보여주는 데 쓰입니다.",
    basis: "환율은 기준 시점의 참고값입니다. 실제 환전·결제 금액은 수수료와 체결 시점에 따라 달라질 수 있습니다.",
    freshness: "영업일 환율 기준입니다. 비영업일에는 최근 7일 내 영업일 값으로 보정될 수 있습니다.",
    routes: [
      { href: "/tools/fx", label: "환율 도구" },
    ],
    primarySourceIds: ["EXIM_EXCHANGE"],
  },
  {
    id: "dart",
    title: "기업 공시 모니터링",
    question: "관심 기업의 공시 변화를 한 화면에서 계속 확인할 수 있나요?",
    description: "회사 검색, 상세, 모니터 탭, 신규 공시 우선 확인 흐름을 유지하는 핵심 연동입니다.",
    basis: "공시 모니터링은 원문 확인을 돕는 기능이며, 투자 권유나 확정 판단을 대신하지 않습니다.",
    freshness: "공시 접수 시점 기준입니다. 기업 개황 정보는 공시 목록보다 덜 자주 바뀔 수 있습니다.",
    routes: [
      { href: "/public/dart", label: "DART 모니터" },
    ],
    primarySourceIds: ["OPENDART"],
  },
  {
    id: "planning",
    title: "재무설계 기준금리 참고",
    question: "플래닝 계산의 금리·거시 기준치를 더 현실에 가깝게 볼 수 있나요?",
    description: "재무설계 가정과 금리 해석에 참고할 공공 지표를 보강하는 데 도움을 줍니다.",
    basis: "재무설계 계산의 가정을 보강하는 참고 지표입니다. 미래 결과를 확정적으로 보장하지 않습니다.",
    freshness: "플래닝 스냅샷 asOf 기준입니다. 기준일이 오래됐으면 화면 경고와 동기화 상태를 같이 확인해야 합니다.",
    routes: [
      { href: "/planning", label: "재무설계" },
    ],
    primarySourceIds: ["BOK_ECOS"],
  },
];

const DATA_SOURCE_EXPANSION_CANDIDATE_DEFS: DataSourceExpansionCandidateDef[] = [
  {
    id: "retirement",
    title: "연금·노후 준비 점검",
    description: "국민연금, 퇴직연금, 원리금보장 금리를 같이 보면 노후 준비 비교를 더 쉽게 안내할 수 있습니다.",
    note: "현재는 설정 준비 단계입니다. 사용자 화면 직접 연결 전이므로 결과는 운영 검토 후 노출해야 합니다.",
    gate: "국민연금·퇴직연금·보장금리의 데이터 계약과 비교 문구를 먼저 고정해야 합니다.",
    sourceIds: ["NPS", "FSC_RETIRE_PENSION", "KDB_RETIRE_GUARANTEE_RATE", "FSC_FIN_COMPANY_INFO"],
    primarySourceIds: ["NPS", "FSC_RETIRE_PENSION", "KDB_RETIRE_GUARANTEE_RATE"],
    supportSourceIds: ["FSC_FIN_COMPANY_INFO"],
  },
  {
    id: "insurance",
    title: "보험·실손 점검",
    description: "보험 정보를 연결하면 보장 공백이나 중복 점검을 쉬운 문장으로 이어주는 후보가 됩니다.",
    note: "약관 판단이나 보장 확정은 대신하지 않습니다. 실제 상품 약관과 조건 검토가 필요합니다.",
    gate: "약관 판단을 대체하지 않도록 보장 범위와 면책 안내 문구를 먼저 정해야 합니다.",
    sourceIds: ["FSS_INSURANCE"],
    primarySourceIds: ["FSS_INSURANCE"],
  },
  {
    id: "macro",
    title: "국내외 거시지표 비교",
    description: "ECOS, KOSIS, FRED를 함께 쓰면 금리·물가·고용 같은 지표를 플래닝 가정과 같이 비교할 수 있습니다.",
    note: "지표는 참고용 시계열입니다. 해석은 기준 시점과 국가를 함께 보여주는 방식으로만 확장해야 합니다.",
    gate: "국가·주기·단위가 다른 시계열을 같이 보여줄 기준과 asOf 표기를 먼저 맞춰야 합니다.",
    sourceIds: ["BOK_ECOS", "KOSIS", "FRED"],
    primarySourceIds: ["BOK_ECOS", "KOSIS", "FRED"],
  },
];

function resolveImpactState(def: DataSourceStateDef, configuredSourceIds: Set<string>): DataSourceUserImpactState {
  const primaryHits = def.primarySourceIds.filter((id) => configuredSourceIds.has(id)).length;
  const primaryCount = def.primarySourceIds.length;
  const supportHits = (def.supportSourceIds ?? []).filter((id) => configuredSourceIds.has(id)).length;
  if (primaryHits === primaryCount && primaryCount > 0) {
    return "ready";
  }
  if (primaryHits > 0 || supportHits > 0) {
    return "partial";
  }
  return "missing";
}

export function buildDataSourceUserImpactCards(configuredSourceIds: Iterable<string>): DataSourceUserImpactCard[] {
  const configured = new Set(configuredSourceIds);
  return DATA_SOURCE_USER_IMPACT_DEFS.map((def) => ({
    ...def,
    state: resolveImpactState(def, configured),
  }));
}

export function buildDataSourceExpansionCandidates(configuredSourceIds: Iterable<string>): DataSourceExpansionCandidate[] {
  const configured = new Set(configuredSourceIds);
  return DATA_SOURCE_EXPANSION_CANDIDATE_DEFS.map((def) => ({
    ...def,
    state: resolveImpactState(def, configured),
  }));
}
