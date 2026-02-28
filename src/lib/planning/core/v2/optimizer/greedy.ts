import { mulberry32 } from "../random";
import { toSimulationAssumptionsV2 } from "../scenarios";
import { simulateMonthly } from "../simulateMonthly";
import { type ProfileV2, type SimulationResultV2 } from "../types";
import { type CandidatePlan, type OptimizerInput, type PlanResultV2 } from "./types";

const CONTRIBUTION_STEP_KRW = 50_000;
const DEFAULT_CANDIDATES = 20;
const DEFAULT_KEEP_TOP = 5;
const DEFAULT_MAX_MONTHLY_CONTRIBUTION_KRW = 300_000;

type StrategyCandidate = {
  investContributionKrw: number;
  extraDebtPaymentKrw: number;
  emergencyTopUpFirst: boolean;
};

type CandidateEvaluation = {
  strategy: StrategyCandidate;
  result: PlanResultV2;
  simulation: SimulationResultV2;
};

function roundMoney(value: number): number {
  return Math.round(value);
}

function clampInt(value: number, min: number, max: number): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized)) return min;
  return Math.min(max, Math.max(min, normalized));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function deepCloneProfile(profile: ProfileV2): ProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as ProfileV2;
}

function sortUniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => Math.max(0, Math.trunc(value)))))
    .sort((a, b) => a - b);
}

function buildContributionGrid(maxMonthlyContributionKrw: number): number[] {
  const maxValue = Math.max(0, Math.trunc(maxMonthlyContributionKrw));
  if (maxValue === 0) return [0];

  const values: number[] = [0];
  for (let value = CONTRIBUTION_STEP_KRW; value <= maxValue; value += CONTRIBUTION_STEP_KRW) {
    values.push(value);
  }
  if (values[values.length - 1] !== maxValue) values.push(maxValue);
  return sortUniqueNumbers(values);
}

