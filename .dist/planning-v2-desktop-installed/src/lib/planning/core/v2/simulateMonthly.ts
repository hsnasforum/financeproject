import {
  type DecisionTrace,
  type GoalStatusV2,
  type ProfileV2Goal,
  type SimulationRunOptionsV2,
  type SimulationResultV2,
  type TimelineRowV2,
} from "./types";
import { buildExplainabilityEntry, buildWarning, explainFromTimelineRow } from "./explain";
import { computeMonthlyCashflow, hasPhaseOverlap } from "./cashflowSchedule";
import { getAllocationPolicy } from "./policy/presets";
import { validateSimulationInputV2 } from "./validate";

type DebtState = {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  annualRate: number;
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
  achievedMonth: number | null;
};

const HIGH_DEBT_SERVICE_RATIO_THRESHOLD = 0.4;
const RETIREMENT_WITHDRAWAL_RATE = 0.04;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function sumDebt(debts: DebtState[]): number {
  return debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
}

function sumGoalFunds(goals: GoalState[]): number {
  return goals.reduce((sum, goal) => sum + Math.max(0, goal.currentAmount), 0);
}

function sortDebtsByRate(debts: DebtState[]): DebtState[] {
  return [...debts].sort((a, b) => {
    if (b.annualRate !== a.annualRate) return b.annualRate - a.annualRate;
    return a.id.localeCompare(b.id);
  });
}

function coverNegativeLiquidWithInvestments(liquidAssets: number, investmentAssets: number): {
  liquidAssets: number;
  investmentAssets: number;
  drawdown: number;
} {
  if (liquidAssets >= 0 || investmentAssets <= 0) {
    return { liquidAssets, investmentAssets, drawdown: 0 };
  }

  const drawdown = Math.min(investmentAssets, -liquidAssets);
  return {
    liquidAssets: liquidAssets + drawdown,
    investmentAssets: investmentAssets - drawdown,
    drawdown,
  };
}

function buildGoalProgress(goals: GoalState[]): Record<string, number> {
  return goals.reduce<Record<string, number>>((map, goal) => {
    const progress = goal.targetAmount <= 0 ? 100 : (goal.currentAmount / goal.targetAmount) * 100;
    map[goal.id] = round2(Math.max(0, progress));
    return map;
  }, {});
}

