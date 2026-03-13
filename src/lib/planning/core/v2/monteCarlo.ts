import { roundToDigits } from "../../calc/roundingPolicy";
import { mulberry32, clamp } from "./random";
import { buildStochasticParams, sampleMonthlyInflationRate, sampleMonthlyInvestReturnRate } from "./stochasticModel";
import { type AssumptionsV2, type RiskTolerance } from "./scenarios";
import { type ProfileV2 } from "./types";
import { computeMonthlyCashflow } from "./cashflowSchedule";
import { getAllocationPolicy } from "./policy/presets";
import { type AllocationPolicyId } from "./policy/types";

export type MonteCarloInput = {
  profile: ProfileV2;
  horizonMonths: number;
  baseAssumptions: AssumptionsV2;
  paths?: number;
  seed?: number;
  riskTolerance?: RiskTolerance;
  policyId?: AllocationPolicyId;
  metrics?: {
    retirementDepletion?: boolean;
    goals?: boolean;
  };
};

export type MonteCarloResult = {
  meta: { paths: number; seed: number };
  probabilities: {
    emergencyAchievedByMonth?: number;
    lumpSumGoalAchieved?: Record<string, number>;
    retirementAchievedAtRetireAge?: number;
    retirementDepletionBeforeEnd?: number;
  };
  percentiles: {
    endNetWorthKrw: { p10: number; p50: number; p90: number };
    worstCashKrw: { p10: number; p50: number; p90: number };
  };
  notes: string[];
};

type DebtState = {
  id: string;
  balance: number;
  minimumPayment: number;
  monthlyRate: number;
};

type GoalState = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetMonth: number;
  priority: number;
  minimumMonthlyContribution: number;
};

type GoalClassification = {
  emergencyGoalId?: string;
  retirementGoalId?: string;
  lumpSumGoalIds: string[];
};

type PathOutcome = {
  endNetWorthKrw: number;
  worstCashKrw: number;
  goalAchievedAtTarget: Record<string, boolean>;
  retirementDepletionBeforeEnd: boolean;
};

const DEFAULT_PATHS = 2000;
const DEFAULT_SEED = 12345;

