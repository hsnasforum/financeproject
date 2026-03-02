import { type CashflowPhaseV2, type ProfileV2 } from "./types";

type ComputeOptions = {
  horizonMonths?: number;
};

export type MonthlyCashflowBreakdown = {
  incomeKrw: number;
  fixedExpensesKrw: number;
  variableExpensesKrw: number;
  pensionIncomeKrw: number;
  contributionKrw: { toInvest: number; toPension: number };
  debug?: {
    phasesApplied: string[];
    pensionsApplied: string[];
    contributionsApplied: string[];
  };
};

function normalizePctInput(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const raw = value as number;
  return Math.abs(raw) <= 1 ? raw : raw / 100;
}

function growthFactor(pctYoY: number | undefined, elapsedMonths: number): number {
  const normalized = normalizePctInput(pctYoY);
  if (!Number.isFinite(normalized) || normalized === 0) return 1;
  const t = Math.max(0, elapsedMonths);
  return Math.pow(1 + normalized, t / 12);
}

function isRangeValidForHorizon(startMonth: number, endMonth: number, horizonMonths?: number): boolean {
  if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth)) return false;
  if (startMonth < 0 || endMonth < startMonth) return false;
  if (typeof horizonMonths === "number" && Number.isFinite(horizonMonths)) {
    return endMonth < horizonMonths;
  }
  return true;
}

function isMonthInRange(monthIndex: number, startMonth: number, endMonth: number): boolean {
  return monthIndex >= startMonth && monthIndex <= endMonth;
}

function hasCashflowCollections(profile: ProfileV2): boolean {
  return Boolean(
    profile.cashflow
    && ((profile.cashflow.phases?.length ?? 0) > 0
      || (profile.cashflow.pensions?.length ?? 0) > 0
      || (profile.cashflow.contributions?.length ?? 0) > 0),
  );
}

function applyPhaseGrowth(
  phase: CashflowPhaseV2,
  monthIndex: number,
  income: number,
  fixedExpenses: number,
  variableExpenses: number,
): {
  income: number;
  fixedExpenses: number;
  variableExpenses: number;
} {
  const elapsedMonths = Math.max(0, monthIndex - phase.range.startMonth);
  const incomeFactor = growthFactor(phase.incomeGrowthPctYoY, elapsedMonths);
  const expenseFactor = growthFactor(phase.expenseGrowthExtraPctYoY, elapsedMonths);

  return {
    income: income * incomeFactor,
    fixedExpenses: fixedExpenses * expenseFactor,
    variableExpenses: variableExpenses * expenseFactor,
  };
}

export function hasPhaseOverlap(
  profile: ProfileV2,
  horizonMonths?: number,
): {
  overlap: boolean;
  firstMonthIndex?: number;
  phaseIds?: string[];
} {
  const phases = profile.cashflow?.phases ?? [];
  const policy = profile.cashflow?.rules?.phaseOverlapPolicy ?? "sum";
  if (policy !== "sum" || phases.length < 2) {
    return { overlap: false };
  }

  const valid = phases.filter((phase) => (
    isRangeValidForHorizon(phase.range.startMonth, phase.range.endMonth, horizonMonths)
  ));
  if (valid.length < 2) return { overlap: false };

  const sorted = [...valid].sort((a, b) => {
    if (a.range.startMonth !== b.range.startMonth) return a.range.startMonth - b.range.startMonth;
    if (a.range.endMonth !== b.range.endMonth) return a.range.endMonth - b.range.endMonth;
    return a.id.localeCompare(b.id);
  });

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.range.startMonth <= prev.range.endMonth) {
      return {
        overlap: true,
        firstMonthIndex: next.range.startMonth,
        phaseIds: [prev.id, next.id],
      };
    }
  }

  return { overlap: false };
}