function allocateGoalContributions(
  goals: GoalState[],
  liquidAssets: number,
  month: number,
  maxBudget = liquidAssets,
): {
  liquidAssets: number;
  totalContribution: number;
  contributionsByGoal: Record<string, number>;
  newlyReachedGoalIds: string[];
} {
  const contributionsByGoal: Record<string, number> = {};
  goals.forEach((goal) => {
    contributionsByGoal[goal.id] = 0;
  });

  if (liquidAssets <= 0 || goals.length === 0) {
    return {
      liquidAssets,
      totalContribution: 0,
      contributionsByGoal,
      newlyReachedGoalIds: [],
    };
  }

  const unfinished = goals.filter((goal) => goal.currentAmount + 1e-9 < goal.targetAmount);
  if (unfinished.length === 0) {
    return {
      liquidAssets,
      totalContribution: 0,
      contributionsByGoal,
      newlyReachedGoalIds: [],
    };
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
    minimumNeeds.forEach((item) => {
      if (item.amount <= 0 || budget <= 0) return;
      const planned = totalMinimumNeed <= budget
        ? item.amount
        : (budget * item.amount) / totalMinimumNeed;
      const remaining = Math.max(0, item.goal.targetAmount - item.goal.currentAmount);
      const contribution = Math.min(remaining, planned, budget);
      if (contribution <= 0) return;

      item.goal.currentAmount += contribution;
      contributionsByGoal[item.goal.id] += contribution;
      totalContribution += contribution;
      budget -= contribution;
    });
  }

  const unfinishedAfterMinimum = goals.filter((goal) => goal.currentAmount + 1e-9 < goal.targetAmount);

  if (budget > 0 && unfinishedAfterMinimum.length > 0) {
    const weighted = unfinishedAfterMinimum.map((goal) => {
      const timeRemaining = Math.max(1, goal.targetMonth - month + 1);
      const weight = goal.priority / timeRemaining;
      return { goal, weight };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

    weighted.forEach((item) => {
      if (budget <= 0) return;
      const remaining = Math.max(0, item.goal.targetAmount - item.goal.currentAmount);
      if (remaining <= 0) return;

      const planned = totalWeight > 0
        ? (budget * item.weight) / totalWeight
        : budget / weighted.length;
      const contribution = Math.min(remaining, planned, budget);
      if (contribution <= 0) return;

      item.goal.currentAmount += contribution;
      contributionsByGoal[item.goal.id] += contribution;
      totalContribution += contribution;
      budget -= contribution;
    });
  }

  const newlyReachedGoalIds: string[] = [];
  goals.forEach((goal) => {
    if (goal.achievedMonth !== null) return;
    if (goal.currentAmount + 1e-9 >= goal.targetAmount) {
      goal.achievedMonth = month;
      newlyReachedGoalIds.push(goal.id);
    }
  });

  return {
    liquidAssets: liquidAssets - totalContribution,
    totalContribution,
    contributionsByGoal,
    newlyReachedGoalIds,
  };
}

function buildGoalStatuses(goals: GoalState[], horizonMonths: number): GoalStatusV2[] {
  return goals.map((goal) => {
    const achieved = goal.currentAmount + 1e-9 >= goal.targetAmount;
    const progressRatio = goal.targetAmount <= 0 ? 1 : goal.currentAmount / goal.targetAmount;
    const expectedProgress = Math.min(1, horizonMonths / goal.targetMonth);
    const achievedByTarget = goal.achievedMonth !== null && goal.achievedMonth <= goal.targetMonth;

    return {
      goalId: goal.id,
      name: goal.name,
      targetAmount: round2(goal.targetAmount),
      currentAmount: round2(goal.currentAmount),
      progressPct: round2(Math.max(0, progressRatio * 100)),
      achieved,
      achievedMonth: goal.achievedMonth,
      targetMonth: goal.targetMonth,
      onTrack: achievedByTarget || progressRatio + 1e-9 >= expectedProgress * 0.9,
      shortfall: round2(Math.max(0, goal.targetAmount - goal.currentAmount)),
    };
  });
}

function isRetirementGoal(goalId: string, goalName: string): boolean {
  return /(retire|retirement|은퇴|노후)/i.test(`${goalId} ${goalName}`);
}

function hasLifecycleSchedule(profile: {
  cashflow?: {
    phases?: unknown[];
    pensions?: unknown[];
    contributions?: unknown[];
  };
}): boolean {
  const cashflow = profile.cashflow;
  if (!cashflow) return false;
  return (cashflow.phases?.length ?? 0) > 0
    || (cashflow.pensions?.length ?? 0) > 0
    || (cashflow.contributions?.length ?? 0) > 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function computePolicyBudgets(input: {
  policyId: "balanced" | "safety" | "growth";
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

export function simulateMonthly(
  profileInput: unknown,
  assumptionsInput: unknown,
  horizonMonthsInput: unknown,
  options?: SimulationRunOptionsV2,
): SimulationResultV2 {
  const { profile, assumptions, horizonMonths, policyId } = validateSimulationInputV2(
    profileInput,
    assumptionsInput,
    horizonMonthsInput,
    options?.policyId,
  );

  let liquidAssets = profile.liquidAssets;
  let investmentAssets = profile.investmentAssets;
  let pensionAssets = 0;

  const debtRateAssumedIds = new Set<string>();
  const resolvedAnnualDebtRates: Record<string, number> = {};
  const resolvedMonthlyDebtRates: Record<string, number> = {};

  const debts: DebtState[] = profile.debts.map((debt) => {
    const annualRate = assumptions.annualDebtRates[debt.id]
      ?? debt.apr
      ?? 0;
    if (assumptions.annualDebtRates[debt.id] === undefined && debt.apr === undefined) {
      debtRateAssumedIds.add(debt.id);
    }

    const monthlyRate = toMonthlyRate(annualRate);
    resolvedAnnualDebtRates[debt.id] = annualRate;
    resolvedMonthlyDebtRates[debt.id] = monthlyRate;

    return {
      id: debt.id,
      name: debt.name,
      balance: debt.balance,
      minimumPayment: debt.minimumPayment,
      annualRate,
      monthlyRate,
    };
  });

  const goals: GoalState[] = profile.goals.map((goal: ProfileV2Goal) => {
    const targetMonth = goal.targetMonth ?? horizonMonths;
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount ?? 0,
      targetMonth,
      priority: goal.priority ?? 3,
      minimumMonthlyContribution: goal.minimumMonthlyContribution ?? 0,
      achievedMonth: (goal.currentAmount ?? 0) + 1e-9 >= goal.targetAmount ? 0 : null,
    };
  });

  const timeline: TimelineRowV2[] = [];
  const warnings = [] as ReturnType<typeof buildWarning>[];
  const explainability = [] as ReturnType<typeof explainFromTimelineRow>[];
  const traces: DecisionTrace[] = [];

  function pushTrace(trace: DecisionTrace): void {
    traces.push(trace);
  }

  let negativeCashflowMonths = 0;
  let highDebtRatioMonths = 0;
  let maxDebtServiceRatio = 0;
  let debtNegativeAmortizationMonths = 0;
  let firstNegativeAmortizationMonth: number | undefined;
  let drawdownMonths = 0;
  let insolvencyMonths = 0;
  const phaseOverlap = hasPhaseOverlap(profile, horizonMonths);
  const emergencyMonthlyExpenseTarget = Math.max(0, profile.monthlyEssentialExpenses + profile.monthlyDiscretionaryExpenses);
  const emergencyFundTargetKrw = emergencyMonthlyExpenseTarget * getAllocationPolicy(policyId).rules.minEmergencyMonths;
  let hadEmergencyCoverage = liquidAssets + 1e-9 >= emergencyFundTargetKrw;

  for (let month = 1; month <= horizonMonths; month += 1) {
    const monthIndex = month - 1;
    const totalDebtBefore = sumDebt(debts);
    const prevNetWorth = liquidAssets + investmentAssets + pensionAssets + sumGoalFunds(goals) - totalDebtBefore;

    const expenseFactor = Math.pow(1 + assumptions.monthlyInflationRate, monthIndex);
    const scheduled = computeMonthlyCashflow(profile, monthIndex, expenseFactor, { horizonMonths });
    const monthlyIncome = scheduled.incomeKrw + scheduled.pensionIncomeKrw;
    const expenses = (scheduled.fixedExpensesKrw + scheduled.variableExpensesKrw) * expenseFactor;

    liquidAssets += monthlyIncome;
    liquidAssets -= expenses;

    const postExpenseCover = coverNegativeLiquidWithInvestments(liquidAssets, investmentAssets);
    liquidAssets = postExpenseCover.liquidAssets;
    investmentAssets = postExpenseCover.investmentAssets;
    if (postExpenseCover.drawdown > 0) {
      drawdownMonths += 1;
    }

    const investmentReturn = investmentAssets * assumptions.monthlyExpectedReturnRate;
    investmentAssets += investmentReturn;

    let debtInterest = 0;
    let debtPayment = 0;
    let debtPrincipalPaid = 0;
    const interestByDebtId: Record<string, number> = {};

    debts.forEach((debt) => {
      if (debt.balance <= 0) {
        interestByDebtId[debt.id] = 0;
        return;
      }
      const interest = debt.balance * debt.monthlyRate;
      debt.balance += interest;
      debtInterest += interest;
      interestByDebtId[debt.id] = interest;
    });

    const sortedDebts = sortDebtsByRate(debts);
    const requiredMinimumDebtPayment = sortedDebts.reduce((sum, debt) => {
      if (debt.balance <= 0) return sum;
      return sum + Math.min(debt.balance, debt.minimumPayment);
    }, 0);

    const operatingCashflow = monthlyIncome - expenses - requiredMinimumDebtPayment;
    if (operatingCashflow < 0) {
      negativeCashflowMonths += 1;
    }

    const debtServiceRatio = monthlyIncome > 0 ? requiredMinimumDebtPayment / monthlyIncome : (requiredMinimumDebtPayment > 0 ? 1 : 0);
    if (debtServiceRatio > HIGH_DEBT_SERVICE_RATIO_THRESHOLD) {
      highDebtRatioMonths += 1;
    }
    maxDebtServiceRatio = Math.max(maxDebtServiceRatio, debtServiceRatio);

    sortedDebts.forEach((debt) => {
      if (debt.balance <= 0) return;
      const due = Math.min(debt.balance, debt.minimumPayment);
      const payment = Math.min(due, Math.max(0, liquidAssets));
      if (payment <= 0) {
        if (interestByDebtId[debt.id] > 0) {
          debtNegativeAmortizationMonths += 1;
          if (firstNegativeAmortizationMonth === undefined) firstNegativeAmortizationMonth = month;
        }
        return;
      }

      const interestAccrued = interestByDebtId[debt.id] ?? 0;
      if (payment + 1e-9 < interestAccrued) {
        debtNegativeAmortizationMonths += 1;
        if (firstNegativeAmortizationMonth === undefined) firstNegativeAmortizationMonth = month;
      }

      debt.balance -= payment;
      liquidAssets -= payment;
      debtPayment += payment;
      debtPrincipalPaid += Math.max(0, payment - interestAccrued);
    });

    const policyBudgets = computePolicyBudgets({
      policyId,
      liquidAssets,
      emergencyFundTargetKrw,
    });
    let debtExtraBudget = Math.max(0, Math.min(liquidAssets, policyBudgets.debtExtraBudget));
    sortDebtsByRate(debts).forEach((debt) => {
      if (liquidAssets <= 0 || debt.balance <= 0 || debtExtraBudget <= 0) return;
      const extra = Math.min(liquidAssets, debt.balance, debtExtraBudget);
      debt.balance -= extra;
      liquidAssets -= extra;
      debtExtraBudget -= extra;
      debtPayment += extra;
      debtPrincipalPaid += extra;
    });

    if (debtPayment > 0 && (monthIndex === 0 || month % 12 === 0)) {
      pushTrace({
        monthIndex,
        code: "DEBT_REPAYMENT_MONTH",
        message: "월 부채 상환/이자/원금 분해 결과입니다.",
        data: {
          debtPayment: round2(debtPayment),
          debtInterest: round2(debtInterest),
          debtPrincipalPaid: round2(Math.max(0, debtPrincipalPaid)),
          debtServiceRatio: round2(debtServiceRatio),
        },
      });
    }

    let appliedContributionToInvest = 0;
    let appliedContributionToPension = 0;
    const requestedContributionToInvest = scheduled.contributionKrw.toInvest + policyBudgets.policyInvestBudget;
    const requestedContributionToPension = scheduled.contributionKrw.toPension;
    const totalRequestedContribution = requestedContributionToInvest + requestedContributionToPension;
    if (totalRequestedContribution > 0) {
      let contributionBudget = Math.max(0, liquidAssets);
      appliedContributionToInvest = Math.min(requestedContributionToInvest, contributionBudget);
      contributionBudget -= appliedContributionToInvest;
      appliedContributionToPension = Math.min(requestedContributionToPension, contributionBudget);

      const totalAppliedContribution = appliedContributionToInvest + appliedContributionToPension;
      liquidAssets -= totalAppliedContribution;
      investmentAssets += appliedContributionToInvest;
      pensionAssets += appliedContributionToPension;

      if (totalAppliedContribution + 1e-9 < totalRequestedContribution) {
        warnings.push(buildWarning("CONTRIBUTION_SKIPPED", {
          month,
          meta: {
            requestedToInvest: requestedContributionToInvest,
            requestedToPension: requestedContributionToPension,
            appliedToInvest: appliedContributionToInvest,
            appliedToPension: appliedContributionToPension,
          },
        }));
        pushTrace({
          monthIndex,
          code: "CONTRIBUTION_SKIPPED",
          message: "현금 부족으로 일부 적립이 스킵되었습니다.",
          data: {
            requestedToInvest: round2(requestedContributionToInvest),
            requestedToPension: round2(requestedContributionToPension),
            appliedToInvest: round2(appliedContributionToInvest),
            appliedToPension: round2(appliedContributionToPension),
          },
        });
      }
    }

    const goalAllocation = allocateGoalContributions(
      goals,
      liquidAssets,
      month,
      policyId === "balanced" ? liquidAssets : Math.min(liquidAssets, policyBudgets.goalBudget),
    );
    liquidAssets = goalAllocation.liquidAssets;

    if (liquidAssets < 0 && investmentAssets > 0) {
      const coverAfterDebt = coverNegativeLiquidWithInvestments(liquidAssets, investmentAssets);
      liquidAssets = coverAfterDebt.liquidAssets;
      investmentAssets = coverAfterDebt.investmentAssets;
      if (coverAfterDebt.drawdown > 0) {
        drawdownMonths += 1;
      }
    }

    if (liquidAssets < 0 && investmentAssets <= 0) {
      insolvencyMonths += 1;
    }

    const totalDebt = sumDebt(debts);
    const goalFundAssets = sumGoalFunds(goals);
    const netWorth = liquidAssets + investmentAssets + pensionAssets + goalFundAssets - totalDebt;
    const netWorthDelta = netWorth - prevNetWorth;

    const row: TimelineRowV2 = {
      month,
      income: round2(monthlyIncome),
      pensionIncome: round2(scheduled.pensionIncomeKrw),
      expenses: round2(expenses),
      operatingCashflow: round2(operatingCashflow),
      debtPayment: round2(debtPayment),
      debtInterest: round2(debtInterest),
      debtPrincipalPaid: round2(debtPrincipalPaid),
      contributionToInvest: round2(appliedContributionToInvest),
      contributionToPension: round2(appliedContributionToPension),
      goalContribution: round2(goalAllocation.totalContribution),
      investmentReturn: round2(investmentReturn),
      liquidAssets: round2(liquidAssets),
      investmentAssets: round2(investmentAssets),
      pensionAssets: round2(pensionAssets),
      goalFundAssets: round2(goalFundAssets),
      totalDebt: round2(totalDebt),
      netWorth: round2(netWorth),
      netWorthDelta: round2(netWorthDelta),
      debtServiceRatio: round2(debtServiceRatio),
      goalProgress: buildGoalProgress(goals),
    };

    timeline.push(row);
    explainability.push(explainFromTimelineRow(row));

    if (emergencyFundTargetKrw > 0) {
      const hasCoverageNow = liquidAssets + 1e-9 >= emergencyFundTargetKrw;
      if (!hadEmergencyCoverage && hasCoverageNow) {
        pushTrace({
          monthIndex,
          code: "EMERGENCY_TARGET_REACHED",
          message: "비상금 목표 수준(3개월 지출)을 충족했습니다.",
          data: {
            liquidAssets: round2(liquidAssets),
            emergencyFundTargetKrw: round2(emergencyFundTargetKrw),
          },
        });
      } else if (hadEmergencyCoverage && !hasCoverageNow) {
        pushTrace({
          monthIndex,
          code: "EMERGENCY_TARGET_DROPPED",
          message: "비상금 목표 수준 아래로 하락했습니다.",
          data: {
            liquidAssets: round2(liquidAssets),
            emergencyFundTargetKrw: round2(emergencyFundTargetKrw),
          },
        });
      }
      hadEmergencyCoverage = hasCoverageNow;
    }
    if (
      (scheduled.debug?.phasesApplied.length ?? 0) > 0
      || (scheduled.debug?.pensionsApplied.length ?? 0) > 0
      || (scheduled.debug?.contributionsApplied.length ?? 0) > 0
    ) {
      explainability.push(buildExplainabilityEntry(
        "CASHFLOW_SCHEDULE",
        month,
        [
          { driver: "income", amount: monthlyIncome, note: "Phase income + pension payout applied." },
          { driver: "expenses", amount: -expenses, note: "Phase expense schedule applied." },
          { driver: "goalFundingTransfer", amount: 0, note: "Contribution flows move cash into investment/pension assets." },
          { driver: "netCashflow", amount: operatingCashflow },
        ],
        {
          phasesApplied: scheduled.debug?.phasesApplied.join(",") ?? "",
          pensionsApplied: scheduled.debug?.pensionsApplied.join(",") ?? "",
          contributionsApplied: scheduled.debug?.contributionsApplied.join(",") ?? "",
        },
      ));
    }

    goalAllocation.newlyReachedGoalIds.forEach((goalId) => {
      const goal = goals.find((entry) => entry.id === goalId);
      if (!goal) return;
      explainability.push(buildExplainabilityEntry(
        "GOAL_REACHED",
        month,
        [
          {
            driver: "goalFundingTransfer",
            amount: goalAllocation.contributionsByGoal[goal.id] ?? 0,
            note: `Goal ${goal.name} reached target ${round2(goal.targetAmount)}.`,
          },
        ],
        {
          goalId: goal.id,
          goalName: goal.name,
          targetAmount: round2(goal.targetAmount),
          fundedAmount: round2(goal.currentAmount),
        },
      ));
    });
  }

  const goalStatus = buildGoalStatuses(goals, horizonMonths);
  if (hasLifecycleSchedule(profile)) {
    goalStatus.forEach((goal) => {
      if (!isRetirementGoal(goal.goalId, goal.name)) return;
      if (goal.targetMonth > horizonMonths || goal.targetMonth <= 0) return;
      const row = timeline[goal.targetMonth - 1];
      if (!row) return;

      const annualNetWithdrawal = Math.max(0, (row.expenses - row.income) * 12);
      const requiredNestEgg = annualNetWithdrawal <= 0 ? 0 : annualNetWithdrawal / RETIREMENT_WITHDRAWAL_RATE;
      const availableAssets = row.liquidAssets + row.investmentAssets + row.pensionAssets;
      const achieved = availableAssets + 1e-9 >= requiredNestEgg;

      goal.targetAmount = round2(requiredNestEgg);
      goal.currentAmount = round2(availableAssets);
      goal.progressPct = round2(requiredNestEgg <= 0 ? 100 : Math.max(0, (availableAssets / requiredNestEgg) * 100));
      goal.achieved = achieved;
      goal.achievedMonth = achieved ? goal.targetMonth : null;
      goal.onTrack = achieved;
      goal.shortfall = round2(Math.max(0, requiredNestEgg - availableAssets));

      explainability.push(buildExplainabilityEntry(
        "CASHFLOW_SCHEDULE",
        goal.targetMonth,
        [
          { driver: "income", amount: row.income, note: "Retirement-phase income and pension reduce required withdrawal." },
          { driver: "expenses", amount: -row.expenses, note: "Retirement-phase expenses determine required draw." },
          { driver: "netCashflow", amount: row.income - row.expenses },
        ],
        {
          goalId: goal.goalId,
          annualNetWithdrawal: round2(annualNetWithdrawal),
          requiredNestEgg: round2(requiredNestEgg),
          availableAssets: round2(availableAssets),
          withdrawalRate: RETIREMENT_WITHDRAWAL_RATE,
        },
      ));
    });
  }

  if (phaseOverlap.overlap) {
    warnings.push(buildWarning("PHASES_OVERLAP", {
      month: typeof phaseOverlap.firstMonthIndex === "number" ? phaseOverlap.firstMonthIndex + 1 : undefined,
      meta: {
        overlapPolicy: profile.cashflow?.rules?.phaseOverlapPolicy ?? "sum",
        phaseIds: phaseOverlap.phaseIds?.join(",") ?? "",
      },
    }));
  }

  if (negativeCashflowMonths > 0) {
    warnings.push(buildWarning("NEGATIVE_CASHFLOW", {
      meta: {
        months: negativeCashflowMonths,
      },
    }));
  }

  if (highDebtRatioMonths > 0) {
    warnings.push(buildWarning("HIGH_DEBT_RATIO", {
      meta: {
        months: highDebtRatioMonths,
        threshold: HIGH_DEBT_SERVICE_RATIO_THRESHOLD,
        maxDebtServiceRatio,
      },
    }));
  }

  if (debtNegativeAmortizationMonths > 0) {
    warnings.push(buildWarning("DEBT_NEGATIVE_AMORTIZATION", {
      month: firstNegativeAmortizationMonth,
      meta: {
        months: debtNegativeAmortizationMonths,
      },
    }));
  }

  if (drawdownMonths > 0) {
    warnings.push(buildWarning("EMERGENCY_FUND_DRAWDOWN", {
      meta: {
        months: drawdownMonths,
      },
    }));
  }

  if (insolvencyMonths > 0) {
    warnings.push(buildWarning("INSOLVENT", {
      meta: {
        months: insolvencyMonths,
      },
    }));
  }

  if (debtRateAssumedIds.size > 0) {
    warnings.push(buildWarning("DEBT_RATE_ASSUMED", {
      message: "APR이 없는 부채가 있어 해당 항목은 연 0% 금리 가정으로 계산했습니다.",
      meta: {
        assumedDebtIds: Array.from(debtRateAssumedIds).join(","),
      },
    }));
  }

  goalStatus.forEach((goal) => {
    if (!goal.achieved && goal.targetMonth <= horizonMonths) {
      warnings.push(buildWarning("GOAL_MISSED", {
        month: goal.targetMonth,
        meta: {
          goalId: goal.goalId,
          goalName: goal.name,
          shortfall: goal.shortfall,
        },
      }));
      pushTrace({
        monthIndex: goal.targetMonth - 1,
        code: "GOAL_MISSED",
        message: "목표 기한 내 달성하지 못했습니다.",
        data: {
          goalId: goal.goalId,
          goalName: goal.name,
          shortfall: round2(goal.shortfall),
          targetMonth: goal.targetMonth,
        },
        related: [{ kind: "goal", id: goal.goalId }],
      });

      explainability.push(buildExplainabilityEntry(
        "GOAL_MISSED",
        goal.targetMonth,
        [
          {
            driver: "goalFundingTransfer",
            amount: -goal.shortfall,
            note: `Goal ${goal.name} remains short by ${goal.shortfall}.`,
          },
        ],
        {
          goalId: goal.goalId,
          goalName: goal.name,
          shortfall: goal.shortfall,
        },
      ));
    }
  });

  if (timeline.length > 0) {
    const worst = timeline.reduce(
      (best, row, index) => (row.liquidAssets < best.liquidAssets ? { monthIndex: index, liquidAssets: row.liquidAssets } : best),
      { monthIndex: 0, liquidAssets: timeline[0].liquidAssets },
    );
    pushTrace({
      monthIndex: worst.monthIndex,
      code: "WORST_CASH_MONTH",
      message: "현금 잔고가 가장 낮았던 월입니다.",
      data: {
        liquidAssets: round2(worst.liquidAssets),
      },
    });
  }

  return {
    assumptionsUsed: {
      annualInflationRate: assumptions.annualInflationRate,
      annualExpectedReturnRate: assumptions.annualExpectedReturnRate,
      monthlyInflationRate: assumptions.monthlyInflationRate,
      monthlyExpectedReturnRate: assumptions.monthlyExpectedReturnRate,
      annualDebtRates: resolvedAnnualDebtRates,
      monthlyDebtRates: resolvedMonthlyDebtRates,
    },
    timeline,
    goalStatus,
    warnings,
    explainability,
    traces,
  };
}
