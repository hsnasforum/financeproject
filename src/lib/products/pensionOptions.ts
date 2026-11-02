import { FSS_PENSION_GUARANTEED_AREAS, FSS_PENSION_PRODUCT_AREAS } from "@/lib/publicApis/providers/fssPension.mjs";

// Options shared by the 연금저축 API and screen. Kept free of server dependencies so the client bundle stays small.

export const PENSION_PRODUCTS_PAGE_SIZE = 20;

export const PENSION_PRODUCT_SORTS = [
  { id: "feeAsc", label: "연평균 수수료율 낮은 순" },
  { id: "earn3Desc", label: "3년 연평균 수익률 높은 순" },
  { id: "earn5Desc", label: "5년 연평균 수익률 높은 순" },
  { id: "earn10Desc", label: "10년 연평균 수익률 높은 순" },
  { id: "nameAsc", label: "회사·상품명 순" },
] as const;

export const PENSION_GUARANTEED_SORTS = [
  { id: "nameAsc", label: "회사·상품명 순" },
  { id: "publishedRateDesc", label: "공시이율 높은 순" },
] as const;

export const PENSION_GUARANTEED_CHANNELS = [
  { id: "online", label: "온라인", field: "onlineFeeDesc" },
  { id: "agent", label: "대리점", field: "agentFeeDesc" },
  { id: "fp", label: "설계사", field: "fpFeeDesc" },
] as const;

// The portal groups 은행 products as 연금저축신탁 and 자산운용 products as 연금저축펀드.
const PRODUCT_AREA_KIND: Record<number, string> = { 1: "신탁", 3: "펀드" };

export const PENSION_PRODUCT_AREA_OPTIONS = FSS_PENSION_PRODUCT_AREAS.map((area) => ({
  value: String(area.code),
  label: PRODUCT_AREA_KIND[area.code] ? `${area.label}(${PRODUCT_AREA_KIND[area.code]})` : area.label,
}));

export const PENSION_GUARANTEED_AREA_OPTIONS = FSS_PENSION_GUARANTEED_AREAS.map((area) => ({
  value: String(area.code),
  label: area.label,
}));

export type PensionProductSort = (typeof PENSION_PRODUCT_SORTS)[number]["id"];
export type PensionGuaranteedSort = (typeof PENSION_GUARANTEED_SORTS)[number]["id"];
export type PensionGuaranteedChannel = (typeof PENSION_GUARANTEED_CHANNELS)[number]["id"];
