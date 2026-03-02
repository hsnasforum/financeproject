export type PlannerInput = {
  monthlyIncome: number;
  monthlyFixedExpense: number;
  monthlyVariableExpense: number;
  cashAssets: number;
  debtBalance: number;
  debtRateAnnual: number;
  monthlyDebtPayment: number;
  goalAmount: number;
  goalDeadlineMonths: number;
  assumedAnnualReturn: number;
  emergencyTargetMonths: number;
  assumedInflationRate: number;
  extraMonthlySaving: number;
  extraMonthlyDebtPayment: number;
};

export type PlannerResult = {
  cashflow: {
    totalMonthlyExpense: number;
    freeCashflow: number;
    monthlySaving: number;
    savingRate: number;
  };
  emergency: {
    currentMonths: number;
    targetMonths: number;
    targetAmount: number;
    gap: number;
    monthsToTarget: number | null;
  };
  debt: {
    debtBurdenRatio: number;
    canAmortize: boolean;
    payoffMonths: number | null;
    totalInterestApprox: number | null;
    warning: string | null;
  };
  goal: {
    goalNominal: number;
    requiredMonthly: number;
    feasible: boolean;
    shortfallMonthly: number;
    forecastMonths: number | null;
  };
  netAssets: number;
  warnings: string[];
  priority: string[];
  assumptions: {
    assumedAnnualReturn: number;
    assumedInflationRate: number;
  };
};

function toMonthlyRate(annualRatePercent: number): number {
  return annualRatePercent / 100 / 12;
}

function simulateDebtPayoff(balance: number, monthlyRate: number, monthlyPayment: number): {
  canAmortize: boolean;
  payoffMonths: number | null;
  totalInterestApprox: number | null;
  warning: string | null;
} {
  if (balance <= 0) {
    return {
      canAmortize: true,
      payoffMonths: 0,
      totalInterestApprox: 0,
      warning: null,
    };
  }

  if (monthlyPayment <= 0) {
    return {
      canAmortize: false,
      payoffMonths: null,
      totalInterestApprox: null,
      warning: "월 상환액이 0원 이하라 원금이 줄지 않습니다.",
    };
  }

  const firstMonthInterest = balance * monthlyRate;
  if (monthlyPayment <= firstMonthInterest) {
    return {
      canAmortize: false,
      payoffMonths: null,
      totalInterestApprox: null,
      warning: "현재 월 상환액으로는 이자도 모두 갚지 못해 원금 감소가 어렵습니다.",
    };
  }

  let remain = balance;
  let interestSum = 0;
  let months = 0;

  while (remain > 0 && months < 1200) {
    const interest = remain * monthlyRate;
    const principal = monthlyPayment - interest;

    if (principal <= 0) {
      return {
        canAmortize: false,
        payoffMonths: null,
        totalInterestApprox: null,
        warning: "상환 과정에서 원금이 줄지 않아 상환 계획을 재조정해야 합니다.",
      };
    }

    remain = Math.max(0, remain - principal);
    interestSum += interest;
    months += 1;
  }

  if (remain > 0) {
    return {
      canAmortize: false,
      payoffMonths: null,
      totalInterestApprox: null,
      warning: "100년 이내 상환이 어려워 월 상환액 증액 또는 금리 재조정이 필요합니다.",
    };
  }

  return {
    canAmortize: true,
    payoffMonths: months,
    totalInterestApprox: interestSum,
    warning: null,
  };
}

function requiredMonthlyContribution(goalValue: number, monthlyRate: number, months: number): number {
  if (months <= 0) return goalValue;
  if (monthlyRate === 0) return goalValue / months;

  const factor = Math.pow(1 + monthlyRate, months) - 1;
  if (factor <= 0) return goalValue;
  return (goalValue * monthlyRate) / factor;
}

function forecastGoalMonths(goalValue: number, monthlyContribution: number, monthlyRate: number): number | null {
  if (goalValue <= 0) return 0;
  if (monthlyContribution <= 0 && monthlyRate <= 0) return null;

  let months = 0;
  let value = 0;

  while (months < 1200 && value < goalValue) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    months += 1;
  }

  if (value < goalValue) return null;
  return months;
}

