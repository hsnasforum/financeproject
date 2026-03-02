export type GoalRow = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  shortfall: number;
  targetMonth: number;
  achieved: boolean;
  achievedMonth?: number;
  comment: string;
};

type GoalStatusLike = {
  name?: unknown;
  targetAmount?: unknown;
  currentAmount?: unknown;
  shortfall?: unknown;
  targetMonth?: unknown;
  achieved?: unknown;
  achievedMonth?: unknown;
  onTrack?: unknown;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveShortfall(goal: GoalStatusLike): number {
  const shortfall = asNumber(goal.shortfall);
  if (typeof shortfall === "number") return Math.max(0, shortfall);
  const targetAmount = asNumber(goal.targetAmount) ?? 0;
  const currentAmount = asNumber(goal.currentAmount) ?? 0;
  return Math.max(0, targetAmount - currentAmount);
}

function resolveComment(goal: GoalStatusLike, shortfall: number, achieved: boolean): string {
  if (achieved) return "달성";
  if (goal.onTrack === true) return "진행 중(달성 가능)";
  if (shortfall > 0) return "부족액 존재";
  return "진행 중";
}

export function mapGoals(goalsStatus: unknown): GoalRow[] {
  const rows = Array.isArray(goalsStatus) ? goalsStatus : [];
  return rows.map((entry, index) => {
    const goal = asRecord(entry) as GoalStatusLike;
    const targetAmount = asNumber(goal.targetAmount) ?? 0;
    const currentAmount = asNumber(goal.currentAmount) ?? 0;
    const shortfall = resolveShortfall(goal);
    const targetMonth = Math.max(0, Math.trunc(asNumber(goal.targetMonth) ?? 0));
    const achieved = goal.achieved === true;
    const achievedMonthRaw = asNumber(goal.achievedMonth);
    const achievedMonth = typeof achievedMonthRaw === "number" ? Math.max(0, Math.trunc(achievedMonthRaw)) : undefined;
    return {
      name: asString(goal.name) || `목표 ${index + 1}`,
      targetAmount,
      currentAmount,
      shortfall,
      targetMonth,
      achieved,
      ...(typeof achievedMonth === "number" ? { achievedMonth } : {}),
      comment: resolveComment(goal, shortfall, achieved),
    };
  }).sort((a, b) => {
    const aMonth = a.targetMonth > 0 ? a.targetMonth : Number.POSITIVE_INFINITY;
    const bMonth = b.targetMonth > 0 ? b.targetMonth : Number.POSITIVE_INFINITY;
    if (aMonth !== bMonth) return aMonth - bMonth;
    return a.name.localeCompare(b.name);
  });
}
