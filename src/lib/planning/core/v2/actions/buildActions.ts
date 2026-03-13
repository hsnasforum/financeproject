import { roundToDigits } from "../../../calc/roundingPolicy";
import { type AssumptionsV2 } from "../scenarios";
import { type ProfileV2, type SimulationResultV2 } from "../types";
import { type MonteCarloResult } from "../monteCarlo";
import { type ActionItemV2 } from "./types";

type BuildActionsArgs = {
  plan: SimulationResultV2;
  profile: ProfileV2;
  baseAssumptions: AssumptionsV2;
  snapshotMeta?: { asOf?: string; missing?: boolean };
  monteCarlo?: MonteCarloResult;
};

type WhyEntry = ActionItemV2["why"][number];

type GoalMiss = {
  goalId: string;
  goalName: string;
  shortfall: number;
  targetMonth: number;
};

const EMERGENCY_MONTHS_TARGET = 6;
const STANDARD_ACTION_CAUTIONS = [
  "가정 기반 결과이며 미래 성과를 보장하지 않습니다.",
  "후보 정보는 비교용이며 특정 상품 가입 권유가 아닙니다.",
];

function round2(value: number): number {
  return roundToDigits(value, 2);
}

function warningCodeSet(plan: SimulationResultV2): Set<string> {
  return new Set(plan.warnings.map((warning) => warning.reasonCode));
}

function minLiquid(plan: SimulationResultV2): { monthIndex: number; value: number } {
  if (plan.timeline.length === 0) return { monthIndex: 0, value: 0 };
  let worst = plan.timeline[0];
  for (let i = 1; i < plan.timeline.length; i += 1) {
    const row = plan.timeline[i];
    if (row.liquidAssets < worst.liquidAssets) worst = row;
  }
  return {
    monthIndex: Math.max(0, worst.month - 1),
    value: worst.liquidAssets,
  };
}

function estimateMonthlyDeficit(plan: SimulationResultV2): number {
  if (plan.timeline.length === 0) return 0;
  let worst = 0;
  for (const row of plan.timeline) {
    if (row.operatingCashflow < worst) worst = row.operatingCashflow;
  }
  return Math.abs(round2(worst));
}

function extractGoalMisses(plan: SimulationResultV2): GoalMiss[] {
  return plan.goalStatus
    .filter((goal) => !goal.achieved && goal.shortfall > 0)
    .map((goal) => ({
      goalId: goal.goalId,
      goalName: goal.name,
      shortfall: goal.shortfall,
      targetMonth: goal.targetMonth,
    }))
    .sort((a, b) => a.targetMonth - b.targetMonth);
}

function extractWhyFromWarnings(plan: SimulationResultV2, codes: string[]): WhyEntry[] {
  return plan.warnings
    .filter((warning) => codes.includes(warning.reasonCode))
    .map((warning) => ({
      code: warning.reasonCode,
      message: warning.message,
      ...(warning.meta ? { data: warning.meta } : {}),
    }));
}

function inferRetirementMiss(goalMisses: GoalMiss[]): GoalMiss | undefined {
  return goalMisses.find((goal) => /(retire|retirement|은퇴|노후)/i.test(`${goal.goalId} ${goal.goalName}`));
}

function sortActions(actions: ActionItemV2[]): ActionItemV2[] {
  const severityOrder: Record<ActionItemV2["severity"], number> = {
    critical: 0,
    warn: 1,
    info: 2,
  };
  const codeOrder: Record<ActionItemV2["code"], number> = {
    FIX_NEGATIVE_CASHFLOW: 0,
    BUILD_EMERGENCY_FUND: 1,
    REDUCE_DEBT_SERVICE: 2,
    COVER_LUMP_SUM_GOAL: 3,
    IMPROVE_RETIREMENT_PLAN: 4,
    SET_ASSUMPTIONS_REVIEW: 5,
  };

  return [...actions].sort((a, b) => {
    const s = severityOrder[a.severity] - severityOrder[b.severity];
    if (s !== 0) return s;
    return codeOrder[a.code] - codeOrder[b.code];
  });
}

