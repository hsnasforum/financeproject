import type { Observation } from "./contracts";

export type IndicatorRegime = "up" | "flat" | "down" | "unknown";

function normalizeWindow(window: number): number {
  if (!Number.isFinite(window)) return 0;
  return Math.max(0, Math.floor(window));
}

function sortObservations(observations: Observation[]): Observation[] {
  return observations
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const byDate = a.row.date.localeCompare(b.row.date);
      if (byDate !== 0) return byDate;
      return a.idx - b.idx;
    })
    .map(({ row }) => row);
}

function numericValues(observations: Observation[]): number[] {
  return sortObservations(observations)
    .map((row) => row.value)
    .filter((value) => Number.isFinite(value));
}

export function pctChange(observations: Observation[], window: number): number | null {
  const w = normalizeWindow(window);
  if (w < 1) return null;

  const values = numericValues(observations);
  if (values.length < w + 1) return null;

  const latest = values[values.length - 1];
  const baseline = values[values.length - 1 - w];
  if (baseline === 0) return null;

  return ((latest - baseline) / Math.abs(baseline)) * 100;
}

export function zscore(observations: Observation[], window: number): number | null {
  const w = normalizeWindow(window);
  if (w < 2) return null;

  const values = numericValues(observations);
  if (values.length < w) return null;

  const slice = values.slice(-w);
  const mean = slice.reduce((acc, value) => acc + value, 0) / slice.length;
  const variance = slice.reduce((acc, value) => acc + (value - mean) ** 2, 0) / slice.length;
  if (variance <= 0) return 0;

  const latest = slice[slice.length - 1];
  return (latest - mean) / Math.sqrt(variance);
}

export function trendSlope(observations: Observation[], window: number): number | null {
  const w = normalizeWindow(window);
  if (w < 2) return null;

  const values = numericValues(observations);
  if (values.length < w) return null;

  const slice = values.slice(-w);
  const xMean = (slice.length - 1) / 2;
  const yMean = slice.reduce((acc, value) => acc + value, 0) / slice.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const xDelta = i - xMean;
    numerator += xDelta * (slice[i] - yMean);
    denominator += xDelta * xDelta;
  }

  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function regime(observations: Observation[], window: number): IndicatorRegime {
  const change = pctChange(observations, window);
  const slope = trendSlope(observations, window);

  if (change === null || slope === null) return "unknown";

  const changeAbs = Math.abs(change);
  const slopeAbs = Math.abs(slope);

  if (changeAbs <= 0.5 || slopeAbs <= 1e-9) return "flat";
  if (change > 0 && slope > 0) return "up";
  if (change < 0 && slope < 0) return "down";

  return "flat";
}
