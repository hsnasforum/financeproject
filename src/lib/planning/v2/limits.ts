export const LIMITS = {
  warningsTop: 10,
  actionsTop: 5,
  goalsTop: 10,
  timelinePoints: 3,
  tracesTop: 50,
  reportWarningsTop: 10,
} as const;

export const RAW_TIMELINE_SAMPLE_STEP_MONTHS = 12;

export function takeTop<T>(rows: T[], limit: number): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.slice(0, Math.max(0, Math.trunc(limit)));
}

export function sampleByStride<T>(rows: T[], stride: number): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const step = Math.max(1, Math.trunc(stride));
  const sampled: T[] = [];
  for (let index = 0; index < rows.length; index += step) {
    sampled.push(rows[index]);
  }
  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}
