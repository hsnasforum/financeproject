import { type ProfileV2 } from "./types";

export type NormalizationPatchOp = {
  op: "replace";
  path: string;
  value: unknown;
};

export type NormalizationSuggestion = {
  code: string;
  message: string;
  patch: NormalizationPatchOp[];
  severity: "info" | "warn";
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asDebts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asObject(entry));
}

export function suggestProfileNormalizations(profile: ProfileV2): NormalizationSuggestion[] {
  const suggestions: NormalizationSuggestion[] = [];
  const totalExpenses = (profile.monthlyEssentialExpenses ?? 0) + (profile.monthlyDiscretionaryExpenses ?? 0);
  const highMonthlyFlow = profile.monthlyIncomeNet >= 500_000 || totalExpenses >= 500_000;

  if (highMonthlyFlow && isFiniteNumber(profile.liquidAssets) && profile.liquidAssets > 0 && profile.liquidAssets < 10_000) {
    const converted = Math.round(profile.liquidAssets * 10_000);
    suggestions.push({
      code: "UNIT_SUSPECTED_LIQUID_ASSETS",
      message: `유동자산이 만원 단위로 입력된 것으로 보입니다 (${formatMoney(profile.liquidAssets)} → ${formatMoney(converted)} 제안).`,
      patch: [{ op: "replace", path: "/liquidAssets", value: converted }],
      severity: "warn",
    });
  }

  if (highMonthlyFlow && isFiniteNumber(profile.investmentAssets) && profile.investmentAssets > 0 && profile.investmentAssets < 10_000) {
    const converted = Math.round(profile.investmentAssets * 10_000);
    suggestions.push({
      code: "UNIT_SUSPECTED_INVESTMENT_ASSETS",
      message: `투자자산이 만원 단위로 입력된 것으로 보입니다 (${formatMoney(profile.investmentAssets)} → ${formatMoney(converted)} 제안).`,
      patch: [{ op: "replace", path: "/investmentAssets", value: converted }],
      severity: "warn",
    });
  }

  const debts = asDebts(profile.debts);
  debts.forEach((debt, index) => {
    const debtId = typeof debt.id === "string" && debt.id.trim().length > 0 ? debt.id.trim() : `debt-${index + 1}`;
    const aprPct = isFiniteNumber(debt.aprPct)
      ? debt.aprPct
      : (isFiniteNumber(debt.ratePct) ? debt.ratePct : null);
    if (typeof aprPct === "number" && aprPct > 0 && aprPct < 1) {
      suggestions.push({
        code: `APR_SCALE_SUSPECTED_${debtId}`,
        message: `${debtId} 금리가 0~1 범위입니다. 퍼센트(예: 7.5)로 입력하려던 값인지 확인하세요.`,
        patch: [{ op: "replace", path: `/debts/${index}/aprPct`, value: Math.round(aprPct * 1000) / 10 }],
        severity: "info",
      });
    }
    if (isFiniteNumber(debt.remainingMonths) && debt.remainingMonths === 0) {
      suggestions.push({
        code: `REMAINING_MONTHS_ZERO_${debtId}`,
        message: `${debtId}의 remainingMonths=0은 유효하지 않습니다. 1개월로 보정 제안을 확인하세요.`,
        patch: [{ op: "replace", path: `/debts/${index}/remainingMonths`, value: 1 }],
        severity: "warn",
      });
    }
  });

  if (isFiniteNumber(profile.currentAge) && isFiniteNumber(profile.birthYear)) {
    const expectedAge = new Date().getUTCFullYear() - profile.birthYear;
    if (Math.abs(expectedAge - profile.currentAge) > 1) {
      suggestions.push({
        code: "AGE_BIRTHYEAR_MISMATCH",
        message: `currentAge(${profile.currentAge})와 birthYear(${profile.birthYear})가 불일치할 수 있습니다. currentAge=${expectedAge} 확인 제안.`,
        patch: [{ op: "replace", path: "/currentAge", value: expectedAge }],
        severity: "warn",
      });
    }
  }

  return suggestions;
}
