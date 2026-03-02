import { type PlanResultV2 } from "./types";

export type PlanningQuestion =
  | "WHY_GOAL_MISSED"
  | "WHY_CASH_LOW"
  | "WHY_DEBT_RISKY"
  | "WHAT_ASSUMPTIONS_MATTER";

function uniqCodes(codes: string[]): string[] {
  return Array.from(new Set(codes.filter((code) => code.trim().length > 0))).sort();
}

function toMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function findWorstCash(plan: PlanResultV2): { monthIndex: number; liquidAssets: number } | null {
  if (!Array.isArray(plan.timeline) || plan.timeline.length === 0) return null;
  return plan.timeline.reduce(
    (best, row, index) => (row.liquidAssets < best.liquidAssets ? { monthIndex: index, liquidAssets: row.liquidAssets } : best),
    { monthIndex: 0, liquidAssets: plan.timeline[0].liquidAssets },
  );
}

function buildGoalMissedAnswer(plan: PlanResultV2) {
  const goalMissWarnings = plan.warnings.filter((warning) => warning.reasonCode === "GOAL_MISSED");
  const missedGoals = plan.goalStatus.filter((goal) => !goal.achieved && goal.targetMonth <= plan.timeline.length);
  const largestShortfall = [...missedGoals].sort((a, b) => b.shortfall - a.shortfall)[0];

  const bullets = [
    goalMissWarnings.length > 0
      ? `기한 내 미달 경고가 ${goalMissWarnings.length}건 관측되었습니다.`
      : "현재 결과에서는 목표 미달 경고가 뚜렷하지 않습니다.",
    largestShortfall
      ? `${largestShortfall.name}의 추정 미달액은 ${toMoney(largestShortfall.shortfall)}로 계산됩니다.`
      : "미달 목표의 구체적 shortfall 데이터는 제한적입니다.",
    "월 가용 현금과 부채 상환 우선순위에 따라 목표 적립 여력이 줄었을 수 있습니다.",
    "이 결과는 입력 가정 기반 계산치이며, 지출/수익률 가정 변화에 민감할 수 있습니다.",
  ];

  const evidenceCodes = uniqCodes([
    ...goalMissWarnings.map((warning) => warning.reasonCode),
    ...((plan.traces ?? []).filter((trace) => trace.code === "GOAL_MISSED").map((trace) => trace.code)),
  ]);

  return {
    title: "왜 목표가 미달인가?",
    bullets: bullets.slice(0, 7),
    evidenceCodes,
  };
}

function buildCashLowAnswer(plan: PlanResultV2) {
  const worst = findWorstCash(plan);
  const lowCashWarnings = plan.warnings.filter((warning) =>
    warning.reasonCode === "NEGATIVE_CASHFLOW"
    || warning.reasonCode === "EMERGENCY_FUND_DRAWDOWN"
    || warning.reasonCode === "INSOLVENT");
  const contributionSkipped = (plan.traces ?? []).filter((trace) => trace.code === "CONTRIBUTION_SKIPPED");

  const bullets = [
    worst
      ? `최저 현금 시점은 ${worst.monthIndex + 1}개월차이며 잔고는 ${toMoney(worst.liquidAssets)}입니다.`
      : "현금 추이 데이터가 충분하지 않아 최저 시점을 특정하기 어렵습니다.",
    lowCashWarnings.length > 0
      ? `현금 관련 경고(${lowCashWarnings.map((warning) => warning.reasonCode).join(", ")})가 관측되었습니다.`
      : "현금 관련 경고는 제한적으로 관측되었습니다.",
    contributionSkipped.length > 0
      ? `현금 부족으로 적립이 스킵된 이벤트가 ${contributionSkipped.length}회 기록되었습니다.`
      : "적립 스킵 이벤트는 명확히 관측되지 않았습니다.",
    "고정지출/부채상환/적립 우선순위 조합이 현금 변동성을 키웠을 가능성이 있습니다.",
  ];

  const evidenceCodes = uniqCodes([
    ...lowCashWarnings.map((warning) => warning.reasonCode),
    ...((plan.traces ?? [])
      .filter((trace) =>
        trace.code === "WORST_CASH_MONTH"
        || trace.code === "CONTRIBUTION_SKIPPED"
        || trace.code === "EMERGENCY_TARGET_DROPPED")
      .map((trace) => trace.code)),
  ]);

  return {
    title: "왜 현금이 이렇게 부족해졌나?",
    bullets: bullets.slice(0, 7),
    evidenceCodes,
  };
}

