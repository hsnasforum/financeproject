import type { FinancialStatus, StageDecision } from "./types";
import { roundKrw } from "../calc/roundingPolicy";

function formatWon(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(roundKrw(value));
}

export function buildStageDecision(status: FinancialStatus): StageDecision {
  const { stage, trace } = status;

  switch (stage) {
    case "DEFICIT":
      return {
        priority: "CUT_SPENDING",
        investmentAllowed: false,
        warnings: [
          `월 ${formatWon(Math.abs(trace.savingCapacity))}원 적자 상태입니다.`,
          "투자보다 지출 조정과 현금흐름 복구가 우선입니다.",
        ],
      };

    case "DEBT":
      return {
        priority: "PAY_DEBT",
        investmentAllowed: false,
        warnings: [
          `상환 대상 부채가 ${formatWon(trace.debtBalance)}원 있습니다.`,
          "투자 확대보다 부채 정리가 우선입니다.",
        ],
      };

    case "EMERGENCY":
      return {
        priority: "BUILD_EMERGENCY_FUND",
        investmentAllowed: false,
        warnings: [
          `비상금이 ${formatWon(trace.emergencyFundGap)}원 부족합니다.`,
          "투자 전 비상금 확보가 우선입니다.",
        ],
      };

    case "INVEST":
      return {
        priority: "INVEST",
        investmentAllowed: trace.savingCapacity > 0,
        warnings:
          trace.savingCapacity > 0
            ? []
            : ["투자 가능한 월 잉여현금이 없어 추가 적립은 어렵습니다."],
      };
  }
}
