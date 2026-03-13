import {
  buildPlanningWizardOutput,
  type PlanningWizardOutput,
} from "./planningOnboardingWizard";

export type PlanningQuickStartDraft = {
  monthlyIncomeNet?: number;
  fixedExpense?: number;
  goalName?: string;
  goalTargetAmount?: number;
  goalTargetMonth?: number;
};

export type PlanningQuickStartPreview = {
  monthlyIncomeNet: number;
  fixedExpense: number;
  monthlySurplus: number;
  targetMonthlyContribution: number;
  goalName: string;
  goalTargetAmount: number;
  goalTargetMonth: number;
  caution: string;
  quickRuleStatus: PlanningQuickRuleStatus;
  defaultNotes: string[];
};

export type PlanningQuickRuleStatusTone = "danger" | "warning" | "success";

export type PlanningQuickRuleStatus = {
  label: string;
  detail: string;
  tone: PlanningQuickRuleStatusTone;
};

function normalizeNonNegative(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

export function resolvePlanningQuickRuleStatus(input: {
  monthlyIncomeNet?: number;
  fixedExpense?: number;
  monthlySurplus?: number;
}): PlanningQuickRuleStatus {
  const monthlyIncomeNet = Math.max(0, normalizeNonNegative(input.monthlyIncomeNet) ?? 0);
  const fixedExpense = Math.max(0, normalizeNonNegative(input.fixedExpense) ?? 0);
  const monthlySurplus = typeof input.monthlySurplus === "number" && Number.isFinite(input.monthlySurplus)
    ? input.monthlySurplus
    : monthlyIncomeNet - fixedExpense;
  const fixedExpenseShare = monthlyIncomeNet > 0 ? fixedExpense / monthlyIncomeNet : 1;

  if (monthlyIncomeNet <= 0) {
    return {
      label: "기준 확인 필요",
      detail: "실수령과 고정지출 입력이 있어야 quick rules 상태를 안정적으로 읽을 수 있습니다.",
      tone: "warning",
    };
  }

  if (fixedExpenseShare >= 0.65) {
    return {
      label: "고정의무 압박",
      detail: "월 실수령 대비 고정지출 비중이 커서 먼저 줄일 항목을 확인하는 편이 안전합니다.",
      tone: "danger",
    };
  }

  if (monthlySurplus <= Math.max(monthlyIncomeNet * 0.15, 300_000)) {
    return {
      label: "생활비 압박",
      detail: "고정지출을 뺀 뒤 남는 돈이 적어 목표 적립과 여유예산을 함께 담기 빡빡한 상태입니다.",
      tone: "warning",
    };
  }

  return {
    label: "배분 가능",
    detail: "고정지출을 뺀 뒤 남는 돈이 있어 비상금, 목표, 여유예산을 나눠 보는 출발점으로 쓸 수 있습니다.",
    tone: "success",
  };
}

export function isPlanningQuickStartReady(draft: PlanningQuickStartDraft): boolean {
  const goalName = draft.goalName?.trim() ?? "";
  return Boolean(
    normalizeNonNegative(draft.monthlyIncomeNet) && normalizeNonNegative(draft.fixedExpense) !== undefined
      && goalName
      && normalizeNonNegative(draft.goalTargetAmount)
      && normalizeNonNegative(draft.goalTargetMonth),
  );
}

export function buildPlanningQuickStartOutput(
  draft: PlanningQuickStartDraft,
  options?: { appliedAt?: string },
): PlanningWizardOutput {
  return buildPlanningWizardOutput({
    monthlyIncomeNet: normalizeNonNegative(draft.monthlyIncomeNet),
    monthlyEssentialExpenses: normalizeNonNegative(draft.fixedExpense),
    goals: [
      {
        name: draft.goalName?.trim() || "목표 1",
        targetAmount: normalizeNonNegative(draft.goalTargetAmount),
        targetMonth: normalizeNonNegative(draft.goalTargetMonth),
      },
    ],
  }, options);
}

export function buildPlanningQuickStartPreview(
  draft: PlanningQuickStartDraft,
): PlanningQuickStartPreview {
  const output = buildPlanningQuickStartOutput(draft);
  const profile = output.profile;
  const goal = profile.goals[0];
  const monthlySurplus = profile.monthlyIncomeNet
    - profile.monthlyEssentialExpenses
    - profile.monthlyDiscretionaryExpenses;
  const remainingGoalAmount = Math.max(0, (goal?.targetAmount ?? 0) - (goal?.currentAmount ?? 0));
  const goalTargetMonth = Math.max(1, goal?.targetMonth ?? 1);
  const targetMonthlyContribution = Math.ceil(remainingGoalAmount / goalTargetMonth);

  let caution = "";
  if (monthlySurplus < 0) {
    caution = "지금 입력 기준으로는 월 고정지출이 수입을 넘습니다. 적용 뒤 지출이나 목표 기간을 먼저 조정하세요.";
  } else if (targetMonthlyContribution > monthlySurplus) {
    caution = "현재 목표를 그대로 두면 매달 남는 돈보다 목표 적립액이 더 큽니다. 적용 뒤 목표 금액이나 기간을 조정할 수 있습니다.";
  }

  return {
    monthlyIncomeNet: profile.monthlyIncomeNet,
    fixedExpense: profile.monthlyEssentialExpenses,
    monthlySurplus,
    targetMonthlyContribution,
    goalName: draft.goalName?.trim() || goal?.name || "목표 1",
    goalTargetAmount: goal?.targetAmount ?? 0,
    goalTargetMonth,
    caution,
    quickRuleStatus: resolvePlanningQuickRuleStatus({
      monthlyIncomeNet: profile.monthlyIncomeNet,
      fixedExpense: profile.monthlyEssentialExpenses,
      monthlySurplus,
    }),
    defaultNotes: [
      "선택지출은 0원으로 시작합니다.",
      "현금성·투자자산은 기본값 0원으로 둡니다.",
      "부채가 없으면 빈 상태로 시작하고, 적용 뒤 아래에서 바로 수정할 수 있습니다.",
    ],
  };
}
