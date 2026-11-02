import { roundToInteger } from "../../calc";

type RecordValue = Record<string, unknown>;

export type CashflowMetrics = {
  incomeKrw: number;
  livingExpenseKrw: number;
  debtPaymentKrw: number;
  operatingCashflowKrw: number;
};

export type PlanVsActual = {
  status: "ready";
  runId: string;
  createdAt: string;
  months: string[];
  plan: CashflowMetrics;
  actual: CashflowMetrics;
  delta: CashflowMetrics;
} | {
  status: "no-evidence" | "invalid-evidence" | "no-plan" | "no-post-plan-months" | "missing-plan-metrics";
};

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.trunc(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return roundToInteger(value) ?? value;
}

/** Saved timestamps are ISO instants; compare their UTC calendar month to YYYY-MM evidence. */
function runDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function hasAmbiguousLegacyStart(run: RecordValue, start: RecordValue): boolean {
  const outputs = record(run.outputs);
  const dtoRaw = record(record(outputs.resultDto).raw);
  // Retained raw rows only veto a demonstrably incomplete old projection; they never
  // supply plan values. A compact DTO without retained rows has no such evidence.
  for (const simulate of [record(outputs.simulate), record(dtoRaw.simulate)]) {
    const rows = [simulate.keyTimelinePoints, simulate.timeline, simulate.timelineSampled]
      .find((value): value is unknown[] => Array.isArray(value) && value.length > 0);
    if (!rows) continue;
    const entry = record(rows[0]);
    if (entry.monthIndex !== undefined && entry.monthIndex !== 0) continue;
    const row = entry.row !== undefined ? record(entry.row) : entry;
    if (row.month !== undefined && row.month !== 1 && entry.monthIndex === undefined) continue;
    for (const [canonical, raw] of [["incomeKrw", "income"], ["expensesKrw", "expenses"], ["debtPaymentKrw", "debtPayment"]]) {
      if (!amount(row[raw]) || (start[canonical] === 0 && row[raw] !== 0)) return true;
    }
  }
  return false;
}

/** Comparison only: no current profile values, draft patch, raw-run value fallback or writes. */
export function comparePlanVsActual(profileId: string, evidence: unknown, runs: unknown[]): PlanVsActual {
  const rows = record(evidence).ymStats;
  if (!Array.isArray(rows) || rows.length === 0) return { status: "no-evidence" };
  const months = new Set<string>();
  const observations: Array<{ ym: string; metrics: CashflowMetrics }> = [];
  for (const entry of rows) {
    const row = record(entry);
    if (typeof row.ym !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.ym) || months.has(row.ym)
      || !amount(row.incomeKrw) || !amount(row.fixedExpenseKrw)
      || !amount(row.variableExpenseKrw) || !amount(row.debtExpenseKrw)) return { status: "invalid-evidence" };
    months.add(row.ym);
    const livingExpenseKrw = Math.max(0, row.fixedExpenseKrw - row.debtExpenseKrw) + row.variableExpenseKrw;
    if (!Number.isFinite(livingExpenseKrw)) return { status: "invalid-evidence" };
    observations.push({ ym: row.ym, metrics: {
      incomeKrw: row.incomeKrw, livingExpenseKrw, debtPaymentKrw: row.debtExpenseKrw,
      operatingCashflowKrw: row.incomeKrw - livingExpenseKrw - row.debtExpenseKrw,
    } });
  }
  observations.sort((a, b) => a.ym.localeCompare(b.ym));
  const candidates = runs.map(record).map((run) => ({ run, date: runDate(run.createdAt) }))
    .filter((entry): entry is { run: RecordValue; date: string } => Boolean(
      profileId && entry.run.profileId === profileId && typeof entry.run.id === "string" && entry.run.id
      && (entry.run.overallStatus === "SUCCESS" || entry.run.overallStatus === "PARTIAL_SUCCESS")
      && record(entry.run.input).scenario == null && entry.run.scenario == null && entry.date,
    ))
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.run.id).localeCompare(String(b.run.id)));
  if (!candidates.length) return { status: "no-plan" };
  const latestMonth = observations[observations.length - 1].ym;
  const baseline = candidates.find(({ date }) => date.slice(0, 7) < latestMonth);
  if (!baseline) return { status: "no-post-plan-months" };
  const dto = record(record(baseline.run.outputs).resultDto);
  const timeline = record(dto.timeline).points;
  const start = Array.isArray(timeline) ? record(timeline.find((point) => record(point).label === "start")) : {};
  if (dto.version !== 1 || start.monthIndex !== 0 || !amount(start.incomeKrw)
    || !amount(start.expensesKrw) || !amount(start.debtPaymentKrw)
    || hasAmbiguousLegacyStart(baseline.run, start)) return { status: "missing-plan-metrics" };
  const plan: CashflowMetrics = {
    incomeKrw: start.incomeKrw, livingExpenseKrw: start.expensesKrw, debtPaymentKrw: start.debtPaymentKrw,
    operatingCashflowKrw: start.incomeKrw - start.expensesKrw - start.debtPaymentKrw,
  };
  const postPlan = observations.filter((row) => row.ym > baseline.date.slice(0, 7));
  // Medians are not additive. Compute each month's operating cashflow before its median.
  const actual = Object.fromEntries((Object.keys(plan) as Array<keyof CashflowMetrics>)
    .map((key) => [key, median(postPlan.map((row) => row.metrics[key]))])) as CashflowMetrics;
  const delta = Object.fromEntries((Object.keys(plan) as Array<keyof CashflowMetrics>)
    .map((key) => [key, actual[key] - plan[key]])) as CashflowMetrics;
  return { status: "ready", runId: String(baseline.run.id), createdAt: baseline.date,
    months: postPlan.map((row) => row.ym), plan, actual, delta };
}

/** Existing API is paginated. Never use a partially loaded history after a failed page. */
export async function loadPlanVsActualRuns(profileId: string, signal: AbortSignal, csrf = ""): Promise<unknown[]> {
  const runs: unknown[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const params = new URLSearchParams({ profileId, limit: "100", offset: String(offset) });
    if (csrf) params.set("csrf", csrf);
    const response = await fetch(`/api/planning/v2/runs?${params}`, { cache: "no-store", credentials: "same-origin", signal });
    const payload = record(await response.json());
    if (!response.ok || payload.ok !== true || !Array.isArray(payload.data)) throw new Error("run-list-failed");
    if (payload.data.length === 0) return runs;
    let added = 0;
    for (const run of payload.data) {
      const id = record(run).id;
      if (typeof id !== "string" || !id) throw new Error("invalid-run-list");
      if (!seen.has(id)) { seen.add(id); runs.push(run); added += 1; }
    }
    if (!added) throw new Error("run-list-pagination-stalled");
    // The store can omit unreadable entries, so even a short nonempty page needs a next-page read.
  }
}