export function computeMonthlyCashflow(
  profile: ProfileV2,
  monthIndex: number,
  _inflationIndex: number,
  options?: ComputeOptions,
): MonthlyCashflowBreakdown {
  const baseIncome = profile.cashflow?.monthlyIncomeKrw ?? profile.monthlyIncomeNet;
  const baseFixedExpenses = profile.cashflow?.monthlyFixedExpensesKrw ?? profile.monthlyEssentialExpenses;
  const baseVariableExpenses = profile.cashflow?.monthlyVariableExpensesKrw ?? profile.monthlyDiscretionaryExpenses;

  let incomeKrw = baseIncome;
  let fixedExpensesKrw = baseFixedExpenses;
  let variableExpensesKrw = baseVariableExpenses;

  const phasesApplied: string[] = [];
  const pensionsApplied: string[] = [];
  const contributionsApplied: string[] = [];

  const phases = profile.cashflow?.phases ?? [];
  const policy = profile.cashflow?.rules?.phaseOverlapPolicy ?? "sum";
  const activePhases = phases
    .filter((phase) => isRangeValidForHorizon(phase.range.startMonth, phase.range.endMonth, options?.horizonMonths))
    .map((phase, index) => ({ phase, index }))
    .filter((entry) => isMonthInRange(monthIndex, entry.phase.range.startMonth, entry.phase.range.endMonth));

  if (activePhases.length > 0) {
    phasesApplied.push(...activePhases.map((entry) => entry.phase.id));
    if (policy === "override") {
      const selected = [...activePhases].sort((a, b) => {
        if (a.phase.range.startMonth !== b.phase.range.startMonth) return b.phase.range.startMonth - a.phase.range.startMonth;
        return b.index - a.index;
      })[0]?.phase;

      if (selected) {
        const grown = applyPhaseGrowth(
          selected,
          monthIndex,
          selected.monthlyIncomeKrw ?? baseIncome,
          selected.monthlyFixedExpensesKrw ?? baseFixedExpenses,
          selected.monthlyVariableExpensesKrw ?? baseVariableExpenses,
        );
        incomeKrw = grown.income;
        fixedExpensesKrw = grown.fixedExpenses;
        variableExpensesKrw = grown.variableExpenses;
      }
    } else {
      let incomeSum = 0;
      let fixedSum = 0;
      let variableSum = 0;
      for (const entry of activePhases) {
        const grown = applyPhaseGrowth(
          entry.phase,
          monthIndex,
          entry.phase.monthlyIncomeKrw ?? 0,
          entry.phase.monthlyFixedExpensesKrw ?? 0,
          entry.phase.monthlyVariableExpensesKrw ?? 0,
        );
        incomeSum += grown.income;
        fixedSum += grown.fixedExpenses;
        variableSum += grown.variableExpenses;
      }
      incomeKrw = incomeSum;
      fixedExpensesKrw = fixedSum;
      variableExpensesKrw = variableSum;
    }
  } else if (hasCashflowCollections(profile)) {
    incomeKrw = 0;
    fixedExpensesKrw = 0;
    variableExpensesKrw = 0;
  }

  let pensionIncomeKrw = 0;
  for (const flow of profile.cashflow?.pensions ?? []) {
    if (!isRangeValidForHorizon(flow.range.startMonth, flow.range.endMonth, options?.horizonMonths)) continue;
    if (!isMonthInRange(monthIndex, flow.range.startMonth, flow.range.endMonth)) continue;
    pensionIncomeKrw += flow.monthlyPayoutKrw;
    pensionsApplied.push(flow.id);
  }

  let contributionToInvest = 0;
  let contributionToPension = 0;
  for (const flow of profile.cashflow?.contributions ?? []) {
    if (!isRangeValidForHorizon(flow.range.startMonth, flow.range.endMonth, options?.horizonMonths)) continue;
    if (!isMonthInRange(monthIndex, flow.range.startMonth, flow.range.endMonth)) continue;
    if (flow.to === "investments") contributionToInvest += flow.monthlyAmountKrw;
    if (flow.to === "pension") contributionToPension += flow.monthlyAmountKrw;
    contributionsApplied.push(flow.id);
  }

  return {
    incomeKrw: Math.max(0, incomeKrw),
    fixedExpensesKrw: Math.max(0, fixedExpensesKrw),
    variableExpensesKrw: Math.max(0, variableExpensesKrw),
    pensionIncomeKrw: Math.max(0, pensionIncomeKrw),
    contributionKrw: {
      toInvest: Math.max(0, contributionToInvest),
      toPension: Math.max(0, contributionToPension),
    },
    debug: {
      phasesApplied,
      pensionsApplied,
      contributionsApplied,
    },
  };
}
