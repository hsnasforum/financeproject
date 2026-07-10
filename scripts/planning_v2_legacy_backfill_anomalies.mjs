function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SAFE_ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

export function createLegacyBackfillAnomalyCollector() {
  const events = [];
  return {
    events,
    record(event) {
      if (event && typeof event === "object") events.push(event);
    },
  };
}

export function summarizeLegacyBackfillAnomalies(events) {
  const summary = {
    total: 0,
    skipped: 0,
    failed: 0,
    byReason: {},
    byCandidateReason: {},
    byErrorName: {},
    byRunKind: {},
  };
  for (const event of Array.isArray(events) ? events : []) {
    const outcome = event?.outcome === "skipped" || event?.outcome === "failed"
      ? event.outcome
      : "unknown";
    const reason = asString(event?.reason) || "unknown";
    const candidateReason = asString(event?.candidateReason) || "unknown";
    const rawErrorName = asString(event?.errorName);
    const errorName = SAFE_ERROR_NAMES.has(rawErrorName) ? rawErrorName : "";
    const runKind = asString(event?.runKind) || "unknown";
    summary.total += 1;
    if (outcome === "skipped") summary.skipped += 1;
    if (outcome === "failed") summary.failed += 1;
    summary.byReason[reason] = (summary.byReason[reason] ?? 0) + 1;
    summary.byCandidateReason[candidateReason] = (summary.byCandidateReason[candidateReason] ?? 0) + 1;
    if (errorName) summary.byErrorName[errorName] = (summary.byErrorName[errorName] ?? 0) + 1;
    summary.byRunKind[runKind] = (summary.byRunKind[runKind] ?? 0) + 1;
  }
  return summary;
}
