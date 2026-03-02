function sanitizePerfName(name: string): string {
  return name.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function safeMark(name: string): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  try {
    const safeName = sanitizePerfName(name);
    if (!safeName) return;
    performance.mark(safeName);
  } catch {
    // ignore perf instrumentation failures
  }
}

export function safeMeasure(name: string, startMark: string, endMark: string): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  try {
    const safeName = sanitizePerfName(name);
    const safeStartMark = sanitizePerfName(startMark);
    const safeEndMark = sanitizePerfName(endMark);
    if (!safeName || !safeStartMark || !safeEndMark) return;

    const starts = performance.getEntriesByName(safeStartMark, "mark");
    const ends = performance.getEntriesByName(safeEndMark, "mark");
    if (starts.length === 0 || ends.length === 0) return;

    const startEntry = starts[starts.length - 1];
    const endEntry = ends[ends.length - 1];
    if (!(Number.isFinite(startEntry.startTime) && Number.isFinite(endEntry.startTime))) return;
    if (endEntry.startTime < startEntry.startTime) return;

    performance.measure(safeName, safeStartMark, safeEndMark);
  } catch {
    // ignore perf instrumentation failures
  }
}
