import { type DigestWatchSpec } from "../contracts";

export const WATCHLIST_BY_TOPIC: Record<string, DigestWatchSpec[]> = {
  rates: [
    { label: "기준금리", seriesId: "kr_base_rate", view: "last", window: 1 },
    { label: "국채금리(3Y)", seriesId: "kr_gov_bond_3y", view: "pctChange", window: 3 },
  ],
  inflation: [
    { label: "소비자물가(CPI)", seriesId: "kr_cpi", view: "pctChange", window: 12 },
    { label: "근원물가", seriesId: "kr_core_cpi", view: "pctChange", window: 12 },
  ],
  fx: [
    { label: "USDKRW", seriesId: "kr_usdkrw", view: "pctChange", window: 3 },
    { label: "경상수지", seriesId: "kr_cab", view: "trend", window: 12 },
  ],
  growth: [
    { label: "산업생산", seriesId: "kr_ip", view: "pctChange", window: 12 },
    { label: "수출", seriesId: "kr_exports", view: "pctChange", window: 12 },
  ],
  labor: [
    { label: "고용률", seriesId: "kr_employment_rate", view: "trend", window: 12 },
  ],
  credit: [
    { label: "회사채 스프레드(AA-)", seriesId: "kr_cb_spread_aa", view: "zscore", window: 36 },
  ],
  commodities: [
    { label: "브렌트유", seriesId: "brent_oil", view: "pctChange", window: 3 },
    { label: "WTI", seriesId: "wti_oil", view: "pctChange", window: 3 },
  ],
  fiscal: [
    { label: "국채 발행잔액", seriesId: "kr_treasury_outstanding", view: "pctChange", window: 12 },
    { label: "재정수지", seriesId: "kr_fiscal_balance", view: "trend", window: 12 },
  ],
  general: [
    { label: "기준금리", seriesId: "kr_base_rate", view: "pctChange", window: 3 },
    { label: "USDKRW", seriesId: "kr_usdkrw", view: "pctChange", window: 3 },
  ],
};

export const WATCHLIST_LABELS_BY_TOPIC: Record<string, string[]> = Object.fromEntries(
  Object.entries(WATCHLIST_BY_TOPIC).map(([topicId, specs]) => [topicId, specs.map((spec) => spec.label)]),
);

export const COUNTER_SIGNALS_BY_TOPIC: Record<string, string[]> = {
  rates: [
    "시장금리 변동성이 완화되면 금리 민감도 관찰은 약화될 수 있습니다.",
    "정책 커뮤니케이션이 완화 기조로 전환되면 기존 해석은 조정될 수 있습니다.",
  ],
  inflation: [
    "원자재 가격 상승세가 둔화되면 물가 압력 해석은 약화될 수 있습니다.",
    "기저효과로 전년 대비 지표가 완화되면 해석 강도는 낮아질 수 있습니다.",
  ],
  fx: [
    "달러 강세가 진정되면 환율 압력 해석은 완화될 수 있습니다.",
    "대외 수급이 안정되면 단기 변동성 관찰은 약화될 수 있습니다.",
  ],
  growth: [
    "선행지표 개선이 이어지면 둔화 해석은 약해질 수 있습니다.",
    "수출/생산 반등이 확인되면 현재 관찰은 재평가될 수 있습니다.",
  ],
  labor: [
    "고용 선행지표가 회복되면 고용 리스크 해석은 약화될 수 있습니다.",
  ],
  credit: [
    "신용 스프레드 축소가 이어지면 금융불안 해석은 완화될 수 있습니다.",
    "단기 유동성 지표 안정 시 리스크 관찰 강도는 낮아질 수 있습니다.",
  ],
  commodities: [
    "원유/가스 가격이 안정되면 비용 압력 해석은 약화될 수 있습니다.",
    "공급망 병목 완화가 확인되면 기존 관찰은 재점검될 수 있습니다.",
  ],
  fiscal: [
    "재정 집행 강도가 완화되면 수요 압력 해석은 낮아질 수 있습니다.",
  ],
  general: [
    "복수 지표가 동시 안정 구간으로 전환되면 현재 관찰 강도는 약화될 수 있습니다.",
    "토픽 집중도가 분산되면 단일 시나리오의 설명력은 낮아질 수 있습니다.",
  ],
};
