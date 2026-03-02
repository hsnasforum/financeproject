import { type ReasonCode } from "./types";

export const REASON_CODE_MESSAGES_KO: Record<ReasonCode, string> = {
  NEGATIVE_CASHFLOW: "월 고정 지출/상환 부담이 반복 소득을 초과한 구간이 있습니다.",
  HIGH_DEBT_RATIO: "월 소득 대비 부채 상환 비중이 높습니다.",
  DEBT_NEGATIVE_AMORTIZATION: "일부 부채는 납입액이 월 이자보다 작아 원금이 줄지 않을 수 있습니다.",
  DEBT_RATE_ASSUMED: "일부 부채 APR이 없어 기본 부채금리로 계산했습니다.",
  CONTRIBUTION_SKIPPED: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
  PHASES_OVERLAP: "현금흐름 phase가 겹쳐 합산 규칙(sum)으로 적용되었습니다.",
  EMERGENCY_FUND_DRAWDOWN: "현금 부족 구간에서 투자자산 인출이 발생했습니다.",
  INSOLVENT: "현금/투자 자산만으로 월 의무지출을 감당하지 못한 구간이 있습니다.",
  GOAL_MISSED: "목표월까지 목표 금액을 채우지 못한 목표가 있습니다.",
  GOAL_REACHED: "시뮬레이션 기간 내 목표 금액을 달성했습니다.",
  CASHFLOW_SCHEDULE: "현금흐름 스케줄(phase/연금/적립) 규칙이 월 결과에 반영되었습니다.",
  INFLATION_DRAG: "물가 상승 반영 지출이 계획 진척을 둔화시켰습니다.",
  RETURN_BOOST: "투자수익이 순자산 증가에 의미 있게 기여했습니다.",
  STEADY_PROGRESS: "특정 악화 요인 없이 계획이 비교적 안정적으로 진행되었습니다.",
};

export type AssumptionsHealthWarningCode =
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_STALE"
  | "SNAPSHOT_VERY_STALE"
  | "OPTIMISTIC_RETURN"
  | "OPTIMISTIC_RETURN_HIGH"
  | "RISK_ASSUMPTION_MISMATCH"
  | "RISK_ASSUMPTION_MISMATCH_LOW";

function asPercent1(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return (Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1);
}

function asDays(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.trunc(value))}`;
}

export function assumptionsHealthMessage(
  code: AssumptionsHealthWarningCode,
  data?: Record<string, unknown>,
): string {
  switch (code) {
    case "SNAPSHOT_MISSING":
      return "최신 지표 스냅샷이 없어 기본 가정으로 계산했습니다. /ops/assumptions에서 동기화를 권장합니다.";
    case "SNAPSHOT_STALE":
      return `스냅샷 기준일이 오래되었습니다(${asDays(data?.days)}일). /ops/assumptions에서 동기화를 권장합니다.`;
    case "SNAPSHOT_VERY_STALE":
      return `스냅샷 기준일이 매우 오래되었습니다(${asDays(data?.days)}일). 결과가 왜곡될 수 있습니다.`;
    case "OPTIMISTIC_RETURN":
      return `투자수익률 가정(${asPercent1(data?.investReturnPct)}%)이 높아 결과가 과대추정될 수 있습니다.`;
    case "OPTIMISTIC_RETURN_HIGH":
      return `투자수익률 가정(${asPercent1(data?.investReturnPct)}%)이 매우 높아 결과가 크게 과대추정될 수 있습니다.`;
    case "RISK_ASSUMPTION_MISMATCH":
      return `위험성향(${String(data?.riskTolerance ?? "-")}) 대비 수익률 가정(${asPercent1(data?.investReturnPct)}%) 정합성이 낮습니다.`;
    case "RISK_ASSUMPTION_MISMATCH_LOW":
      return `위험성향(${String(data?.riskTolerance ?? "-")}) 대비 수익률 가정(${asPercent1(data?.investReturnPct)}%)이 보수적입니다.`;
    default:
      return "가정 품질 경고가 발생했습니다.";
  }
}

export function debtStrategyWarningMessage(code: string): string {
  if (code === "NEGATIVE_AMORTIZATION_RISK") {
    return "최소 납입액이 월 이자를 충분히 커버하지 못할 수 있습니다.";
  }
  if (code === "DSR_HIGH_CRITICAL") {
    return "부채상환비율(DSR)이 월 소득 대비 60%를 초과합니다.";
  }
  if (code === "DSR_HIGH_WARN") {
    return "부채상환비율(DSR)이 월 소득 대비 40%를 초과합니다.";
  }
  return "부채 전략 경고가 발생했습니다.";
}