function buildDebtRiskAnswer(plan: PlanResultV2) {
  const debtWarnings = plan.warnings.filter((warning) =>
    warning.reasonCode === "HIGH_DEBT_RATIO"
    || warning.reasonCode === "DEBT_NEGATIVE_AMORTIZATION");

  const debtTrace = (plan.traces ?? []).filter((trace) => trace.code === "DEBT_REPAYMENT_MONTH");
  const latestDebt = plan.timeline.length > 0 ? plan.timeline[plan.timeline.length - 1].totalDebt : 0;

  const bullets = [
    debtWarnings.length > 0
      ? `부채 리스크 경고(${debtWarnings.map((warning) => warning.reasonCode).join(", ")})가 감지되었습니다.`
      : "부채 리스크 경고는 명확하지 않습니다.",
    `시뮬레이션 종료 시 총부채는 ${toMoney(latestDebt)}입니다.`,
    debtTrace.length > 0
      ? `부채 상환 추적 이벤트 ${debtTrace.length}건 기준으로 이자/원금 분해가 기록되었습니다.`
      : "부채 상환 추적 이벤트가 적어 상세 분해 근거가 제한적입니다.",
    "상환액 대비 소득 비중(DSR)과 이자 누적이 위험도를 높였을 수 있습니다.",
  ];

  const evidenceCodes = uniqCodes([
    ...debtWarnings.map((warning) => warning.reasonCode),
    ...debtTrace.map((trace) => trace.code),
  ]);

  return {
    title: "왜 부채가 위험한가?",
    bullets: bullets.slice(0, 7),
    evidenceCodes,
  };
}

function buildAssumptionsMatterAnswer(plan: PlanResultV2) {
  const driverMagnitudes = new Map<string, number>();
  for (const entry of plan.explainability ?? []) {
    for (const item of entry.why ?? []) {
      const current = driverMagnitudes.get(item.driver) ?? 0;
      driverMagnitudes.set(item.driver, current + Math.abs(item.amount));
    }
  }

  const topDrivers = [...driverMagnitudes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([driver]) => driver);

  const inflation = plan.assumptionsUsed.annualInflationRate * 100;
  const expectedReturn = plan.assumptionsUsed.annualExpectedReturnRate * 100;

  const bullets = [
    `현재 가정은 연 인플레이션 ${inflation.toFixed(1)}%, 연 기대수익률 ${expectedReturn.toFixed(1)}% 기준입니다.`,
    topDrivers.length > 0
      ? `설명가능성 집계에서 영향도가 큰 드라이버는 ${topDrivers.join(", ")} 순으로 나타났습니다.`
      : "설명가능성 집계에서 두드러진 드라이버를 특정하기 어렵습니다.",
    "특히 인플레이션/수익률 가정 변화는 지출 증가 속도와 자산 성장률에 함께 영향을 줄 수 있습니다.",
    "따라서 결과 해석 시 가정값 민감도(시나리오/Monte Carlo)를 함께 확인하는 것이 안전합니다.",
  ];

  const evidenceCodes = uniqCodes([
    ...plan.warnings.map((warning) => warning.reasonCode),
    ...(plan.traces ?? []).map((trace) => trace.code),
  ]);

  return {
    title: "어떤 가정이 결과에 제일 민감했나?",
    bullets: bullets.slice(0, 7),
    evidenceCodes,
  };
}

export function answerQuestion(
  q: PlanningQuestion,
  plan: PlanResultV2,
): { title: string; bullets: string[]; evidenceCodes: string[] } {
  if (q === "WHY_GOAL_MISSED") return buildGoalMissedAnswer(plan);
  if (q === "WHY_CASH_LOW") return buildCashLowAnswer(plan);
  if (q === "WHY_DEBT_RISKY") return buildDebtRiskAnswer(plan);
  return buildAssumptionsMatterAnswer(plan);
}
