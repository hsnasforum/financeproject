export type PlannerUnit = "KRW" | "MANWON";

export type PlannerInput = {
  unit: PlannerUnit;
  goalName: string;
  goalAmount: number;
  goalDeadlineMonths: number;
  goalPriority: "high" | "medium" | "low";
  monthlyIncome: number;
  monthlyFixedExpense: number;
  monthlyVariableExpense: number;
  cashAssets: number;
  debtBalance: number;
  debtRateAnnual: number;
  monthlyDebtPayment: number;
  emergencyTargetMonths: number;
  assumedAnnualReturn: number;
  assumedInflationRate: number;
  extraMonthlySaving: number;
  extraMonthlyDebtPayment: number;
  riskProfile: "conservative" | "balanced" | "aggressive";
  insuranceStatus: "unknown" | "none" | "basic" | "adequate";
  monthlyInsurancePremium: number;
  indemnityStatus: "unknown" | "yes" | "no";
  insurancePurposeHealth: boolean;
  insurancePurposeAccident: boolean;
  insurancePurposeLife: boolean;
  insurancePurposeIncome: boolean;
  retirementAssets: number;
  retirementMonthlyContribution: number;
  npsExpectedMonthly: number;
  retirementNeedRatioPct: number;
  retirementWithdrawalRatePct: number;
};

export type PlannerMetrics = {
  unit: PlannerUnit;
  baseMultiplier: number;
  freeCashflow: number;
  monthlySaving: number;
  savingsRate: number;
  totalMonthlyExpense: number;
  emergencyMonths: number;
  emergencyTargetAmount: number;
  emergencyGap: number;
  emergencyMonthsToTarget: number | null;
  debtPaymentRatio: number;
  debtPayoffFeasible: boolean;
  debtPayoffWarning: string | null;
  estimatedPayoffMonths: number | null;
  estimatedDebtInterest: number | null;
  goalNominal: number;
  goalRequiredMonthly: number;
  goalFeasible: boolean;
  goalGapMonthly: number;
  goalForecastMonths: number | null;
  netAssets: number;
};

export function unitMultiplier(unit: PlannerUnit): number {
  return unit === "MANWON" ? 10000 : 1;
}

function toMonthlyRate(annualRatePercent: number): number {
  return annualRatePercent / 100 / 12;
}

function simulateDebt(balance: number, monthlyRate: number, monthlyPayment: number) {
  if (balance <= 0) {
    return {
      debtPayoffFeasible: true,
      debtPayoffWarning: null,
      estimatedPayoffMonths: 0,
      estimatedDebtInterest: 0,
    };
  }

  if (monthlyPayment <= 0) {
    return {
      debtPayoffFeasible: false,
      debtPayoffWarning: "월 상환액이 0 이하라 원금이 줄지 않습니다.",
      estimatedPayoffMonths: null,
      estimatedDebtInterest: null,
    };
  }

  const firstInterest = balance * monthlyRate;
  if (monthlyPayment <= firstInterest) {
    return {
      debtPayoffFeasible: false,
      debtPayoffWarning: "현재 월 상환액으로는 이자도 감당하지 못해 원금 감소가 어렵습니다.",
      estimatedPayoffMonths: null,
      estimatedDebtInterest: null,
    };
  }

  let remain = balance;
  let months = 0;
  let interestSum = 0;

  while (remain > 0 && months < 1200) {
    const interest = remain * monthlyRate;
    const principal = monthlyPayment - interest;
    if (principal <= 0) {
      return {
        debtPayoffFeasible: false,
        debtPayoffWarning: "상환 과정에서 원금이 줄지 않습니다. 상환계획 조정이 필요합니다.",
        estimatedPayoffMonths: null,
        estimatedDebtInterest: null,
      };
    }
    remain = Math.max(0, remain - principal);
    interestSum += interest;
    months += 1;
  }

  if (remain > 0) {
    return {
      debtPayoffFeasible: false,
      debtPayoffWarning: "100년 이내 상환이 어려워 월 상환액/금리 전략 조정이 필요합니다.",
      estimatedPayoffMonths: null,
      estimatedDebtInterest: null,
    };
  }

  return {
    debtPayoffFeasible: true,
    debtPayoffWarning: null,
    estimatedPayoffMonths: months,
    estimatedDebtInterest: interestSum,
  };
}

