import { type SimulationResultV2 } from "./types";

export type ScenarioDiff = {
  keyMetrics: {
    endNetWorthDeltaKrw?: number;
    worstCashMonthIndex?: number;
    worstCashDeltaKrw?: number;
    goalsAchievedDelta?: number;
  };
  warningsDelta: { added: string[]; removed: string[] };
  shortWhy: string[];
};

type WorstCash = {
  monthIndex?: number;
  value?: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtSignedPct(value: number): string {
  const rounded = round2(value);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toFixed(2)}%p`;
}

function fmtSignedKrw(value: number): string {
  const rounded = round2(value);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("ko-KR")}원`;
}

function fmtSignedCount(value: number): string {
  const rounded = round2(value);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("ko-KR")}개`;
}

function pickEndNetWorth(result: SimulationResultV2): number | undefined {
  const last = result.timeline[result.timeline.length - 1];
  if (!last) return undefined;
  return last.netWorth;
}

function pickWorstCash(result: SimulationResultV2): WorstCash {
  if (result.timeline.length === 0) return {};

  let worst = result.timeline[0];
  for (let i = 1; i < result.timeline.length; i += 1) {
    const row = result.timeline[i];
    if (row.liquidAssets < worst.liquidAssets) {
      worst = row;
    }
  }

  return {
    monthIndex: Math.max(0, worst.month - 1),
    value: worst.liquidAssets,
  };
}

function countAchievedGoals(result: SimulationResultV2): number {
  return result.goalStatus.filter((goal) => goal.achieved).length;
}

function warningCodes(result: SimulationResultV2): string[] {
  return Array.from(new Set(result.warnings.map((warning) => warning.reasonCode))).sort();
}

function diffWarningCodes(base: string[], other: string[]): { added: string[]; removed: string[] } {
  const baseSet = new Set(base);
  const otherSet = new Set(other);

  const added = other.filter((code) => !baseSet.has(code));
  const removed = base.filter((code) => !otherSet.has(code));
  return { added, removed };
}

export function diffPlanResults(base: SimulationResultV2, other: SimulationResultV2): ScenarioDiff {
  const baseEndNetWorth = pickEndNetWorth(base);
  const otherEndNetWorth = pickEndNetWorth(other);
  const endNetWorthDelta = (
    typeof baseEndNetWorth === "number" && typeof otherEndNetWorth === "number"
      ? round2(otherEndNetWorth - baseEndNetWorth)
      : undefined
  );

  const baseWorst = pickWorstCash(base);
  const otherWorst = pickWorstCash(other);
  const worstCashDelta = (
    typeof baseWorst.value === "number" && typeof otherWorst.value === "number"
      ? round2(otherWorst.value - baseWorst.value)
      : undefined
  );

  const goalsDelta = round2(countAchievedGoals(other) - countAchievedGoals(base));
  const warningsDelta = diffWarningCodes(warningCodes(base), warningCodes(other));

  const investReturnDeltaPct = round2(
    (other.assumptionsUsed.annualExpectedReturnRate - base.assumptionsUsed.annualExpectedReturnRate) * 100,
  );
  const inflationDeltaPct = round2(
    (other.assumptionsUsed.annualInflationRate - base.assumptionsUsed.annualInflationRate) * 100,
  );

  const why: string[] = [];
  why.push(
    `투자수익률 ${fmtSignedPct(investReturnDeltaPct)} 변화로 말기 순자산이 ${fmtSignedKrw(endNetWorthDelta ?? 0)} 변했습니다.`,
  );
  why.push(
    `인플레이션 ${fmtSignedPct(inflationDeltaPct)} 변화로 최저 현금월이 ${otherWorst.monthIndex ?? 0}개월차, 현금 저점은 ${fmtSignedKrw(worstCashDelta ?? 0)} 변했습니다.`,
  );

  if (goalsDelta !== 0) {
    why.push(`목표 달성 수가 기준 대비 ${fmtSignedCount(goalsDelta)} 변했습니다.`);
  } else if (warningsDelta.added.length > 0 || warningsDelta.removed.length > 0) {
    const parts: string[] = [];
    if (warningsDelta.added.length > 0) parts.push(`추가 경고: ${warningsDelta.added.join(", ")}`);
    if (warningsDelta.removed.length > 0) parts.push(`해소 경고: ${warningsDelta.removed.join(", ")}`);
    why.push(parts.join(" / "));
  } else {
    why.push("경고/목표 달성 수 변화는 크지 않았고, 주된 차이는 금리/물가 가정 변화에서 발생했습니다.");
  }

  return {
    keyMetrics: {
      endNetWorthDeltaKrw: endNetWorthDelta,
      worstCashMonthIndex: otherWorst.monthIndex,
      worstCashDeltaKrw: worstCashDelta,
      goalsAchievedDelta: goalsDelta,
    },
    warningsDelta,
    shortWhy: why.slice(0, 6),
  };
}
