import type { HomeHeroSlide } from "@/components/home/HomeHero";

export const landingHeroSlides: HomeHeroSlide[] = [
  {
    id: "landing-diagnosis-preview",
    eyebrow: "샘플 리포트",
    title: "월 현금흐름",
    metric: "72만",
    metricCaption: "가정 기준 잉여금",
    summary: "수입, 지출, 부채를 넣으면 먼저 버틸 수 있는 흐름을 보여줍니다.",
    footer: "확정 진단이 아닌 참고 시나리오",
    badge: "예시",
    theme: "sky",
  },
  {
    id: "landing-action-preview",
    eyebrow: "실행 계획",
    title: "이번 달 액션",
    metric: "3개",
    metricCaption: "우선순위별로 정리",
    summary: "비상금, 부채, 저축 목표를 한 화면에서 비교합니다.",
    footer: "내 입력값 저장 후 개인화",
    badge: "흐름",
    theme: "emerald",
  },
  {
    id: "landing-benefit-preview",
    eyebrow: "연결 탐색",
    title: "상품과 혜택",
    metric: "비교",
    metricCaption: "조건에 맞는 후보 확인",
    summary: "리포트 결과를 기준으로 상품 후보와 공공혜택 탐색으로 이어집니다.",
    footer: "출처와 기준 시점 확인",
    badge: "연결",
    theme: "amber",
  },
];

export const landingReportPreview = {
  headline: "샘플 결과 미리보기",
  description: "첫 플랜을 저장하기 전에도 결과가 어떤 구조로 보이는지 확인할 수 있게, 예시 숫자로 구성한 미리보기입니다.",
  metrics: [
    { label: "월 잉여금", value: "72만원", note: "수입과 필수지출을 뺀 예시 값" },
    { label: "비상금 버팀력", value: "4.1개월", note: "현금성 자산 기준 예시 값" },
    { label: "경고 신호", value: "2건", note: "부채 부담과 현금흐름 경고 예시" },
  ],
  actionTitle: "먼저 할 일",
  actionSummary: "고정지출을 줄일 수 있는 항목을 확인한 뒤, 남는 돈을 비상금과 목표 저축으로 나누는 시나리오를 비교합니다.",
};

export const landingTrustNotes = [
  "결과는 사용자가 입력한 값과 현재 설정된 데이터 소스를 바탕으로 만든 참고 지표입니다.",
  "상품, 금리, 혜택 정보는 기준 시점과 출처를 함께 확인해야 하며 확정 추천으로 보지 않습니다.",
  "세금, 법률, 투자 판단은 개인 상황과 최신 규정에 따라 달라질 수 있습니다.",
];
