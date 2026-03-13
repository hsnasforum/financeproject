export type TimelineRow = {
  label: "시작" | "중간" | "마지막";
  monthIndex: number;
  income: number;
  expenses: number;
  debtPayment: number;
  operatingCashflow: number;
  cash: number;
  netWorth: number;
  totalDebt: number;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeTimelineRows(timeline: unknown): Array<{ monthIndex: number; row: Record<string, unknown> }> {
  const rows = Array.isArray(timeline) ? timeline : [];
  return rows.map((entry, index) => {
    const record = asRecord(entry);
    const nestedRow = asRecord(record.row);
    const monthIndex = Math.max(0, Math.trunc(asNumber(record.monthIndex) ?? index));
    return {
      monthIndex,
      row: Object.keys(nestedRow).length > 0 ? nestedRow : record,
    };
  });
}

function toTimelineRow(label: TimelineRow["label"], monthIndex: number, row: Record<string, unknown>): TimelineRow {
  return {
    label,
    monthIndex,
    income: asNumber(row.income) ?? 0,
    expenses: asNumber(row.expenses) ?? 0,
    debtPayment: asNumber(row.debtPayment) ?? 0,
    operatingCashflow: asNumber(row.operatingCashflow) ?? 0,
    cash: asNumber(row.cash) ?? asNumber(row.liquidAssets) ?? 0,
    netWorth: asNumber(row.netWorth) ?? 0,
    totalDebt: asNumber(row.totalDebt) ?? 0,
  };
}

export function pickTimelinePoints(timeline: unknown): TimelineRow[] {
  const normalized = normalizeTimelineRows(timeline);
  if (normalized.length === 0) return [];

  const lastIndex = normalized.length - 1;
  const midIndex = Math.trunc(lastIndex / 2);
  const candidates = [
    { label: "시작" as const, index: 0 },
    { label: "중간" as const, index: midIndex },
    { label: "마지막" as const, index: lastIndex },
  ];

  const seen = new Set<number>();
  const points: TimelineRow[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.index)) continue;
    seen.add(candidate.index);
    const item = normalized[candidate.index];
    points.push(toTimelineRow(candidate.label, item.monthIndex, item.row));
  }
  return points;
}