function normalizeCautions(cautions: string[]): string[] {
  const merged = [...cautions, ...STANDARD_ACTION_CAUTIONS];
  const out: string[] = [];
  for (const caution of merged) {
    const text = caution.trim();
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

export function buildActionsFromPlan(args: BuildActionsArgs): ActionItemV2[] {
  const actions: ActionItemV2[] = [];
  const warningCodes = warningCodeSet(args.plan);
  const worstCash = minLiquid(args.plan);
  const monthlyDeficitKrw = estimateMonthlyDeficit(args.plan);
  const expensesMonthly = args.profile.monthlyEssentialExpenses + args.profile.monthlyDiscretionaryExpenses;
  const currentCashKrw = args.profile.liquidAssets;
  const emergencyTargetKrw = round2(expensesMonthly * EMERGENCY_MONTHS_TARGET);
  const emergencyGapKrw = round2(Math.max(0, emergencyTargetKrw - currentCashKrw));
  const goalMisses = extractGoalMisses(args.plan);
  const retirementMiss = inferRetirementMiss(goalMisses);
  const highDebtRow = args.plan.timeline.reduce((max, row) => (
    row.debtServiceRatio > max.debtServiceRatio ? row : max
  ), args.plan.timeline[0] ?? { debtServiceRatio: 0, month: 1 });

  if (warningCodes.has("NEGATIVE_CASHFLOW")) {
    actions.push({
      code: "FIX_NEGATIVE_CASHFLOW",
      severity: "critical",
      title: "월 현금흐름 적자 우선 해소",
      summary: "가용현금이 음수로 누적되어 자산 방어가 어려운 상태입니다. 지출 구조와 부채상환 조건을 먼저 조정하세요.",
      why: extractWhyFromWarnings(args.plan, ["NEGATIVE_CASHFLOW", "INSOLVENT"]).concat([
        {
          code: "METRIC_WORST_CASH",
          message: "최저 현금 시점이 확인되었습니다.",
          data: { worstCashMonthIndex: worstCash.monthIndex, worstCashKrw: worstCash.value },
        },
      ]),
      metrics: {
        monthlyDeficitKrw,
        worstCashMonthIndex: worstCash.monthIndex,
        worstCashKrw: worstCash.value,
      },
      steps: [
        "고정지출 10% 절감 시나리오를 추가로 비교합니다.",
        "월별 적자 폭이 큰 구간부터 생활비/고정비를 우선 조정합니다.",
        "부채 상환조건(금리/기간/상환방식) 재검토 항목을 체크합니다.",
      ],
      cautions: [
        "본 액션은 시뮬레이션 기반 운영 가이드입니다.",
        "상품 가입/대환 실행 전 실제 약정 조건을 확인하세요.",
      ],
    });
  }

  if (warningCodes.has("EMERGENCY_FUND_DRAWDOWN")
      || warningCodes.has("EMERGENCY_FUND_SHORT")
      || emergencyGapKrw > 0) {
    actions.push({
      code: "BUILD_EMERGENCY_FUND",
      severity: "warn",
      title: "비상금 완충 구간 확보",
      summary: "유동성 완충이 부족해 자산 인출 또는 차입으로 이어질 가능성이 있습니다. 비상금 목표를 먼저 채우세요.",
      why: extractWhyFromWarnings(args.plan, ["EMERGENCY_FUND_DRAWDOWN", "INSOLVENT"]),
      metrics: {
        emergencyTargetKrw,
        emergencyGapKrw,
        currentCashKrw,
      },
      steps: [
        "비상금 목표(기본 6개월 생활비) 달성 전까지 자동이체를 우선 배정합니다.",
        "중도 인출 비용/제약이 작은 후보를 우선 비교합니다.",
        "비상금 달성 전에는 고위험 자산 비중 확대를 보류합니다.",
      ],
      cautions: [
        "비상금은 수익률보다 접근성과 안정성을 우선합니다.",
        "확률 결과는 보장이 아니며 시장/소득 변동에 따라 달라질 수 있습니다.",
      ],
    });
  }

  if (warningCodes.has("HIGH_DEBT_RATIO") || warningCodes.has("HIGH_DEBT_SERVICE")) {
    actions.push({
      code: "REDUCE_DEBT_SERVICE",
      severity: "warn",
      title: "부채 상환부담 비율 낮추기",
      summary: "소득 대비 부채 상환부담이 높습니다. 상환부담 완화가 목표 달성 안정성에 우선합니다.",
      why: extractWhyFromWarnings(args.plan, ["HIGH_DEBT_RATIO", "DEBT_NEGATIVE_AMORTIZATION"]),
      metrics: {
        debtServiceRatio: round2(highDebtRow.debtServiceRatio),
      },
      steps: [
        "고금리/고부담 부채부터 우선 정렬해 상환 순서를 재설계합니다.",
        "상환부담 완화 가능한 조건 변경(기간/금리/구조)을 검토합니다.",
        "Debt Strategy 분석(/api/planning/v2/debt-strategy)으로 대안별 월상환/총이자를 비교합니다.",
        "월 상환액이 감소했을 때 잉여현금을 비상금/목표로 재배분합니다.",
      ],
      cautions: [
        "대환/조건변경 시 수수료 및 총이자 비용을 함께 비교하세요.",
      ],
    });
  }

  const firstMiss = goalMisses.find((goal) => !/(retire|retirement|은퇴|노후)/i.test(`${goal.goalId} ${goal.goalName}`));
  if (firstMiss) {
    actions.push({
      code: "COVER_LUMP_SUM_GOAL",
      severity: "warn",
      title: `목표자금 갭 축소: ${firstMiss.goalName}`,
      summary: "목표월 기준 부족자금이 확인되었습니다. 기간에 맞는 적립 구조로 갭을 줄이세요.",
      why: [
        ...extractWhyFromWarnings(args.plan, ["GOAL_MISSED"]),
        {
          code: "GOAL_GAP",
          message: "목표월 도달 시점 부족자금이 계산되었습니다.",
          data: {
            goalId: firstMiss.goalId,
            goalName: firstMiss.goalName,
            gapKrw: firstMiss.shortfall,
            targetMonth: firstMiss.targetMonth,
          },
        },
      ],
      metrics: {
        gapKrw: firstMiss.shortfall,
        targetMonth: firstMiss.targetMonth,
      },
      steps: [
        "목표월까지의 월 적립 필요액을 재계산하고 자동이체로 고정합니다.",
        "목표 기간과 유사한 만기 옵션 중심으로 후보를 비교합니다.",
        "목표 우선순위를 조정해 재원 배분을 단순화합니다.",
      ],
      cautions: [
        "후보 비교 결과는 선택지 제시이며 특정 상품 권유가 아닙니다.",
      ],
    });
  }

  if (retirementMiss || warningCodes.has("RETIREMENT_SHORT")) {
    actions.push({
      code: "IMPROVE_RETIREMENT_PLAN",
      severity: "warn",
      title: "은퇴자금 계획 보강",
      summary: "은퇴 시점 목표 대비 부족 가능성이 있어, 적립 속도와 리스크 가정 점검이 필요합니다.",
      why: [
        ...(retirementMiss ? [{
          code: "RETIREMENT_GOAL_GAP",
          message: "은퇴 관련 목표의 부족자금이 확인되었습니다.",
          data: {
            goalId: retirementMiss.goalId,
            gapKrw: retirementMiss.shortfall,
            targetMonth: retirementMiss.targetMonth,
          },
        }] : []),
        ...(args.monteCarlo?.probabilities.retirementDepletionBeforeEnd !== undefined ? [{
          code: "MC_DEPLETION_PROB",
          message: "Monte Carlo 기준 은퇴 전후 자산 고갈 확률이 계산되었습니다.",
          data: {
            retirementDepletionBeforeEnd: args.monteCarlo.probabilities.retirementDepletionBeforeEnd,
          },
        }] : []),
      ],
      metrics: {
        retirementGapKrw: retirementMiss?.shortfall ?? 0,
        retirementTargetMonth: retirementMiss?.targetMonth ?? 0,
      },
      steps: [
        "은퇴 목표월 전까지의 월 적립액/수익률 가정을 재조정합니다.",
        "리스크 성향별 시나리오와 Monte Carlo 퍼센타일을 함께 확인합니다.",
        "필요 시 은퇴 시점/목표금액을 현실화해 재계획합니다.",
      ],
      cautions: [
        "확률 지표는 참고값이며 미래 성과를 보장하지 않습니다.",
      ],
    });
  }

  actions.push({
    code: "SET_ASSUMPTIONS_REVIEW",
    severity: "info",
    title: "가정값 정기 점검",
    summary: args.snapshotMeta?.missing
      ? "저장된 최신 가정 스냅샷이 없어 기본값으로 계산했습니다. 가정 동기화를 권장합니다."
      : "현재 가정 스냅샷 기준으로 계산되었습니다. 월 1회 이상 가정값을 점검하세요.",
    why: [
      {
        code: "ASSUMPTIONS_BASELINE",
        message: "엔진 기본/스냅샷/오버라이드 가정이 결합되어 계산됩니다.",
        data: {
          snapshotAsOf: args.snapshotMeta?.asOf ?? null,
          snapshotMissing: Boolean(args.snapshotMeta?.missing),
          inflationPct: args.baseAssumptions.inflationPct,
          investReturnPct: args.baseAssumptions.investReturnPct,
        },
      },
    ],
    metrics: {
      inflationPct: args.baseAssumptions.inflationPct,
      investReturnPct: args.baseAssumptions.investReturnPct,
      cashReturnPct: args.baseAssumptions.cashReturnPct,
    },
    steps: [
      "스냅샷 기준일(asOf)과 현재 시장 조건의 차이를 확인합니다.",
      "가정 변경 전/후 시나리오 결과를 비교합니다.",
      "분기별로 위험성향 및 목표 우선순위를 재확인합니다.",
    ],
    cautions: [
      "가정값은 결과를 크게 바꿀 수 있으므로 변경 이력을 남기세요.",
    ],
  });

  const standardized = actions.map((action) => ({
    ...action,
    cautions: normalizeCautions(action.cautions),
  }));

  return sortActions(standardized);
}
