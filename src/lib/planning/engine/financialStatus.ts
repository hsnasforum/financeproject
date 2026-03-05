import type { EngineInput, FinancialStatus, Stage } from "./types";

export function determineFinancialStatus(input: EngineInput): FinancialStatus {
  const monthlyIncome = input.monthlyIncome;
  const monthlyExpense = input.monthlyExpense;
  const liquidAssets = input.liquidAssets ?? 0;
  const debtBalance = input.debtBalance ?? 0;
  const emergencyFundMonths = input.emergencyFundMonths ?? 6;

  const savingCapacity = monthlyIncome - monthlyExpense;
  const savingRate = monthlyIncome > 0 ? savingCapacity / monthlyIncome : null;
  const emergencyFundTarget = monthlyExpense * emergencyFundMonths;
  const emergencyFundGap = Math.max(0, emergencyFundTarget - liquidAssets);

  const triggeredRules: string[] = [];
  let stage: Stage;

  if (savingCapacity < 0) {
    stage = "DEFICIT";
    triggeredRules.push("saving_capacity_negative");
  } else if (debtBalance > 0) {
    stage = "DEBT";
    triggeredRules.push("debt_balance_positive");
  } else if (emergencyFundGap > 0) {
    stage = "EMERGENCY";
    triggeredRules.push("emergency_fund_gap_positive");
  } else {
    stage = "INVEST";
    triggeredRules.push("investable_state");
  }

  return {
    stage,
    trace: {
      savingCapacity,
      savingRate,
      liquidAssets,
      debtBalance,
      emergencyFundTarget,
      emergencyFundGap,
      triggeredRules,
    },
  };
}
