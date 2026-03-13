import { type ProfileV2 } from "../v2/types";

export const TAX_PENSION_PLACEHOLDER_NOTE = "정밀 세금/연금 계산은 아직 적용되지 않았습니다. 입력값은 보관만 합니다.";

export type TaxPensionProvider = {
  explain(profile: ProfileV2): { notes: string[]; applied: boolean };
};

export function createPlaceholderTaxPensionProvider(): TaxPensionProvider {
  return {
    explain(profile) {
      void profile;
      return {
        applied: false,
        notes: [TAX_PENSION_PLACEHOLDER_NOTE],
      };
    },
  };
}