function requiredMonthly(goalValue: number, monthlyRate: number, months: number): number {
  if (months <= 0) return goalValue;
  if (monthlyRate === 0) return goalValue / months;
  const factor = Math.pow(1 + monthlyRate, months) - 1;
  if (factor <= 0) return goalValue;
  return (goalValue * monthlyRate) / factor;
}

function forecastMonths(goalValue: number, monthlyContribution: number, monthlyRate: number): number | null {
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

export function computeMetrics(input: PlannerInput): PlannerMetrics {
  const mult = unitMultiplier(input.unit);

  const monthlyIncome = input.monthlyIncome * mult;
  const fixed = input.monthlyFixedExpense * mult;
  const variable = input.monthlyVariableExpense * mult;
  const cashAssets = input.cashAssets * mult;
  const debtBalance = input.debtBalance * mult;
  const monthlyDebtPayment = (input.monthlyDebtPayment + input.extraMonthlyDebtPayment) * mult;
  const goalAmount = input.goalAmount * mult;
  const extraSaving = input.extraMonthlySaving * mult;

  const totalMonthlyExpense = fixed + variable;
  const freeCashflow = monthlyIncome - totalMonthlyExpense - monthlyDebtPayment;
  const monthlySaving = Math.max(0, freeCashflow + extraSaving);
  const savingsRate = monthlyIncome > 0 ? monthlySaving / monthlyIncome : 0;

  const emergencyMonths = totalMonthlyExpense > 0 ? cashAssets / totalMonthlyExpense : 0;
  const emergencyTargetAmount = totalMonthlyExpense * input.emergencyTargetMonths;
  const emergencyGap = Math.max(0, emergencyTargetAmount - cashAssets);
  const emergencyMonthsToTarget =
    emergencyGap <= 0 ? 0 : monthlySaving > 0 ? Math.ceil(emergencyGap / monthlySaving) : null;

  const debtPaymentRatio = monthlyIncome > 0 ? monthlyDebtPayment / monthlyIncome : 0;
  const debtProjection = simulateDebt(debtBalance, toMonthlyRate(input.debtRateAnnual), monthlyDebtPayment);

  const months = Math.max(1, Math.floor(input.goalDeadlineMonths));
  const inflation = Math.max(-99, input.assumedInflationRate) / 100;
  const goalNominal = goalAmount * Math.pow(1 + inflation, months / 12);
  const goalRequiredMonthly = requiredMonthly(goalNominal, toMonthlyRate(input.assumedAnnualReturn), months);
  const goalForecastMonths = forecastMonths(goalNominal, monthlySaving, toMonthlyRate(input.assumedAnnualReturn));
  const goalFeasible = monthlySaving >= goalRequiredMonthly;
  const goalGapMonthly = Math.max(0, goalRequiredMonthly - monthlySaving);

  return {
    unit: input.unit,
    baseMultiplier: mult,
    freeCashflow,
    monthlySaving,
    savingsRate,
    totalMonthlyExpense,
    emergencyMonths,
    emergencyTargetAmount,
    emergencyGap,
    emergencyMonthsToTarget,
    debtPaymentRatio,
    debtPayoffFeasible: debtProjection.debtPayoffFeasible,
    debtPayoffWarning: debtProjection.debtPayoffWarning,
    estimatedPayoffMonths: debtProjection.estimatedPayoffMonths,
    estimatedDebtInterest: debtProjection.estimatedDebtInterest,
    goalNominal,
    goalRequiredMonthly,
    goalFeasible,
    goalGapMonthly,
    goalForecastMonths,
    netAssets: cashAssets - debtBalance,
  };
}
