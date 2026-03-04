import { type BurstGrade, type BurstRationale, type TopicDailyStat } from "./contracts";

type ComputeBurstInput = {
  today: Pick<TopicDailyStat, "count">;
  last7: Array<Pick<TopicDailyStat, "count">>;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toCount(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function computeBurst(input: ComputeBurstInput): {
  grade: BurstGrade;
  rationale: BurstRationale;
} {
  const todayCount = toCount(input.today.count);
  const history = input.last7.map((row) => toCount(row.count));
  const historyDays = history.length;
  const baselineAvg = historyDays > 0
    ? history.reduce((sum, value) => sum + value, 0) / historyDays
    : 0;
  const safeBaseline = baselineAvg <= 0 ? 1 : baselineAvg;
  const ratio = todayCount / safeBaseline;
  const delta = todayCount - Math.round(baselineAvg);

  const rationale: BurstRationale = {
    historyDays,
    baselineAvg: round3(baselineAvg),
    todayCount,
    ratio: round3(ratio),
    delta,
  };

  if (historyDays < 7) {
    return { grade: "Unknown", rationale };
  }

  if (baselineAvg <= 0) {
    if (todayCount >= 3) return { grade: "High", rationale };
    if (todayCount >= 1) return { grade: "Med", rationale };
    return { grade: "Low", rationale };
  }

  if (ratio >= 1.8 || delta >= 4) return { grade: "High", rationale };
  if (ratio >= 1.4 || delta >= 2) return { grade: "Med", rationale };
  return { grade: "Low", rationale };
}

