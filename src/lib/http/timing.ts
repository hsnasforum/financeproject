export type TimingEntry = {
  label: string;
  elapsedMs: number;
};

export async function withTiming<T>(label: string, fn: () => Promise<T>): Promise<{ value: T; timing: TimingEntry }> {
  const startedAt = Date.now();
  const value = await fn();
  return {
    value,
    timing: {
      label,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    },
  };
}

export function pushTiming(
  timings: TimingEntry[],
  timing: TimingEntry,
): void {
  timings.push(timing);
}

export function timingsToDebugMap(timings: TimingEntry[]): Record<string, { elapsedMs: number }> {
  return Object.fromEntries(
    timings.map((timing) => [timing.label, { elapsedMs: timing.elapsedMs }]),
  );
}
