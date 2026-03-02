export type PlanningChartPoint = {
  monthIndex: number;
  netWorthKrw: number;
  cashKrw: number;
  totalDebtKrw: number;
};

type BuildChartPointsInput = {
  timeline?: unknown;
  keyTimelinePoints?: unknown;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickFiniteNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function fromTimelineRow(entry: unknown, fallbackMonthIndex: number): PlanningChartPoint | null {
  const row = asRecord(entry);
  const monthIndex = pickFiniteNumber(row, ["month", "monthIndex"]) ?? fallbackMonthIndex;
  const netWorthKrw = pickFiniteNumber(row, ["netWorth", "netWorthKrw"]);
  const cashKrw = pickFiniteNumber(row, ["liquidAssets", "cash", "cashKrw"]);
  const totalDebtKrw = pickFiniteNumber(row, ["totalDebt", "totalDebtKrw"]);
  if (netWorthKrw === null || cashKrw === null || totalDebtKrw === null) return null;

  return { monthIndex, netWorthKrw, cashKrw, totalDebtKrw };
}

function fromKeyPoint(entry: unknown, fallbackMonthIndex: number): PlanningChartPoint | null {
  const point = asRecord(entry);
  const monthIndex = pickFiniteNumber(point, ["monthIndex", "month"]) ?? fallbackMonthIndex;
  const row = asRecord(point.row);
  const netWorthKrw = pickFiniteNumber(row, ["netWorth", "netWorthKrw"]);
  const cashKrw = pickFiniteNumber(row, ["liquidAssets", "cash", "cashKrw"]);
  const totalDebtKrw = pickFiniteNumber(row, ["totalDebt", "totalDebtKrw"]);
  if (netWorthKrw === null || cashKrw === null || totalDebtKrw === null) return null;

  return { monthIndex, netWorthKrw, cashKrw, totalDebtKrw };
}

function sortAndDedupe(points: PlanningChartPoint[]): PlanningChartPoint[] {
  const seen = new Set<number>();
  return [...points]
    .sort((a, b) => a.monthIndex - b.monthIndex)
    .filter((point) => {
      if (seen.has(point.monthIndex)) return false;
      seen.add(point.monthIndex);
      return true;
    });
}

export function buildPlanningChartPoints(input: BuildChartPointsInput): PlanningChartPoint[] {
  const timelinePoints = asArray(input.timeline)
    .map((entry, index) => fromTimelineRow(entry, index))
    .filter((entry): entry is PlanningChartPoint => entry !== null);
  if (timelinePoints.length > 0) {
    return sortAndDedupe(timelinePoints);
  }

  const keyPoints = asArray(input.keyTimelinePoints)
    .map((entry, index) => fromKeyPoint(entry, index))
    .filter((entry): entry is PlanningChartPoint => entry !== null);
  return sortAndDedupe(keyPoints);
}
