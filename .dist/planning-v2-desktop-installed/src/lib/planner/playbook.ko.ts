export type Playbook = {
  id: string;
  title: string;
  whoFor: string[];
  steps: string[];
  tips?: string[];
  pitfalls?: string[];
  relatedLinks?: Array<{ label: string; href: string }>;
};

export const playbooks: Record<string, Playbook> = {
  emg_account_split: {
    id: "emg_account_split",
    title: "비상금 전용 계좌 분리",
    whoFor: ["비상금 목표가 아직 3~6개월 미만인 경우", "생활비와 비상자금을 함께 쓰는 경우"],
    steps: [
      "생활비 계좌와 별도인 비상금 전용 계좌를 하나 정합니다.",
      "월급일 다음날 자동이체로 비상금 전용 계좌에 우선 적립되도록 설정합니다.",
      "비상금 목표금액(예: 3~6개월치 생활비)을 숫자로 고정해 기록합니다.",
      "비상금 인출 조건을 사전에 정의합니다(실직/질병/긴급 수리 등).",
      "월 1회 잔액과 목표 대비 진행률을 점검하고 부족분을 보완합니다.",
    ],
    tips: ["복잡한 우대조건보다 즉시출금 가능성과 안정성을 우선합니다."],
    pitfalls: ["투자형 상품으로 비상금을 대체하지 않습니다.", "자동이체 실패를 방치하지 않습니다."],
    relatedLinks: [
      { label: "예금 후보 보기", href: "/products/deposit" },
      { label: "적금 후보 보기", href: "/products/saving" },
    ],
  },
  debt_schedule_review: {
    id: "debt_schedule_review",
    title: "상환 스케줄 재점검",
    whoFor: ["월 상환액이 이자에 근접하거나 원금 감소가 느린 경우"],
    steps: [
      "현재 대출별 금리/잔액/만기/중도상환수수료를 한 표로 정리합니다.",
      "고금리/소액 대출부터 조기 상환 우선순위를 정합니다.",
      "월 상환 가능액을 재산정하고 자동이체 날짜를 소득일과 맞춥니다.",
      "상환액 증액 또는 기간 단축 중 총이자 절감이 큰 방안을 선택합니다.",
    ],
    tips: ["부채 통합·갈아타기 전에는 총비용(수수료 포함)을 비교합니다."],
    pitfalls: ["신규 대출로 기존 대출을 덮기 전에 상환 계획을 재검토해야 합니다."],
    relatedLinks: [{ label: "추천 페이지 보기", href: "/recommend" }],
  },
  find_saving_candidates: {
    id: "find_saving_candidates",
    title: "예금/적금 후보 탐색 방법",
    whoFor: ["비상금·단기 목표·목돈 계획을 시작하는 경우"],
    steps: [
      "목표 기간(6/12/24개월 등)을 먼저 정하고 해당 기간 옵션만 비교합니다.",
      "기본금리와 최고금리를 함께 보고 우대조건 난이도를 확인합니다.",
      "중도해지 조건과 실질 유지 가능성을 체크합니다.",
      "후보 3개를 남기고 자동이체 가능 여부를 확인합니다.",
    ],
    tips: ["처음에는 조건이 단순한 상품을 우선 검토하면 실행이 쉽습니다."],
    pitfalls: ["최고금리 숫자만 보고 우대조건을 놓치면 실제 체감수익이 낮을 수 있습니다."],
    relatedLinks: [
      { label: "예금 후보 보기", href: "/products/deposit" },
      { label: "적금 후보 보기", href: "/products/saving" },
    ],
  },
  cap_variable_spend: {
    id: "cap_variable_spend",
    title: "변동지출 상한 설정 후 추적",
    whoFor: ["월말에 예상보다 지출이 커지는 경우"],
    steps: [
      "식비/여가/쇼핑 3개 항목만 먼저 골라 상한을 설정합니다.",
      "결제 직후 기록하는 루틴을 2주만 유지합니다.",
      "주 1회 초과 항목을 확인하고 다음 주 상한을 재조정합니다.",
      "절감분은 즉시 저축 계좌로 이동합니다.",
    ],
    tips: ["완벽한 가계부보다 반복 가능한 최소 루틴이 중요합니다."],
    pitfalls: ["지출 상한을 과도하게 낮추면 1~2주 내 재폭증할 수 있습니다."],
  },
};