function seededShuffle<T>(input: T[], seed?: number): T[] {
  if (!Number.isFinite(seed)) return input;
  const out = [...input];
  const rng = mulberry32(Math.trunc(seed as number) >>> 0);
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(rng() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}

function pickKeyTimelinePoints(result: SimulationResultV2): PlanResultV2["keyTimelinePoints"] {
  if (result.timeline.length === 0) return [];
  const targetIndices = [0, 12, result.timeline.length - 1];
  const seen = new Set<number>();
  const points: PlanResultV2["keyTimelinePoints"] = [];
  for (const index of targetIndices) {
    if (index < 0 || index >= result.timeline.length || seen.has(index)) continue;
    seen.add(index);
    const row = result.timeline[index];
    points.push({
      monthIndex: index,
      liquidAssetsKrw: roundMoney(row.liquidAssets),
      investmentAssetsKrw: roundMoney(row.investmentAssets),
      totalDebtKrw: roundMoney(row.totalDebt),
      netWorthKrw: roundMoney(row.netWorth),
      debtServiceRatio: row.debtServiceRatio,
    });
  }
  return points;
}

function summarizePlanResult(result: SimulationResultV2): PlanResultV2 {
  const timeline = result.timeline;
  const lastRow = timeline[timeline.length - 1];
  const worstCash = timeline.reduce(
    (best, row, index) => (row.liquidAssets < best.value ? { value: row.liquidAssets, month: index } : best),
    { value: Number.POSITIVE_INFINITY, month: 0 },
  );

  const totalInterest = timeline.reduce((sum, row) => sum + row.debtInterest, 0);
  const goalsAchieved = result.goalStatus.filter((goal) => goal.achieved).length;

  return {
    assumptionsUsed: result.assumptionsUsed,
    summary: {
      endNetWorthKrw: roundMoney(lastRow?.netWorth ?? 0),
      worstCashKrw: roundMoney(Number.isFinite(worstCash.value) ? worstCash.value : 0),
      worstCashMonthIndex: worstCash.month,
      goalsAchieved,
      totalInterestKrw: roundMoney(totalInterest),
    },
    warnings: result.warnings.map((warning) => ({
      reasonCode: warning.reasonCode,
      message: warning.message,
      ...(typeof warning.month === "number" ? { month: warning.month } : {}),
    })),
    goalsStatus: result.goalStatus,
    keyTimelinePoints: pickKeyTimelinePoints(result),
  };
}

function estimateEmergencyTopUpStartMonth(profile: ProfileV2, minEmergencyMonths: number, horizonMonths: number): number {
  const fixedExpenses = profile.cashflow?.monthlyFixedExpensesKrw ?? profile.monthlyEssentialExpenses;
  const variableExpenses = profile.cashflow?.monthlyVariableExpensesKrw ?? profile.monthlyDiscretionaryExpenses;
  const monthlyExpenses = Math.max(0, fixedExpenses + variableExpenses);
  const emergencyTarget = monthlyExpenses * Math.max(0, minEmergencyMonths);
  const currentCash = Math.max(0, profile.liquidAssets);
  const gap = Math.max(0, emergencyTarget - currentCash);
  if (gap <= 0) return 0;

  const monthlyIncome = profile.cashflow?.monthlyIncomeKrw ?? profile.monthlyIncomeNet;
  const minimumDebtPayment = profile.debts.reduce((sum, debt) => sum + Math.max(0, debt.minimumPayment), 0);
  const monthlySurplus = Math.max(0, monthlyIncome - monthlyExpenses - minimumDebtPayment);
  if (monthlySurplus <= 0) return horizonMonths;
  return Math.min(horizonMonths, Math.ceil(gap / monthlySurplus));
}

function applyStrategyToProfile(
  profile: ProfileV2,
  strategy: StrategyCandidate,
  constraints: OptimizerInput["constraints"],
  horizonMonths: number,
): ProfileV2 {
  const next = deepCloneProfile(profile);

  if (strategy.extraDebtPaymentKrw > 0 && next.debts.length > 0) {
    const positiveDebts = next.debts.filter((debt) => debt.balance > 0);
    if (positiveDebts.length > 0) {
      const totalBalance = positiveDebts.reduce((sum, debt) => sum + debt.balance, 0);
      let assigned = 0;
      for (let index = 0; index < positiveDebts.length; index += 1) {
        const debt = positiveDebts[index];
        const isLast = index === positiveDebts.length - 1;
        const extraShare = isLast
          ? strategy.extraDebtPaymentKrw - assigned
          : Math.max(0, Math.round((strategy.extraDebtPaymentKrw * debt.balance) / Math.max(1, totalBalance)));
        assigned += extraShare;
        debt.minimumPayment = Math.max(0, debt.minimumPayment) + extraShare;
      }
    }
  }

  if (strategy.investContributionKrw > 0) {
    const startMonth = strategy.emergencyTopUpFirst
      ? estimateEmergencyTopUpStartMonth(next, constraints.minEmergencyMonths, horizonMonths)
      : 0;

    if (startMonth < horizonMonths) {
      const cashflow = next.cashflow ? { ...next.cashflow } : {};
      const contributions = Array.isArray(cashflow.contributions) ? [...cashflow.contributions] : [];
      contributions.push({
        id: `optimizer-invest-${strategy.investContributionKrw}-${startMonth}`,
        title: "Optimizer Invest Contribution",
        range: {
          startMonth,
          endMonth: horizonMonths - 1,
        },
        from: "cash",
        to: "investments",
        monthlyAmountKrw: strategy.investContributionKrw,
      });
      cashflow.contributions = contributions;
      next.cashflow = cashflow;
    }
  }

  return next;
}

function meetsConstraints(
  result: SimulationResultV2,
  constraints: OptimizerInput["constraints"],
  profile: ProfileV2,
): boolean {
  if (result.timeline.length === 0) return false;

  const fixedExpenses = profile.cashflow?.monthlyFixedExpensesKrw ?? profile.monthlyEssentialExpenses;
  const variableExpenses = profile.cashflow?.monthlyVariableExpensesKrw ?? profile.monthlyDiscretionaryExpenses;
  const monthlyExpenses = Math.max(0, fixedExpenses + variableExpenses);
  const requiredEmergency = monthlyExpenses * Math.max(0, constraints.minEmergencyMonths);
  const endRow = result.timeline[result.timeline.length - 1];
  if (endRow.liquidAssets + 1e-9 < requiredEmergency) return false;

  if (typeof constraints.maxDebtServiceRatio === "number") {
    const worstDebtServiceRatio = result.timeline.reduce((max, row) => Math.max(max, row.debtServiceRatio), 0);
    if (worstDebtServiceRatio > constraints.maxDebtServiceRatio + 1e-9) return false;
  }

  if (typeof constraints.minEndCashKrw === "number") {
    if (endRow.liquidAssets + 1e-9 < constraints.minEndCashKrw) return false;
  }

  return true;
}

function makeCandidateTitle(strategy: StrategyCandidate): string {
  const segments = [
    `투자 ${strategy.investContributionKrw.toLocaleString("ko-KR")}원/월`,
    `추가상환 ${strategy.extraDebtPaymentKrw.toLocaleString("ko-KR")}원/월`,
    strategy.emergencyTopUpFirst ? "비상금 우선" : "즉시 실행",
  ];
  return segments.join(" · ");
}

function buildWhy(
  strategy: StrategyCandidate,
  baseline: PlanResultV2,
  candidate: PlanResultV2,
): string[] {
  const goalDelta = candidate.summary.goalsAchieved - baseline.summary.goalsAchieved;
  const worstCashDelta = candidate.summary.worstCashKrw - baseline.summary.worstCashKrw;
  const netWorthDelta = candidate.summary.endNetWorthKrw - baseline.summary.endNetWorthKrw;
  const interestDelta = candidate.summary.totalInterestKrw - baseline.summary.totalInterestKrw;

  const lines = [
    `전략: 투자 ${strategy.investContributionKrw.toLocaleString("ko-KR")}원/월, 추가상환 ${strategy.extraDebtPaymentKrw.toLocaleString("ko-KR")}원/월, ${strategy.emergencyTopUpFirst ? "비상금 우선 적용" : "즉시 적용"}.`,
    `목표 달성 개수 변화: ${goalDelta >= 0 ? "+" : ""}${goalDelta}.`,
    `최저 현금 변화: ${worstCashDelta >= 0 ? "+" : ""}${worstCashDelta.toLocaleString("ko-KR")}원.`,
    `말기 순자산 변화: ${netWorthDelta >= 0 ? "+" : ""}${netWorthDelta.toLocaleString("ko-KR")}원.`,
  ];
  if (strategy.extraDebtPaymentKrw > 0) {
    lines.push(`총 이자 변화: ${interestDelta >= 0 ? "+" : ""}${interestDelta.toLocaleString("ko-KR")}원.`);
  }
  return lines.slice(0, 6);
}

function buildStrategyPool(input: OptimizerInput): StrategyCandidate[] {
  const maxMonthlyContribution = clampNonNegative(
    input.knobs.maxMonthlyContributionKrw ?? DEFAULT_MAX_MONTHLY_CONTRIBUTION_KRW,
  );

  const investGrid = input.knobs.allowInvestContribution === false
    ? [0]
    : buildContributionGrid(maxMonthlyContribution);
  const debtGrid = input.knobs.allowExtraDebtPayment === false
    ? [0]
    : buildContributionGrid(maxMonthlyContribution);

  const pool: StrategyCandidate[] = [];
  for (const invest of investGrid) {
    for (const extraDebt of debtGrid) {
      if (invest + extraDebt > maxMonthlyContribution) continue;
      const emergencyModes = invest > 0 ? [false, true] : [false];
      for (const emergencyTopUpFirst of emergencyModes) {
        pool.push({
          investContributionKrw: invest,
          extraDebtPaymentKrw: extraDebt,
          emergencyTopUpFirst,
        });
      }
    }
  }

  const seeded = seededShuffle(pool, input.search.seed);
  const limit = clampInt(input.search.candidates || DEFAULT_CANDIDATES, 1, Math.max(1, seeded.length));
  return seeded.slice(0, limit);
}

export function generateCandidatePlans(input: OptimizerInput): CandidatePlan[] {
  const normalizedInput: OptimizerInput = {
    ...input,
    constraints: {
      minEmergencyMonths: Math.max(0, Math.trunc(input.constraints.minEmergencyMonths)),
      ...(typeof input.constraints.maxDebtServiceRatio === "number"
        ? { maxDebtServiceRatio: clampNonNegative(input.constraints.maxDebtServiceRatio) }
        : {}),
      ...(typeof input.constraints.minEndCashKrw === "number"
        ? { minEndCashKrw: clampNonNegative(input.constraints.minEndCashKrw) }
        : {}),
    },
    knobs: {
      ...input.knobs,
      ...(typeof input.knobs.maxMonthlyContributionKrw === "number"
        ? { maxMonthlyContributionKrw: clampNonNegative(input.knobs.maxMonthlyContributionKrw) }
        : {}),
    },
    search: {
      candidates: clampInt(input.search.candidates || DEFAULT_CANDIDATES, 1, 200),
      keepTop: clampInt(input.search.keepTop || DEFAULT_KEEP_TOP, 1, 5),
      ...(typeof input.search.seed === "number" ? { seed: input.search.seed } : {}),
    },
  };

  const baselineSimulation = simulateMonthly(
    normalizedInput.profile,
    toSimulationAssumptionsV2(normalizedInput.baseAssumptions),
    normalizedInput.horizonMonths,
  );
  const baselineResult = summarizePlanResult(baselineSimulation);
  const pool = buildStrategyPool(normalizedInput);

  const evaluated: CandidateEvaluation[] = [];
  for (const strategy of pool) {
    const profiled = applyStrategyToProfile(
      normalizedInput.profile,
      strategy,
      normalizedInput.constraints,
      normalizedInput.horizonMonths,
    );
    const simulation = simulateMonthly(
      profiled,
      toSimulationAssumptionsV2(normalizedInput.baseAssumptions),
      normalizedInput.horizonMonths,
    );
    if (!meetsConstraints(simulation, normalizedInput.constraints, normalizedInput.profile)) {
      continue;
    }
    evaluated.push({
      strategy,
      simulation,
      result: summarizePlanResult(simulation),
    });
  }

  const sorted = evaluated.sort((a, b) => {
    if (b.result.summary.goalsAchieved !== a.result.summary.goalsAchieved) {
      return b.result.summary.goalsAchieved - a.result.summary.goalsAchieved;
    }
    if (b.result.summary.worstCashKrw !== a.result.summary.worstCashKrw) {
      return b.result.summary.worstCashKrw - a.result.summary.worstCashKrw;
    }
    if (b.result.summary.endNetWorthKrw !== a.result.summary.endNetWorthKrw) {
      return b.result.summary.endNetWorthKrw - a.result.summary.endNetWorthKrw;
    }
    if (a.result.summary.totalInterestKrw !== b.result.summary.totalInterestKrw) {
      return a.result.summary.totalInterestKrw - b.result.summary.totalInterestKrw;
    }
    if (a.strategy.investContributionKrw !== b.strategy.investContributionKrw) {
      return a.strategy.investContributionKrw - b.strategy.investContributionKrw;
    }
    if (a.strategy.extraDebtPaymentKrw !== b.strategy.extraDebtPaymentKrw) {
      return a.strategy.extraDebtPaymentKrw - b.strategy.extraDebtPaymentKrw;
    }
    return Number(a.strategy.emergencyTopUpFirst) - Number(b.strategy.emergencyTopUpFirst);
  });

  const keepTop = clampInt(normalizedInput.search.keepTop, 1, 5);
  return sorted.slice(0, keepTop).map((entry) => ({
    id: `opt-i${entry.strategy.investContributionKrw}-d${entry.strategy.extraDebtPaymentKrw}-e${entry.strategy.emergencyTopUpFirst ? 1 : 0}`,
    title: makeCandidateTitle(entry.strategy),
    strategy: {
      ...(entry.strategy.investContributionKrw > 0 ? { investContributionKrw: entry.strategy.investContributionKrw } : {}),
      ...(entry.strategy.extraDebtPaymentKrw > 0 ? { extraDebtPaymentKrw: entry.strategy.extraDebtPaymentKrw } : {}),
      emergencyTopUpFirst: entry.strategy.emergencyTopUpFirst,
    },
    result: entry.result,
    score: {
      goalsAchieved: entry.result.summary.goalsAchieved,
      worstCashKrw: entry.result.summary.worstCashKrw,
      endNetWorthKrw: entry.result.summary.endNetWorthKrw,
      totalInterestKrw: entry.result.summary.totalInterestKrw,
    },
    why: buildWhy(entry.strategy, baselineResult, entry.result),
    cautions: [
      "실험 모드 결과이며 자동 권장안이 아닙니다.",
      "가정/제약 입력에 따라 후보 순위가 달라질 수 있습니다.",
      "후보 값은 검토 후 수동으로 적용하세요.",
    ],
  }));
}
