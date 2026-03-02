export type DeltaDirection = "up" | "down" | "flat";

export type ReportDeltaItem = {
  key:
    | "monthlySurplus"
    | "dsrPct"
    | "emergencyMonths"
    | "endNetWorthKrw"
    | "worstCashKrw"
    | "warningsCount";
  label: string;
  unitKind: "krw" | "pct" | "months" | "count";
  baseValue: number;
  currentValue: number;
  delta: number;
  direction: DeltaDirection;
};

type DeltaSource = {
  summaryCards?: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    totalWarnings?: number;
    warningsCount?: number;
  };
};

function asFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function computeDeltaNumber(
  curr?: number,
  base?: number,
): { delta: number; direction: DeltaDirection } | null {
  const currentValue = asFinite(curr);
  const baseValue = asFinite(base);
  if (typeof currentValue !== "number" || typeof baseValue !== "number") return null;
  const delta = currentValue - baseValue;
  if (delta > 0) return { delta, direction: "up" };
  if (delta < 0) return { delta, direction: "down" };
  return { delta: 0, direction: "flat" };
}

function toDeltaItem(
  key: ReportDeltaItem["key"],
  label: string,
  unitKind: ReportDeltaItem["unitKind"],
  currentValue: number | undefined,
  baseValue: number | undefined,
): ReportDeltaItem | null {
  const computed = computeDeltaNumber(currentValue, baseValue);
  if (!computed) return null;
  if (typeof currentValue !== "number" || typeof baseValue !== "number") return null;
  return {
    key,
    label,
    unitKind,
    baseValue,
    currentValue,
    delta: computed.delta,
    direction: computed.direction,
  };
}

export function computeReportDeltas(currVM: DeltaSource, baseVM: DeltaSource): ReportDeltaItem[] {
  const current = currVM.summaryCards ?? {};
  const baseline = baseVM.summaryCards ?? {};

  const warningCurrent = asFinite(current.totalWarnings) ?? asFinite(current.warningsCount);
  const warningBase = asFinite(baseline.totalWarnings) ?? asFinite(baseline.warningsCount);

  return [
    toDeltaItem(
      "monthlySurplus",
      "월 잉여현금",
      "krw",
      asFinite(current.monthlySurplusKrw),
      asFinite(baseline.monthlySurplusKrw),
    ),
    toDeltaItem(
      "dsrPct",
      "DSR",
      "pct",
      asFinite(current.dsrPct),
      asFinite(baseline.dsrPct),
    ),
    toDeltaItem(
      "emergencyMonths",
      "비상금(개월)",
      "months",
      asFinite(current.emergencyFundMonths),
      asFinite(baseline.emergencyFundMonths),
    ),
    toDeltaItem(
      "endNetWorthKrw",
      "말기 순자산",
      "krw",
      asFinite(current.endNetWorthKrw),
      asFinite(baseline.endNetWorthKrw),
    ),
    toDeltaItem(
      "worstCashKrw",
      "최저 현금",
      "krw",
      asFinite(current.worstCashKrw),
      asFinite(baseline.worstCashKrw),
    ),
    toDeltaItem(
      "warningsCount",
      "경고 수",
      "count",
      warningCurrent,
      warningBase,
    ),
  ].filter((item): item is ReportDeltaItem => item !== null);
}
