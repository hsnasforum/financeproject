import { unitMultiplier, type PlannerInput } from "./metrics";

export function computeInsuranceMetrics(input: Pick<PlannerInput, "unit" | "monthlyIncome" | "monthlyInsurancePremium">) {
  const mult = unitMultiplier(input.unit);
  const monthlyIncome = Math.max(0, input.monthlyIncome * mult);
  const monthlyPremium = Math.max(0, input.monthlyInsurancePremium * mult);
  const premiumRatioPct = monthlyIncome > 0 ? (monthlyPremium / monthlyIncome) * 100 : 0;

  const level = premiumRatioPct >= 12 ? "high" : premiumRatioPct >= 4 ? "ok" : "low";
  const explain =
    level === "high"
      ? "보험료 부담이 높습니다. 중복보장/갱신주기 점검이 필요합니다."
      : level === "ok"
        ? "보험료 부담이 참고 범위에 있습니다. 보장 공백 여부를 함께 점검하세요."
        : "보험료 부담은 낮지만 보장 공백이 없는지 확인이 필요합니다.";

  return {
    premiumRatioPct,
    monthlyPremiumWon: monthlyPremium,
    monthlyIncomeWon: monthlyIncome,
    level,
    explain,
  };
}
