import { lookupWarningGlossaryKo } from "./warningGlossary.ko";
import { type ResultDtoV1 } from "../resultDto";

export type SummarizeRunDiffArgs = {
  base: ResultDtoV1;
  compare: ResultDtoV1;
  baseLabel?: string;
  compareLabel?: string;
};

export type WhyChangedSummary = {
  headline: string;
  bullets: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatKrw(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

function normalizePct(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (typeof raw !== "number") return undefined;
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function normalizeProbability(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (typeof raw !== "number") return undefined;
  if (raw > 1 && raw <= 100) return raw / 100;
  if (raw >= 0 && raw <= 1) return raw;
  return undefined;
}

function warningCodeSet(dto: ResultDtoV1): Set<string> {
  return new Set(dto.warnings.aggregated.map((warning) => warning.code).filter((code) => code.length > 0));
}

export function summarizeRunDiff(args: SummarizeRunDiffArgs): WhyChangedSummary {
  const baseName = args.baseLabel ?? "이전 실행";
  const compareName = args.compareLabel ?? "현재 실행";
  const bullets: string[] = [];

  const baseWorstCash = asNumber(args.base.summary.worstCashKrw);
  const compareWorstCash = asNumber(args.compare.summary.worstCashKrw);
  if (typeof baseWorstCash === "number" && typeof compareWorstCash === "number") {
    const worsened = compareWorstCash < baseWorstCash;
    const crossedBelowZero = baseWorstCash > 0 && compareWorstCash <= 0;
    if (worsened || crossedBelowZero) {
      bullets.push(
        `최저 현금이 ${formatKrw(baseWorstCash)}에서 ${formatKrw(compareWorstCash)}로 ${worsened ? "악화" : "변화"}되어 ${crossedBelowZero ? "현금 바닥 구간이 생겼습니다." : "현금 여유가 줄었습니다."}`,
      );
    } else if (compareWorstCash > baseWorstCash) {
      bullets.push(`최저 현금이 ${formatKrw(baseWorstCash)}에서 ${formatKrw(compareWorstCash)}로 개선되어 단기 유동성 여유가 늘었습니다.`);
    }
  }

  const baseDsr = normalizePct(args.base.summary.dsrPct);
  const compareDsr = normalizePct(args.compare.summary.dsrPct);
  if (typeof baseDsr === "number" && typeof compareDsr === "number") {
    const delta = compareDsr - baseDsr;
    if (Math.abs(delta) >= 0.1) {
      bullets.push(
        `DSR이 ${formatPct(baseDsr)}에서 ${formatPct(compareDsr)}로 ${delta > 0 ? "상승" : "하락"}해 부채 상환 부담이 ${delta > 0 ? "커졌습니다." : "완화되었습니다."}`,
      );
    }
  }

  const baseGoals = args.base.summary.goalsAchieved;
  const compareGoals = args.compare.summary.goalsAchieved;
  if (baseGoals && compareGoals && baseGoals.total > 0 && compareGoals.total > 0) {
    const delta = compareGoals.achieved - baseGoals.achieved;
    if (delta !== 0) {
      bullets.push(
        `목표 달성 수가 ${baseGoals.achieved}/${baseGoals.total}에서 ${compareGoals.achieved}/${compareGoals.total}로 ${delta > 0 ? "증가" : "감소"}했습니다.`,
      );
    }
  }

  const baseWarnings = warningCodeSet(args.base);
  const compareWarnings = warningCodeSet(args.compare);
  const added = [...compareWarnings].filter((code) => !baseWarnings.has(code)).slice(0, 2);
  const removed = [...baseWarnings].filter((code) => !compareWarnings.has(code)).slice(0, 2);
  if (added.length > 0) {
    const labels = added.map((code) => lookupWarningGlossaryKo(code).title).join(", ");
    bullets.push(`새로 나타난 경고는 ${labels}입니다.`);
  }
  if (removed.length > 0) {
    const labels = removed.map((code) => lookupWarningGlossaryKo(code).title).join(", ");
    bullets.push(`해소된 경고는 ${labels}입니다.`);
  }

  const baseProb = normalizeProbability(asRecord(args.base.monteCarlo?.probabilities).retirementDepletionBeforeEnd);
  const compareProb = normalizeProbability(asRecord(args.compare.monteCarlo?.probabilities).retirementDepletionBeforeEnd);
  if (typeof baseProb === "number" && typeof compareProb === "number") {
    const delta = compareProb - baseProb;
    if (Math.abs(delta) >= 0.005) {
      bullets.push(
        `은퇴 전 자산 고갈 확률이 ${formatPct(baseProb * 100)}에서 ${formatPct(compareProb * 100)}로 ${delta > 0 ? "상승" : "하락"}했습니다.`,
      );
    }
  }

  if (bullets.length < 3) {
    const baseNetWorth = asNumber(args.base.summary.endNetWorthKrw);
    const compareNetWorth = asNumber(args.compare.summary.endNetWorthKrw);
    if (typeof baseNetWorth === "number" && typeof compareNetWorth === "number") {
      bullets.push(`말기 순자산이 ${formatKrw(baseNetWorth)}에서 ${formatKrw(compareNetWorth)}로 변경되었습니다.`);
    }
  }

  if (bullets.length < 3) {
    bullets.push("가정·상환·목표 입력이 함께 바뀌면 결과도 동시에 변할 수 있습니다.");
  }

  return {
    headline: `${baseName} 대비 ${compareName} 결과가 달라진 핵심 요인입니다.`,
    bullets: bullets.slice(0, 5),
  };
}
