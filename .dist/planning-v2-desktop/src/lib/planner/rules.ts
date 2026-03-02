import { type PlannerInput, type PlannerMetrics } from "@/lib/planner/metrics";

export type Recommendation = {
  id: string;
  category: "지출" | "비상금" | "부채" | "투자" | "보험" | "노후" | "목표";
  priority: "P0" | "P1" | "P2";
  title: string;
  rationale: string[];
  actions: Array<{ label: string; href?: string }>;
  assumptions?: string[];
  caution?: string;
  triggeredBy: string[];
};

const PRIORITY_ORDER: Record<Recommendation["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

export function buildRecommendations(input: PlannerInput, metrics: PlannerMetrics): Recommendation[] {
  const recs: Recommendation[] = [];

  if (metrics.freeCashflow < 0) {
    recs.push({
      id: "R_EXP_01",
      category: "지출",
      priority: "P0",
      title: "월 현금흐름을 우선 흑자로 전환하세요",
      rationale: [
        "월 가용 현금흐름이 음수이면 장기 계획 전에 현금 유출을 줄이는 조정이 필요합니다.",
        `현재 가용 현금흐름: ${Math.round(metrics.freeCashflow).toLocaleString()} (${input.unit === "MANWON" ? "원 환산" : "원"})`,
      ],
      actions: [
        { label: "고정비 3개 항목 점검(통신/구독/보험)" },
        { label: "변동지출 상한 설정 후 2주 추적" },
      ],
      assumptions: ["다음 점검일까지 소득이 동일하다고 가정"],
      caution: "계산 결과는 가정 기반이며 개인 상황에 따라 달라질 수 있습니다.",
      triggeredBy: ["R_EXP_01: freeCashflow < 0"],
    });
  }

  if (metrics.emergencyMonths < input.emergencyTargetMonths) {
    recs.push({
      id: "R_EMG_01",
      category: "비상금",
      priority: "P0",
      title: "비상금 목표를 먼저 채우세요",
      rationale: [
        `현재 비상금 커버 ${metrics.emergencyMonths.toFixed(1)}개월, 목표 ${input.emergencyTargetMonths}개월입니다.`,
        `부족분은 ${Math.round(metrics.emergencyGap).toLocaleString()}원입니다.`,
      ],
      actions: [
        { label: "비상금 전용 계좌 분리" },
        { label: "예금/적금 후보 탐색", href: "/products/deposit" },
        { label: "적금 후보 탐색", href: "/products/saving" },
      ],
      assumptions: ["예상치 못한 추가지출이 없다고 가정"],
      caution: "비상금은 투자성 자산보다 우선 확보가 일반적으로 권장됩니다.",
      triggeredBy: ["R_EMG_01: emergencyMonths < targetMonths"],
    });
  }

  if (!metrics.debtPayoffFeasible) {
    recs.push({
      id: "R_DEBT_01",
      category: "부채",
      priority: "P0",
      title: "현재 상환액으로 원금 감소가 어려워 상환전략 재설계가 필요합니다",
      rationale: [
        metrics.debtPayoffWarning ?? "월 상환액이 이자부담을 충분히 상회하지 못합니다.",
        "상환액 증액 또는 금리 재점검을 먼저 진행해야 목표적립 계획이 유지됩니다.",
      ],
      actions: [
        { label: "월 상환액 재산정" },
        { label: "대출 상품 비교(추후 연동)" },
      ],
      assumptions: ["부채 금리가 유지된다고 가정"],
      caution: "대출 전환/추가 대출 여부는 실제 조건 확인 후 결정해야 합니다.",
      triggeredBy: ["R_DEBT_01: debtPayoffFeasible = false"],
    });
  }

  if (input.debtRateAnnual >= 7 || metrics.debtPaymentRatio >= 0.2) {
    recs.push({
      id: "R_DEBT_02",
      category: "부채",
      priority: "P1",
      title: "부채 부담이 높아 상환 우선순위를 상향하세요",
      rationale: [
        `부채 연이율 ${input.debtRateAnnual.toFixed(1)}%, 부채부담률 ${(metrics.debtPaymentRatio * 100).toFixed(1)}% 입니다.`,
        "고금리 또는 높은 상환비중은 장기 자산형성을 지연시킬 수 있습니다.",
      ],
      actions: [{ label: "상환 스케줄 재점검" }, { label: "추천 페이지에서 저축 대안 확인", href: "/recommend" }],
      assumptions: ["소득 구조가 단기간 크게 변하지 않는다고 가정"],
      caution: "갈아타기 전 중도상환수수료 등 부대비용을 확인하세요.",
      triggeredBy: ["R_DEBT_02: debtRateAnnual>=7 or debtPaymentRatio>=0.2"],
    });
  }

  if (!metrics.goalFeasible) {
    recs.push({
      id: "R_GOAL_01",
      category: "목표",
      priority: "P1",
      title: "목표 달성 조건을 조정하세요",
      rationale: [
        `목표기한 내 필요 월적립액은 ${Math.round(metrics.goalRequiredMonthly).toLocaleString()}원입니다.`,
        `현재 월저축액은 ${Math.round(metrics.monthlySaving).toLocaleString()}원으로 부족분이 있습니다.`,
      ],
      actions: [
        { label: "목표기한/목표금액 재설정" },
        { label: "추가 월저축 가능액 찾기" },
      ],
      assumptions: [
        `가정 연수익률 ${input.assumedAnnualReturn.toFixed(1)}%, 가정 물가상승률 ${input.assumedInflationRate.toFixed(1)}%`,
      ],
      caution: "목표는 가정 기반 계산이며 실제 시장/소득 변화에 따라 달라질 수 있습니다.",
      triggeredBy: ["R_GOAL_01: requiredMonthly > monthlySaving"],
    });
  }

  if (metrics.emergencyMonths >= input.emergencyTargetMonths && input.debtRateAnnual < 7 && metrics.monthlySaving > 0) {
    const allocationHint =
      input.riskProfile === "aggressive"
        ? "공격형 예시: 안전자산 30 / 위험자산 70"
        : input.riskProfile === "balanced"
          ? "중립형 예시: 안전자산 50 / 위험자산 50"
          : "안정형 예시: 안전자산 70 / 위험자산 30";

    recs.push({
      id: "R_INV_01",
      category: "투자",
      priority: "P2",
      title: "여유자금 기반 자산배분 초안을 검토하세요",
      rationale: [
        "비상금 목표를 충족했고 고금리 부채 부담이 낮아 자산배분 검토 단계로 이동할 수 있습니다.",
        allocationHint,
      ],
      actions: [{ label: "추천 페이지에서 상품 대안 보기", href: "/recommend" }, { label: "월 자동이체 규칙 설정" }],
      assumptions: ["위험성향은 자기평가 기준이며 정기적으로 재평가 필요"],
      caution: "투자 결과는 시장 변동에 따라 달라지며 확정 수익이 아닙니다.",
      triggeredBy: ["R_INV_01: emergency ok + no high debt + monthlySaving>0"],
    });
  }

  if (input.insuranceStatus === "unknown" || input.insuranceStatus === "none") {
    recs.push({
      id: "R_INS_01",
      category: "보험",
      priority: "P2",
      title: "보험 현황 체크리스트를 먼저 작성하세요",
      rationale: [
        "보험 상태가 미확인/미보장으로 입력되어 위험관리 공백 가능성이 있습니다.",
        "보험은 확정 진단이 아닌 기본 보장 체크리스트 수준으로 점검하는 것이 안전합니다.",
      ],
      actions: [{ label: "실손·상해·소득보장 유무 체크" }, { label: "중복보장 및 보험료 비중 점검" }],
      caution: "의료/보험 진단은 전문가 상담을 통해 최종 판단하세요.",
      triggeredBy: ["R_INS_01: insuranceStatus in [unknown, none]"],
    });
  }

  if (input.retirementAssets <= 0) {
    recs.push({
      id: "R_RET_01",
      category: "노후",
      priority: "P2",
      title: "노후자산 현황부터 수치화하세요",
      rationale: [
        "입력된 노후자산이 없어서 장기 준비 상태를 판단하기 어렵습니다.",
        "연금저축/IRP는 일반 정보 수준에서 후보를 점검하고, 세부 조건은 별도 확인이 필요합니다.",
      ],
      actions: [{ label: "노후 계좌 현황 정리" }, { label: "연금저축 후보 조사(추후 API 연동)" }],
      caution: "세제/상품 조건은 개인 상황에 따라 달라지므로 확정 안내가 아닙니다.",
      triggeredBy: ["R_RET_01: retirementAssets <= 0"],
    });
  }

  return recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
