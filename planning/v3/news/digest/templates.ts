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
    { label: "산업생산", seriesId: "kr_ip", view: "trend", window: 12 },
  ],
  credit: [
    { label: "회사채 스프레드(AA-)", seriesId: "kr_cb_spread_aa", view: "zscore", window: 36 },
  ],
  commodities: [
    { label: "브렌트유", seriesId: "brent_oil", view: "pctChange", window: 3 },
    { label: "WTI", seriesId: "wti_oil", view: "pctChange", window: 3 },
  ],
  fiscal: [
    { label: "기준금리", seriesId: "kr_base_rate", view: "last", window: 1 },
    { label: "USDKRW", seriesId: "kr_usdkrw", view: "pctChange", window: 3 },
  ],
  general: [
    { label: "기준금리", seriesId: "kr_base_rate", view: "pctChange", window: 3 },
    { label: "USDKRW", seriesId: "kr_usdkrw", view: "pctChange", window: 3 },
  ],
};
