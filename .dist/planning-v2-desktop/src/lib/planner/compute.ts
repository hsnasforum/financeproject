import {
  PlannerInputError,
  type PlannerAction,
  type PlannerAssumptions,
  type PlannerDebt,
  type PlannerGoal,
  type PlannerGoalPlan,
  type PlannerInput,
  type PlannerMetricLine,
  type PlannerResult,
} from "./types";

export const DEFAULT_PLANNER_ASSUMPTIONS: PlannerAssumptions = {
  emergencyTargetMonths: 3,
  minEmergencyMonthsBeforeDebtExtra: 1,
  highInterestAprPctThreshold: 10,
  dsrWarnPct: 40,
  annualReturnPct: 0,
  applyReturnToSimulation: false,
  maxSimMonths: 600,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ceilDiv(a: number, b: number): number | null {
  if (b <= 0) return null;
  if (a <= 0) return 0;
  return Math.ceil(a / b);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function ensureNonNegativeNumber(value: unknown, field: string, issues: string[]): number {
  if (!isFiniteNumber(value)) {
    issues.push(`${field} must be a finite number`);
    return 0;
  }
  if (value < 0) {
    issues.push(`${field} must be >= 0`);
    return 0;
  }
  return value;
}

function normalizeAssumptions(input?: Partial<PlannerAssumptions>): PlannerAssumptions {
  const raw = input ?? {};
  return {
    emergencyTargetMonths: clamp(Number(raw.emergencyTargetMonths ?? DEFAULT_PLANNER_ASSUMPTIONS.emergencyTargetMonths), 0, 24),
    minEmergencyMonthsBeforeDebtExtra: clamp(Number(raw.minEmergencyMonthsBeforeDebtExtra ?? DEFAULT_PLANNER_ASSUMPTIONS.minEmergencyMonthsBeforeDebtExtra), 0, 12),
    highInterestAprPctThreshold: clamp(Number(raw.highInterestAprPctThreshold ?? DEFAULT_PLANNER_ASSUMPTIONS.highInterestAprPctThreshold), 0, 30),
    dsrWarnPct: clamp(Number(raw.dsrWarnPct ?? DEFAULT_PLANNER_ASSUMPTIONS.dsrWarnPct), 0, 100),
    annualReturnPct: clamp(Number(raw.annualReturnPct ?? DEFAULT_PLANNER_ASSUMPTIONS.annualReturnPct), 0, 15),
    applyReturnToSimulation: Boolean(raw.applyReturnToSimulation ?? DEFAULT_PLANNER_ASSUMPTIONS.applyReturnToSimulation),
    maxSimMonths: Math.trunc(clamp(Number(raw.maxSimMonths ?? DEFAULT_PLANNER_ASSUMPTIONS.maxSimMonths), 1, 600)),
  };
}

function validateInput(input: PlannerInput): void {
  const issues: string[] = [];
  ensureNonNegativeNumber(input.monthlyIncomeNet, "monthlyIncomeNet", issues);
  ensureNonNegativeNumber(input.monthlyFixedExpenses, "monthlyFixedExpenses", issues);
  ensureNonNegativeNumber(input.monthlyVariableExpenses, "monthlyVariableExpenses", issues);
  ensureNonNegativeNumber(input.liquidAssets, "liquidAssets", issues);
  ensureNonNegativeNumber(input.otherAssets ?? 0, "otherAssets", issues);

  if (!Array.isArray(input.debts)) {
    issues.push("debts must be an array");
  } else {
    input.debts.forEach((debt, index) => {
      if (!debt || typeof debt !== "object") {
        issues.push(`debts[${index}] must be an object`);
        return;
      }
      if (typeof debt.name !== "string") issues.push(`debts[${index}].name must be a string`);
      ensureNonNegativeNumber(debt.balance, `debts[${index}].balance`, issues);
      ensureNonNegativeNumber(debt.aprPct, `debts[${index}].aprPct`, issues);
      ensureNonNegativeNumber(debt.monthlyPayment, `debts[${index}].monthlyPayment`, issues);
    });
  }

  if (!Array.isArray(input.goals)) {
    issues.push("goals must be an array");
  } else {
    input.goals.forEach((goal, index) => {
      if (!goal || typeof goal !== "object") {
        issues.push(`goals[${index}] must be an object`);
        return;
      }
      if (typeof goal.name !== "string") issues.push(`goals[${index}].name must be a string`);
      ensureNonNegativeNumber(goal.targetAmount, `goals[${index}].targetAmount`, issues);
      if (goal.horizonMonths !== undefined) ensureNonNegativeNumber(goal.horizonMonths, `goals[${index}].horizonMonths`, issues);
    });
  }

  if (issues.length > 0) {
    throw new PlannerInputError("Invalid planner input", issues);
  }
}

function simulateDebtPayoffMonths(debt: PlannerDebt, extraPaymentMonthly: number, maxMonths: number): {
  months: number | null;
  principalStuck: boolean;
} {
  let balance = debt.balance;
  const monthlyRate = debt.aprPct / 100 / 12;
  if (balance <= 0) return { months: 0, principalStuck: false };

  for (let month = 1; month <= maxMonths; month += 1) {
    const interest = balance * monthlyRate;
    const principal = debt.monthlyPayment + extraPaymentMonthly - interest;
    if (principal <= 0) return { months: null, principalStuck: true };
    balance -= principal;
    if (balance <= 0) return { months: month, principalStuck: false };
  }

  return { months: null, principalStuck: false };
}

function simulateGoalMonths(targetAmount: number, monthlyContribution: number, assumptions: PlannerAssumptions): number | null {
  if (monthlyContribution <= 0) return null;
  if (!assumptions.applyReturnToSimulation) return ceilDiv(targetAmount, monthlyContribution);

  const monthlyRate = assumptions.annualReturnPct / 100 / 12;
  let value = 0;

  for (let month = 1; month <= assumptions.maxSimMonths; month += 1) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    if (value >= targetAmount) return month;
  }

  return null;
}

function buildGoalAllocations(goals: PlannerGoal[], totalMonthly: number): Map<string, number> {
  const map = new Map<string, number>();
  if (goals.length === 0 || totalMonthly <= 0) {
    goals.forEach((goal) => map.set(goal.name, 0));
    return map;
  }

  const weighted = goals.map((goal) => {
    const horizon = goal.horizonMonths && goal.horizonMonths > 0 ? goal.horizonMonths : 120;
    return { goal, weight: 1 / horizon };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

  weighted.forEach(({ goal, weight }) => {
    const allocation = totalWeight > 0 ? (totalMonthly * weight) / totalWeight : totalMonthly / goals.length;
    map.set(goal.name, allocation);
  });

  return map;
}

function metric(key: string, label: string, value: number | null, unit: PlannerMetricLine["unit"], formula: string): PlannerMetricLine {
  return { key, label, value, unit, formula };
}

const PLANNER_ACTION_LINKS = {
  emergencyRecommend: {
    href: "/recommend?purpose=emergency&kind=deposit&preferredTerm=3&liquidityPref=high&rateMode=max&pool=unified&autorun=1&save=1&go=history",
    label: "비상금 예금 추천",
  },
  savingRecommend: {
    href: "/recommend?purpose=seed-money&kind=saving&preferredTerm=12&liquidityPref=mid&rateMode=max&pool=unified&autorun=1&save=1&go=history",
    label: "목표 적금 추천",
  },
  creditLoanProducts: {
    href: "/products/credit-loan",
    label: "대출 상품 보기/비교",
  },
  gov24Benefits: {
    href: "/gov24",
    label: "지원금/혜택 찾아보기",
  },
  benefitsCashflow: {
    href: "/benefits?q=생활비&category=job&region=전국&ageBand=all&incomeBand=low-mid",
    label: "생활지원 혜택 보기",
  },
  benefitsFamily: {
    href: "/benefits?q=양육%20돌봄&category=childcare&region=전국&ageBand=30s-40s&incomeBand=all",
    label: "부양가족 혜택 보기",
  },
  benefitsHousing: {
    href: "/benefits?q=주거비&category=housing&region=전국&ageBand=all&incomeBand=all",
    label: "주거지원 혜택 보기",
  },
  subscriptionHousing: {
    href: "/housing/subscription?region=전국&mode=all&houseType=apt",
    label: "청약 공고 보기",
  },
} as const;

function buildHousingAffordHref(incomeNet: number, outflow: number): string {
  const params = new URLSearchParams();
  params.set("incomeNet", String(Math.max(0, Math.round(incomeNet))));
  params.set("outflow", String(Math.max(0, Math.round(outflow))));
  return `/housing/afford?${params.toString()}`;
}

export function computePlanner(input: PlannerInput, assumptionOverrides?: Partial<PlannerAssumptions>): PlannerResult {
  validateInput(input);

  const assumptions = normalizeAssumptions(assumptionOverrides);
  const warnings: string[] = [];
  const actions: PlannerAction[] = [];

  const monthlyExpenses = input.monthlyFixedExpenses + input.monthlyVariableExpenses;
  const monthlyDebtPayments = input.debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const monthlyOutflow = monthlyExpenses + monthlyDebtPayments;
  const monthlyFreeCashFlow = input.monthlyIncomeNet - monthlyOutflow;
  const savingsRatePct = input.monthlyIncomeNet > 0 ? (monthlyFreeCashFlow / input.monthlyIncomeNet) * 100 : null;
  const totalDebtBalance = input.debts.reduce((sum, debt) => sum + debt.balance, 0);
  const netWorth = input.liquidAssets + (input.otherAssets ?? 0) - totalDebtBalance;
  const emergencyFundMonths = monthlyExpenses > 0 ? input.liquidAssets / monthlyExpenses : null;
  const debtServiceRatioPct = input.monthlyIncomeNet > 0 ? (monthlyDebtPayments / input.monthlyIncomeNet) * 100 : null;
  const fixedExpenseRatioPct = input.monthlyIncomeNet > 0 ? (input.monthlyFixedExpenses / input.monthlyIncomeNet) * 100 : null;

  const minEmergencyTarget = assumptions.minEmergencyMonthsBeforeDebtExtra * monthlyExpenses;
  const desiredEmergencyTarget = assumptions.emergencyTargetMonths * monthlyExpenses;
  const emergencyGap = Math.max(0, desiredEmergencyTarget - input.liquidAssets);

  const highInterestDebts = input.debts
    .filter((debt) => debt.balance > 0 && debt.aprPct >= assumptions.highInterestAprPctThreshold)
    .sort((a, b) => b.aprPct - a.aprPct);
  const focusDebt = highInterestDebts[0];
  const hasHousingGoal = input.goals.some((goal) => /주택|집|내집|아파트|전세|월세|청약/.test(goal.name));

  let emergencyMonthly = 0;
  let debtExtraMonthly = 0;
  let goalsMonthly = 0;

  if (monthlyFreeCashFlow <= 0) {
    warnings.push("월 가용저축액이 0 이하입니다. 현재 현금흐름 기준으로 추가 적립/상환 여력이 제한됩니다.");
    actions.push({
      priority: "high",
      title: "현금흐름 정상화 우선",
      action: "고정비/변동비 조정 또는 소득 증대 계획을 먼저 실행하세요.",
      reason: "월 가용저축액이 0 이하이면 비상금/부채/목표 배분이 지속되기 어렵습니다.",
      numbers: { monthlyFreeCashFlow },
      links: [PLANNER_ACTION_LINKS.gov24Benefits],
    });
  } else if (input.liquidAssets < minEmergencyTarget) {
    emergencyMonthly = monthlyFreeCashFlow;
    actions.push({
      priority: "high",
      title: "최소 비상금 먼저 확보",
      action: "가용저축액을 비상금에 우선 배분하세요.",
      reason: "최소 비상금 1개월(설정값) 확보 전에는 예기치 못한 지출 대응이 어렵습니다.",
      numbers: { minEmergencyTarget, currentLiquidAssets: input.liquidAssets },
      links: [PLANNER_ACTION_LINKS.emergencyRecommend],
    });
  } else if (highInterestDebts.length > 0) {
    debtExtraMonthly = monthlyFreeCashFlow * 0.6;
    emergencyMonthly = monthlyFreeCashFlow * 0.4;
    if (emergencyGap <= 0) {
      debtExtraMonthly += emergencyMonthly;
      emergencyMonthly = 0;
    }
    actions.push({
      priority: "high",
      title: "고금리 부채+비상금 병행",
      action: "가용저축액의 약 60%는 고금리 부채 추가상환, 40%는 비상금 유지/보강에 배분합니다.",
      reason: "고금리 이자비용을 줄이면서 유동성 리스크를 동시에 관리하기 위한 규칙 기반 배분입니다.",
      numbers: { debtExtraMonthly, emergencyMonthly },
      links: [PLANNER_ACTION_LINKS.creditLoanProducts, PLANNER_ACTION_LINKS.emergencyRecommend],
    });
  } else if (input.liquidAssets < desiredEmergencyTarget) {
    emergencyMonthly = monthlyFreeCashFlow;
    actions.push({
      priority: "high",
      title: "비상금 목표까지 우선 적립",
      action: "고금리 부채가 없는 상태이므로 비상금 목표 개월수 충족을 먼저 달성합니다.",
      reason: "유동성 쿠션이 목표보다 작으면 목표 적립보다 리스크 관리가 우선됩니다.",
      numbers: { desiredEmergencyTarget, currentLiquidAssets: input.liquidAssets },
      links: [PLANNER_ACTION_LINKS.emergencyRecommend],
    });
  } else {
    goalsMonthly = monthlyFreeCashFlow;
    actions.push({
      priority: "mid",
      title: "목표 적립 집중",
      action: "비상금 목표 달성 이후 가용저축액을 목표별 적립에 집중합니다.",
      reason: "고금리 부채가 없고 비상금 목표를 충족한 구간이므로 목표 달성률 제고가 우선입니다.",
      numbers: { goalsMonthly },
      links: [PLANNER_ACTION_LINKS.savingRecommend],
    });
  }

  if (hasHousingGoal) {
    actions.push({
      priority: "mid",
      title: "주거 목표 연계 청약 탐색",
      action: "주거비 부담 계산과 청약 공고 탐색을 함께 실행해 다음 행동을 빠르게 정하세요.",
      reason: "목표명에 주거 관련 키워드가 포함되어 계산기/청약 화면으로 1클릭 연결합니다.",
      links: [
        {
          href: buildHousingAffordHref(input.monthlyIncomeNet, monthlyExpenses),
          label: "주거비 부담 계산기",
        },
        PLANNER_ACTION_LINKS.subscriptionHousing,
      ],
    });
  }

  if (emergencyFundMonths !== null && emergencyFundMonths < assumptions.emergencyTargetMonths) {
    warnings.push(`비상금 커버가 ${emergencyFundMonths.toFixed(2)}개월로 목표(${assumptions.emergencyTargetMonths}개월)보다 부족합니다.`);
  }
  if (emergencyFundMonths !== null && emergencyFundMonths < 1) {
    warnings.push("비상금 커버가 1개월 미만입니다.");
  }
  if (debtServiceRatioPct !== null && debtServiceRatioPct >= assumptions.dsrWarnPct) {
    warnings.push(`부채부담률이 ${debtServiceRatioPct.toFixed(2)}%로 경고 기준(${assumptions.dsrWarnPct}%) 이상입니다.`);
  }

  const emergencyPlan = {
    targetAmount: desiredEmergencyTarget,
    current: input.liquidAssets,
    gap: emergencyGap,
    suggestedMonthly: emergencyMonthly,
    estimatedMonths: ceilDiv(emergencyGap, emergencyMonthly),
    note:
      emergencyGap > 0
        ? "비상금은 목표 개월수 도달 전까지 우선 적립을 권장합니다."
        : "비상금 목표를 충족했습니다. 유지 구간입니다.",
  };

  let debtPayoffPrincipalStuck = false;
  const debtPayoff = focusDebt && debtExtraMonthly > 0
    ? simulateDebtPayoffMonths(focusDebt, debtExtraMonthly, assumptions.maxSimMonths)
    : { months: null, principalStuck: false };
  debtPayoffPrincipalStuck = debtPayoff.principalStuck;
  if (debtPayoffPrincipalStuck) {
    warnings.push("고금리 부채 상환 시 월 상환액이 이자보다 적어 원금이 줄지 않는 구간이 있습니다.");
  }

  const debtPlan = {
    highInterestDebts: highInterestDebts.map((debt) => debt.name || "이름 없는 부채"),
    focusDebt: focusDebt?.name,
    extraPaymentMonthly: debtExtraMonthly,
    estimatedPayoffMonths: debtPayoff.months,
    note: focusDebt
      ? "단순 월복리/고정상환 가정의 추정값이며 실제 상환 스케줄과 다를 수 있습니다."
      : "고금리 부채가 없거나 추가상환 배분이 없어 추정 상환기간을 계산하지 않았습니다.",
  };

  if (focusDebt) {
    actions.push({
      priority: "mid",
      title: `집중 상환 대상: ${focusDebt.name}`,
      action: "추가상환 여력이 생기면 우선순위 부채에 집중 배분하세요.",
      reason: `APR ${focusDebt.aprPct.toFixed(2)}%로 고금리 기준(${assumptions.highInterestAprPctThreshold}%) 이상입니다.`,
      numbers: {
        focusDebtAprPct: focusDebt.aprPct,
        focusDebtBalance: focusDebt.balance,
      },
      links: [PLANNER_ACTION_LINKS.creditLoanProducts],
    });
  }

  const goalAllocations = buildGoalAllocations(input.goals, goalsMonthly);
  const goalPlans: PlannerGoalPlan[] = input.goals.map((goal) => {
    const suggestedMonthly = goalAllocations.get(goal.name) ?? 0;
    const estimatedMonths = simulateGoalMonths(goal.targetAmount, suggestedMonthly, assumptions);
    const horizon = goal.horizonMonths;

    let note = "가정값 기반 단순 시뮬레이션 결과입니다.";
    if (suggestedMonthly <= 0) {
      note = "현재 배분된 월 적립액이 0이어서 목표 달성 시뮬레이션이 제한됩니다.";
    } else if (horizon && estimatedMonths !== null && estimatedMonths > horizon) {
      note = `현재 배분으로는 기한(${horizon}개월) 내 달성이 어려울 수 있습니다.`;
    } else if (horizon && estimatedMonths === null) {
      note = `최대 시뮬레이션 기간(${assumptions.maxSimMonths}개월) 내 도달하지 못했습니다.`;
    } else if (assumptions.applyReturnToSimulation) {
      note = `연 수익률 ${assumptions.annualReturnPct}% 가정을 적용한 추정치입니다.`;
    }

    return {
      name: goal.name,
      targetAmount: goal.targetAmount,
      horizonMonths: goal.horizonMonths,
      suggestedMonthly,
      estimatedMonths,
      note,
    };
  });

  if (goalPlans.length > 0) {
    const blockedGoals = goalPlans.filter((goal) => goal.suggestedMonthly <= 0).length;
    actions.push({
      priority: blockedGoals > 0 ? "high" : "low",
      title: "목표 적립 점검",
      action: blockedGoals > 0 ? "현금흐름 여력 확보 후 목표 적립 배분을 재설정하세요." : "목표별 월 적립 배분을 유지하며 월 1회 재평가하세요.",
      reason: blockedGoals > 0
        ? "일부 목표의 월 배분이 0으로 계산되어 현금흐름 개선이 선행되어야 합니다."
        : "현재 배분은 규칙 기반 계산 결과이며 실제 집행 상황에 따라 조정이 필요합니다.",
      numbers: { goalCount: goalPlans.length, blockedGoals },
      links: [PLANNER_ACTION_LINKS.savingRecommend],
    });
  }

  const hasDependentSignal = input.goals.some((goal) => /자녀|육아|양육|교육|돌봄|가족/.test(goal.name));
  if (monthlyFreeCashFlow <= 0 || (savingsRatePct !== null && savingsRatePct < 5)) {
    actions.push({
      priority: "mid",
      title: "소득/지출 압박 완화 지원 확인",
      action: "현재 조건에 맞는 현금성/생활비 보조 혜택을 먼저 확인하세요.",
      reason: "현금흐름 압박 구간에서는 지출 절감형 지원금 탐색이 단기 개선에 유리합니다.",
      numbers: { monthlyFreeCashFlow },
      links: [PLANNER_ACTION_LINKS.benefitsCashflow],
    });
  }

  if (hasDependentSignal) {
    actions.push({
      priority: "mid",
      title: "부양가족 지원 제도 확인",
      action: "양육/교육/돌봄 관련 혜택을 확인해 가계 고정지출을 완화하세요.",
      reason: "목표명에서 부양가족 관련 신호가 감지되어 맞춤형 혜택 탐색 우선순위를 높였습니다.",
      links: [PLANNER_ACTION_LINKS.benefitsFamily],
    });
  }

  if (fixedExpenseRatioPct !== null && fixedExpenseRatioPct >= 45) {
    actions.push({
      priority: "mid",
      title: "주거비 과다 구간 점검",
      action: "주거지원 혜택과 최근 청약 공고를 함께 확인해 주거비 리스크를 낮추세요.",
      reason: `고정비 비중이 ${fixedExpenseRatioPct.toFixed(2)}%로 높아 주거비 최적화 액션이 필요합니다.`,
      numbers: { fixedExpenseRatioPct },
      links: [PLANNER_ACTION_LINKS.benefitsHousing, PLANNER_ACTION_LINKS.subscriptionHousing],
    });
  }

  const metrics: PlannerMetricLine[] = [
    metric("monthlyExpenses", "월 지출", monthlyExpenses, "KRW", "월 지출 = 월 고정지출 + 월 변동지출"),
    metric("monthlyDebtPayments", "월 부채상환", monthlyDebtPayments, "KRW", "월 부채상환 = 각 부채의 월 상환액 합"),
    metric("monthlyFreeCashFlow", "월 가용저축액", monthlyFreeCashFlow, "KRW", "월 가용저축액 = 월 소득(세후) - (월 지출 + 월 부채상환)"),
    metric("savingsRatePct", "저축률", savingsRatePct, "PCT", "저축률(%) = 월 가용저축액 / 월 소득(세후) * 100"),
    metric("netWorth", "순자산", netWorth, "KRW", "순자산 = (현금성 자산 + 기타자산) - 총 부채잔액"),
    metric("emergencyFundMonths", "비상금 개월수", emergencyFundMonths, "MONTHS", "비상금 개월수 = 현금성 자산 / 월 지출"),
    metric("debtServiceRatioPct", "부채부담률", debtServiceRatioPct, "PCT", "부채부담률(%) = 월 부채상환 / 월 소득(세후) * 100"),
    metric("fixedExpenseRatioPct", "고정비 비중", fixedExpenseRatioPct, "PCT", "고정비 비중(%) = 월 고정지출 / 월 소득(세후) * 100"),
  ];

  return {
    metrics,
    actions: actions.slice(0, 6),
    emergencyPlan,
    debtPlan,
    goalPlans,
    warnings,
    assumptionsUsed: assumptions,
    explain: {
      notes: [
        "본 결과는 입력값과 가정값 기반의 단순 시뮬레이션이며 확정 수익/보장을 의미하지 않습니다.",
        "우선순위 배분은 규칙 기반 휴리스틱으로 계산되며 실제 금융조건/상환방식에 따라 달라질 수 있습니다.",
      ],
    },
  };
}

export function getDefaultPlannerAssumptions(): PlannerAssumptions {
  return { ...DEFAULT_PLANNER_ASSUMPTIONS };
}

export function clampPlannerAssumptions(input?: Partial<PlannerAssumptions>): PlannerAssumptions {
  return normalizeAssumptions(input);
}
