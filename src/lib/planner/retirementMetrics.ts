import { unitMultiplier, type PlannerInput } from "./legacyPlanModel";

export function computeRetirementMetrics(
  input: Pick<
    PlannerInput,
    | "unit"
    | "monthlyIncome"
    | "monthlyFixedExpense"
    | "monthlyVariableExpense"
    | "retirementAssets"
    | "retirementMonthlyContribution"
    | "npsExpectedMonthly"
    | "retirementNeedRatioPct"
    | "retirementWithdrawalRatePct"
  >,
) {
  const mult = unitMultiplier(input.unit);
  const monthlyIncomeWon = Math.max(0, input.monthlyIncome * mult);
  const currentSpendingWon = Math.max(0, (input.monthlyFixedExpense + input.monthlyVariableExpense) * mult);
  const retirementNeedMonthlyWon = Math.max(
    0,
    Math.max(currentSpendingWon, monthlyIncomeWon * (Math.max(0, input.retirementNeedRatioPct) / 100)),
  );

  const withdrawalRate = Math.max(0.5, input.retirementWithdrawalRatePct) / 100;
  const assetNeededApproxWon = withdrawalRate > 0 ? (retirementNeedMonthlyWon * 12) / withdrawalRate : 0;
  const currentAssetsWon = Math.max(0, input.retirementAssets * mult);
  const monthlyContributionWon = Math.max(0, input.retirementMonthlyContribution * mult);
  const npsExpectedWon = Math.max(0, input.npsExpectedMonthly * mult);
  const coveredByPensionWon = npsExpectedWon * 12 / Math.max(withdrawalRate, 0.001);
  const projectedBaseWon = currentAssetsWon + coveredByPensionWon;
  const gapWon = Math.max(0, assetNeededApproxWon - projectedBaseWon);
  const yearsToCloseGapAtCurrentPace =
    gapWon <= 0 ? 0 : monthlyContributionWon > 0 ? Math.ceil(gapWon / (monthlyContributionWon * 12)) : null;

  const actions: string[] = [];
  if (gapWon > 0) actions.push("연금저축·IRP 월 납입액 상향 여부를 점검하세요.");
  if (monthlyContributionWon <= 0) actions.push("노후 준비를 위한 정기 납입(자동이체) 시작이 필요합니다.");
  if (npsExpectedWon <= 0) actions.push("예상 국민연금 수령액을 확인해 계획에 반영하세요.");
  if (!actions.length) actions.push("현재 가정 기준으로는 기본 노후 준비가 진행 중입니다. 분기마다 가정값을 재검토하세요.");

  return {
    retirementNeedMonthlyWon,
    assetNeededApproxWon,
    currentAssetsWon,
    monthlyContributionWon,
    npsExpectedWon,
    gapWon,
    yearsToCloseGapAtCurrentPace,
    assumptionsUsed: {
      needRatioPct: input.retirementNeedRatioPct,
      withdrawalRatePct: input.retirementWithdrawalRatePct,
    },
    actions,
  };
}