export function runPlanner(input: PlannerInput): PlannerResult {
  const totalMonthlyExpense = input.monthlyFixedExpense + input.monthlyVariableExpense;
  const baseFreeCashflow = input.monthlyIncome - totalMonthlyExpense - input.monthlyDebtPayment;
  const freeCashflow = baseFreeCashflow + input.extraMonthlySaving - input.extraMonthlyDebtPayment;
  const monthlySaving = Math.max(0, freeCashflow);
  const savingRate = input.monthlyIncome > 0 ? monthlySaving / input.monthlyIncome : 0;

  const emergencyCurrentMonths = totalMonthlyExpense > 0 ? input.cashAssets / totalMonthlyExpense : 0;
  const emergencyTargetAmount = totalMonthlyExpense * input.emergencyTargetMonths;
  const emergencyGap = Math.max(0, emergencyTargetAmount - input.cashAssets);
  const emergencyMonthsToTarget =
    emergencyGap <= 0 ? 0 : monthlySaving > 0 ? Math.ceil(emergencyGap / monthlySaving) : null;

  const monthlyDebtRate = toMonthlyRate(input.debtRateAnnual);
  const debtPayment = Math.max(0, input.monthlyDebtPayment + input.extraMonthlyDebtPayment);
  const debtProjection = simulateDebtPayoff(input.debtBalance, monthlyDebtRate, debtPayment);
  const debtBurdenRatio = input.monthlyIncome > 0 ? debtPayment / input.monthlyIncome : 0;

  const goalMonths = Math.max(1, Math.floor(input.goalDeadlineMonths));
  const inflationAnnual = Math.max(-99, input.assumedInflationRate) / 100;
  const goalNominal = input.goalAmount * Math.pow(1 + inflationAnnual, goalMonths / 12);
  const monthlyReturnRate = toMonthlyRate(input.assumedAnnualReturn);
  const requiredMonthly = requiredMonthlyContribution(goalNominal, monthlyReturnRate, goalMonths);
  const forecastMonths = forecastGoalMonths(goalNominal, monthlySaving, monthlyReturnRate);
  const goalFeasible = monthlySaving >= requiredMonthly;
  const goalShortfall = Math.max(0, requiredMonthly - monthlySaving);

  const netAssets = input.cashAssets - input.debtBalance;

  const warnings: string[] = [];
  if (freeCashflow < 0) warnings.push("현재 현금흐름이 음수입니다. 지출 조정 또는 소득 개선이 우선입니다.");
  if (debtProjection.warning) warnings.push(debtProjection.warning);
  if (emergencyGap > 0) warnings.push("비상금 목표 대비 부족분이 있어 비상금 우선 적립이 필요합니다.");
  if (!goalFeasible)
    warnings.push("현재 가용저축액으로는 목표기한 내 달성이 어려워 목표·기한·저축액 조정이 필요합니다.");

  const priority: string[] = [];
  if (freeCashflow < 0) priority.push("1) 지출 조정/소득 개선으로 월 현금흐름을 흑자로 전환");
  if (!debtProjection.canAmortize || input.debtRateAnnual >= 7)
    priority.push("2) 부채 상환 전략 재조정(월 상환액 증액 또는 금리 재점검)");
  if (emergencyGap > 0)
    priority.push(`3) 비상금 ${input.emergencyTargetMonths}개월 목표(${emergencyTargetAmount.toFixed(1)}) 확보`);
  if (!goalFeasible)
    priority.push(`4) 목표 달성 필요 월적립액 ${requiredMonthly.toFixed(1)} 기준으로 계획 조정`);
  if (!priority.length) priority.push("현재 계획을 유지하되 월별 점검으로 가정값을 업데이트");

  return {
    cashflow: {
      totalMonthlyExpense,
      freeCashflow,
      monthlySaving,
      savingRate,
    },
    emergency: {
      currentMonths: emergencyCurrentMonths,
      targetMonths: input.emergencyTargetMonths,
      targetAmount: emergencyTargetAmount,
      gap: emergencyGap,
      monthsToTarget: emergencyMonthsToTarget,
    },
    debt: {
      debtBurdenRatio,
      canAmortize: debtProjection.canAmortize,
      payoffMonths: debtProjection.payoffMonths,
      totalInterestApprox: debtProjection.totalInterestApprox,
      warning: debtProjection.warning,
    },
    goal: {
      goalNominal,
      requiredMonthly,
      feasible: goalFeasible,
      shortfallMonthly: goalShortfall,
      forecastMonths,
    },
    netAssets,
    warnings,
    priority,
    assumptions: {
      assumedAnnualReturn: input.assumedAnnualReturn,
      assumedInflationRate: input.assumedInflationRate,
    },
  };
}