function toMonthlyRateFromAnnual(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function normalizeAnnualRateInput(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.abs(value) <= 1 ? value : value / 100;
  return clamp(normalized, -0.99, 2);
}

function sortDebtsByRate(debts: DebtState[]): DebtState[] {
  return [...debts].sort((a, b) => {
    if (b.monthlyRate !== a.monthlyRate) return b.monthlyRate - a.monthlyRate;
    return a.id.localeCompare(b.id);
  });
}

function sumDebt(debts: DebtState[]): number {
  return debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
}

function sumGoalFunds(goals: GoalState[]): number {
  return goals.reduce((sum, goal) => sum + Math.max(0, goal.currentAmount), 0);
}

function coverNegativeLiquidWithInvestments(liquidAssets: number, investmentAssets: number): {
  liquidAssets: number;
  investmentAssets: number;
} {
  if (liquidAssets >= 0 || investmentAssets <= 0) {
    return { liquidAssets, investmentAssets };
  }

  const drawdown = Math.min(investmentAssets, -liquidAssets);
  return {
    liquidAssets: liquidAssets + drawdown,
    investmentAssets: investmentAssets - drawdown,
  };
}

function classifyGoals(profile: ProfileV2): GoalClassification {
  const emergencyKeywords = /(emergency|비상)/i;
  const retirementKeywords = /(retire|retirement|은퇴|노후)/i;

  let emergencyGoalId: string | undefined;
  let retirementGoalId: string | undefined;
  const lumpSumGoalIds: string[] = [];

  for (const goal of profile.goals) {
    const token = `${goal.id} ${goal.name}`;
    if (!emergencyGoalId && emergencyKeywords.test(token)) {
      emergencyGoalId = goal.id;
      continue;
    }
    if (!retirementGoalId && retirementKeywords.test(token)) {
      retirementGoalId = goal.id;
      continue;
    }
    lumpSumGoalIds.push(goal.id);
  }

  return {
    emergencyGoalId,
    retirementGoalId,
    lumpSumGoalIds,
  };
}

function allocateGoalContributions(
  goals: GoalState[],
  liquidAssets: number,
  month: number,
  maxBudget = liquidAssets,
): { liquidAssets: number } {
  if (liquidAssets <= 0 || goals.length === 0) {
    return { liquidAssets };
  }

  const unfinished = goals.filter((goal) => goal.currentAmount + 1e-9 < goal.targetAmount);
  if (unfinished.length === 0) {
    return { liquidAssets };
  }

  let budget = Math.max(0, Math.min(liquidAssets, maxBudget));
  let totalContribution = 0;

  const minimumNeeds = unfinished.map((goal) => {
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    return {
      goal,
      amount: Math.min(remaining, Math.max(0, goal.minimumMonthlyContribution)),
    };
  });
  const totalMinimumNeed = minimumNeeds.reduce((sum, item) => sum + item.amount, 0);

  if (totalMinimumNeed > 0 && budget > 0) {
    for (const item of minimumNeeds) {
      if (item.amount <= 0 || budget <= 0) continue;
      const planned = totalMinimumNeed <= budget ? item.amount : (budget * item.amount) / totalMinimumNeed;
      const remaining = Math.max(0, item.goal.targetAmount - item.goal.currentAmount);
      const contribution = Math.min(remaining, planned, budget);
      if (contribution <= 0) continue;

      item.goal.currentAmount += contribution;
      totalContribution += contribution;
      budget -= contribution;
    }
  }

  const unfinishedAfterMinimum = goals.filter((goal) => goal.currentAmount + 1e-9 < goal.targetAmount);
  if (budget > 0 && unfinishedAfterMinimum.length > 0) {
    const weighted = unfinishedAfterMinimum.map((goal) => {
      const timeRemaining = Math.max(1, goal.targetMonth - month + 1);
      const weight = goal.priority / timeRemaining;
      return { goal, weight };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

    for (const item of weighted) {
      if (budget <= 0) break;
      const remaining = Math.max(0, item.goal.targetAmount - item.goal.currentAmount);
      if (remaining <= 0) continue;

      const planned = totalWeight > 0 ? (budget * item.weight) / totalWeight : budget / weighted.length;
      const contribution = Math.min(remaining, planned, budget);
      if (contribution <= 0) continue;

      item.goal.currentAmount += contribution;
      totalContribution += contribution;
      budget -= contribution;
    }
  }

  return {
    liquidAssets: liquidAssets - totalContribution,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.trunc(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round6(value: number): number {
  return roundToDigits(value, 6);
}

function round2(value: number): number {
  return roundToDigits(value, 2);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function computePolicyBudgets(input: {
  policyId: AllocationPolicyId;
  liquidAssets: number;
  emergencyFundTargetKrw: number;
}): {
  debtExtraBudget: number;
  policyInvestBudget: number;
  goalBudget: number;
} {
  const policy = getAllocationPolicy(input.policyId);
  const surplus = Math.max(0, input.liquidAssets);
  if (surplus <= 0) {
    return { debtExtraBudget: 0, policyInvestBudget: 0, goalBudget: 0 };
  }
  if (policy.id === "balanced") {
    return {
      debtExtraBudget: surplus,
      policyInvestBudget: 0,
      goalBudget: surplus,
    };
  }

  const emergencyShortfall = policy.rules.emergencyFirst
    ? Math.max(0, input.emergencyFundTargetKrw - input.liquidAssets)
    : 0;
  const emergencyHoldback = Math.min(surplus, emergencyShortfall);
  const allocatable = Math.max(0, surplus - emergencyHoldback);

  let debtPct = clamp01(policy.rules.debtExtraPaymentPctOfSurplus ?? 0);
  let investPct = clamp01(policy.rules.investMinPctOfSurplus ?? 0);
  let goalPct = clamp01(policy.rules.lumpSumReservePctOfSurplus ?? 0);
  if (policy.guards.stopInvestWhenEmergencyShort && input.liquidAssets + 1e-9 < input.emergencyFundTargetKrw) {
    investPct = 0;
  }

  const pctSum = debtPct + investPct + goalPct;
  if (pctSum > 1 + 1e-9) {
    debtPct /= pctSum;
    investPct /= pctSum;
    goalPct /= pctSum;
  }

  let debtExtraBudget = allocatable * debtPct;
  const policyInvestBudget = allocatable * investPct;
  let goalBudget = allocatable * goalPct;
  const remainder = Math.max(0, allocatable - debtExtraBudget - policyInvestBudget - goalBudget);
  if (policy.id === "growth") {
    goalBudget += remainder;
  } else {
    debtExtraBudget += remainder;
  }

  return {
    debtExtraBudget,
    policyInvestBudget,
    goalBudget,
  };
}

function runOnePath(input: {
  profile: ProfileV2;
  horizonMonths: number;
  baseAssumptions: AssumptionsV2;
  rng: () => number;
  riskTolerance: RiskTolerance;
  policyId: AllocationPolicyId;
  goalClassification: GoalClassification;
}): PathOutcome {
  const stochastic = buildStochasticParams(input.baseAssumptions, input.riskTolerance);
  let liquidAssets = input.profile.liquidAssets;
  let investmentAssets = input.profile.investmentAssets;
  let pensionAssets = 0;
  let expenseIndex = 1;

  const goals: GoalState[] = input.profile.goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount ?? 0,
    targetMonth: goal.targetMonth ?? input.horizonMonths,
    priority: goal.priority ?? 3,
    minimumMonthlyContribution: goal.minimumMonthlyContribution ?? 0,
  }));

  const retirementStartMonth = goals.find((goal) => goal.id === input.goalClassification.retirementGoalId)?.targetMonth
    ?? input.horizonMonths + 1;
  const hasPhaseSchedule = (input.profile.cashflow?.phases?.length ?? 0) > 0;
  const emergencyMonthlyExpenseTarget = Math.max(0, input.profile.monthlyEssentialExpenses + input.profile.monthlyDiscretionaryExpenses);
  const emergencyFundTargetKrw = emergencyMonthlyExpenseTarget * getAllocationPolicy(input.policyId).rules.minEmergencyMonths;

  const debts: DebtState[] = input.profile.debts.map((debt) => {
    const rawAnnualRate = input.baseAssumptions.debtRates?.[debt.id] ?? debt.apr ?? 0;
    const annualRate = normalizeAnnualRateInput(rawAnnualRate);
    return {
      id: debt.id,
      balance: debt.balance,
      minimumPayment: debt.minimumPayment,
      monthlyRate: toMonthlyRateFromAnnual(annualRate),
    };
  });

  let worstCash = liquidAssets;
  let retirementDepletionBeforeEnd = false;
  const goalAchievedAtTarget: Record<string, boolean> = {};

  for (let month = 1; month <= input.horizonMonths; month += 1) {
    const inflationMonthly = sampleMonthlyInflationRate(stochastic, input.rng);
    const investReturnMonthly = sampleMonthlyInvestReturnRate(stochastic, input.rng);

    expenseIndex *= 1 + inflationMonthly;
    const scheduled = computeMonthlyCashflow(input.profile, month - 1, expenseIndex, {
      horizonMonths: input.horizonMonths,
    });
    const earnedIncome = month >= retirementStartMonth && !hasPhaseSchedule ? 0 : scheduled.incomeKrw;
    const monthlyIncome = earnedIncome + scheduled.pensionIncomeKrw;
    const expenses = (scheduled.fixedExpensesKrw + scheduled.variableExpensesKrw) * expenseIndex;

    liquidAssets += monthlyIncome;
    liquidAssets -= expenses;

    const postExpenseCover = coverNegativeLiquidWithInvestments(liquidAssets, investmentAssets);
    liquidAssets = postExpenseCover.liquidAssets;
    investmentAssets = postExpenseCover.investmentAssets;

    investmentAssets += investmentAssets * investReturnMonthly;

    let debtPaymentBudget = Math.max(0, liquidAssets);
    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      debt.balance += debt.balance * debt.monthlyRate;
    }

    for (const debt of sortDebtsByRate(debts)) {
      if (debt.balance <= 0 || debtPaymentBudget <= 0) continue;
      const due = Math.min(debt.balance, debt.minimumPayment);
      const paid = Math.min(due, debtPaymentBudget);
      debt.balance -= paid;
      debtPaymentBudget -= paid;
    }
    liquidAssets = Math.min(liquidAssets, debtPaymentBudget);

    const policyBudgets = computePolicyBudgets({
      policyId: input.policyId,
      liquidAssets,
      emergencyFundTargetKrw,
    });
    let debtExtraBudget = Math.max(0, Math.min(liquidAssets, policyBudgets.debtExtraBudget));
    for (const debt of sortDebtsByRate(debts)) {
      if (debt.balance <= 0 || liquidAssets <= 0 || debtExtraBudget <= 0) continue;
      const extra = Math.min(liquidAssets, debt.balance, debtExtraBudget);
      debt.balance -= extra;
      liquidAssets -= extra;
      debtExtraBudget -= extra;
    }

    const requestedToInvest = scheduled.contributionKrw.toInvest + policyBudgets.policyInvestBudget;
    const requestedToPension = scheduled.contributionKrw.toPension;
    if (requestedToInvest + requestedToPension > 0) {
      let contributionBudget = Math.max(0, liquidAssets);
      const appliedToInvest = Math.min(requestedToInvest, contributionBudget);
      contributionBudget -= appliedToInvest;
      const appliedToPension = Math.min(requestedToPension, contributionBudget);

      liquidAssets -= appliedToInvest + appliedToPension;
      investmentAssets += appliedToInvest;
      pensionAssets += appliedToPension;
    }

    const goalAllocation = allocateGoalContributions(
      goals,
      liquidAssets,
      month,
      input.policyId === "balanced"
        ? liquidAssets
        : Math.min(liquidAssets, policyBudgets.goalBudget),
    );
    liquidAssets = goalAllocation.liquidAssets;

    const postFundingCover = coverNegativeLiquidWithInvestments(liquidAssets, investmentAssets);
    liquidAssets = postFundingCover.liquidAssets;
    investmentAssets = postFundingCover.investmentAssets;

    worstCash = Math.min(worstCash, liquidAssets);
    if (month >= retirementStartMonth && liquidAssets + investmentAssets + pensionAssets <= 0) {
      retirementDepletionBeforeEnd = true;
    }

    for (const goal of goals) {
      if (goal.targetMonth === month) {
        goalAchievedAtTarget[goal.id] = goal.currentAmount + 1e-9 >= goal.targetAmount;
      }
    }
  }

  for (const goal of goals) {
    if (goalAchievedAtTarget[goal.id] !== undefined) continue;
    goalAchievedAtTarget[goal.id] = goal.currentAmount + 1e-9 >= goal.targetAmount;
  }

  return {
    endNetWorthKrw: round2(liquidAssets + investmentAssets + pensionAssets + sumGoalFunds(goals) - sumDebt(debts)),
    worstCashKrw: round2(worstCash),
    goalAchievedAtTarget,
    retirementDepletionBeforeEnd,
  };
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const paths = Math.trunc(clamp(input.paths ?? DEFAULT_PATHS, 1, 20000));
  const seed = (Math.trunc(input.seed ?? DEFAULT_SEED) >>> 0);
  const rng = mulberry32(seed);
  const riskTolerance = input.riskTolerance ?? "mid";
  const policyId = input.policyId ?? "balanced";
  const includeGoalMetrics = input.metrics?.goals ?? true;
  const includeRetirementDepletion = input.metrics?.retirementDepletion ?? true;
  const goalClassification = classifyGoals(input.profile);

  const endNetWorths: number[] = [];
  const worstCashes: number[] = [];
  const goalAchievedCounts: Record<string, number> = {};
  let retirementDepletionCount = 0;

  for (let path = 0; path < paths; path += 1) {
    const outcome = runOnePath({
      profile: input.profile,
      horizonMonths: input.horizonMonths,
      baseAssumptions: input.baseAssumptions,
      rng,
      riskTolerance,
      policyId,
      goalClassification,
    });

    endNetWorths.push(outcome.endNetWorthKrw);
    worstCashes.push(outcome.worstCashKrw);
    if (includeRetirementDepletion && outcome.retirementDepletionBeforeEnd) {
      retirementDepletionCount += 1;
    }

    if (includeGoalMetrics) {
      for (const [goalId, achieved] of Object.entries(outcome.goalAchievedAtTarget)) {
        if (!goalAchievedCounts[goalId]) goalAchievedCounts[goalId] = 0;
        if (achieved) goalAchievedCounts[goalId] += 1;
      }
    }
  }

  const emergencyAchievedByMonth = includeGoalMetrics && goalClassification.emergencyGoalId
    ? round6((goalAchievedCounts[goalClassification.emergencyGoalId] ?? 0) / paths)
    : undefined;

  const lumpSumGoalAchieved = includeGoalMetrics && goalClassification.lumpSumGoalIds.length > 0
    ? goalClassification.lumpSumGoalIds.reduce<Record<string, number>>((map, goalId) => {
      map[goalId] = round6((goalAchievedCounts[goalId] ?? 0) / paths);
      return map;
    }, {})
    : undefined;

  const retirementAchievedAtRetireAge = includeGoalMetrics && goalClassification.retirementGoalId
    ? round6((goalAchievedCounts[goalClassification.retirementGoalId] ?? 0) / paths)
    : undefined;

  const retirementDepletionBeforeEnd = includeRetirementDepletion
    ? round6(retirementDepletionCount / paths)
    : undefined;

  return {
    meta: {
      paths,
      seed,
    },
    probabilities: {
      ...(emergencyAchievedByMonth !== undefined ? { emergencyAchievedByMonth } : {}),
      ...(lumpSumGoalAchieved ? { lumpSumGoalAchieved } : {}),
      ...(retirementAchievedAtRetireAge !== undefined ? { retirementAchievedAtRetireAge } : {}),
      ...(retirementDepletionBeforeEnd !== undefined ? { retirementDepletionBeforeEnd } : {}),
    },
    percentiles: {
      endNetWorthKrw: {
        p10: round2(percentile(endNetWorths, 0.1)),
        p50: round2(percentile(endNetWorths, 0.5)),
        p90: round2(percentile(endNetWorths, 0.9)),
      },
      worstCashKrw: {
        p10: round2(percentile(worstCashes, 0.1)),
        p50: round2(percentile(worstCashes, 0.5)),
        p90: round2(percentile(worstCashes, 0.9)),
      },
    },
    notes: [
      "확률 값은 모델 기반 추정치이며 보장이 아닙니다.",
      "수익률/물가 분포는 단순화된 가정입니다.",
      "현금흐름 스케줄(phase/pension/contribution)은 경로마다 동일 규칙으로 적용됩니다.",
    ],
  };
}
