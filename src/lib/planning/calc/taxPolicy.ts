export type InterestTaxPolicy = {
  id: "interest_income_tax_ko_v1";
  label: string;
  taxRatePct: number;
  includesLocalIncomeTax: boolean;
  note: string;
};

export const DEFAULT_INTEREST_TAX_POLICY: InterestTaxPolicy = {
  id: "interest_income_tax_ko_v1",
  label: "이자소득세(지방소득세 포함) 기본 가정",
  taxRatePct: 15.4,
  includesLocalIncomeTax: true,
  note: "비과세/우대과세/세법 변경은 반영하지 않은 기본 가정입니다.",
};

// Policy assumption default (not legal/tax advice).
export const defaultTaxRatePct = DEFAULT_INTEREST_TAX_POLICY.taxRatePct;

export function clampTaxRatePct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTEREST_TAX_POLICY.taxRatePct;
  return Math.max(0, Math.min(100, parsed));
}
