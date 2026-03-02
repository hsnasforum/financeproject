import { type ActionItemV2 } from "./actions/types";
import { LIMITS, RAW_TIMELINE_SAMPLE_STEP_MONTHS, sampleByStride, takeTop } from "./limits";
import { aggregateWarnings, type AggregatedWarning, type WarningV2 } from "./report/aggregateWarnings";
import { mapGoals } from "./report/mapGoals";
import { pickTimelinePoints } from "./report/pickTimelinePoints";

type SnapshotMeta = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing?: boolean;
  warningsCount?: number;
  sourcesCount?: number;
};

type HealthMeta = {
  warningsCodes?: string[];
  criticalCount?: number;
  snapshotStaleDays?: number;
};

type CacheMeta = {
  hit?: boolean;
  keyPrefix?: string;
};

export type ResultDtoV1 = {
  version: 1;
  meta: {
    generatedAt: string;
    snapshot: SnapshotMeta;
    health?: HealthMeta;
    cache?: CacheMeta;
    policyId?: string;
  };
  summary: {
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    worstCashMonthIndex?: number;
    goalsAchieved?: { achieved: number; total: number };
    dsrPct?: number;
    criticalWarnings?: number;
    totalWarnings?: number;
  };
  warnings: {
    aggregated: Array<{
      code: string;
      severity: string;
      count: number;
      firstMonth?: number;
      lastMonth?: number;
      sampleMessage?: string;
    }>;
    top?: Array<{ code: string; severity: string; message: string }>;
  };
  goals: Array<{
    id: string;
    title: string;
    type: string;
    targetKrw?: number;
    currentKrw?: number;
    shortfallKrw?: number;
    targetMonth?: number;
    achieved?: boolean;
    comment?: string;
  }>;
  timeline: {
    points: Array<{
      label: "start" | "mid" | "end";
      monthIndex: number;
      incomeKrw?: number;
      expensesKrw?: number;
      debtPaymentKrw?: number;
      cashKrw?: number;
      netWorthKrw?: number;
      totalDebtKrw?: number;
    }>;
  };
  actions?: { items: ActionItemV2[]; top3: ActionItemV2[]; top: ActionItemV2[] };
  scenarios?: { table: unknown; shortWhy: string[] };
  monteCarlo?: { probabilities: unknown; percentiles: unknown; notes: string[] };
  debt?: { dsrPct?: number; summaries?: unknown; refinance?: unknown; whatIf?: unknown; cautions?: string[] };
  raw?: { simulate?: unknown; scenarios?: unknown; monteCarlo?: unknown; actions?: unknown; debt?: unknown };
};

type BuildResultDtoV1Input = {
  generatedAt?: string;
  policyId?: string;
  meta?: {
    snapshot?: unknown;
    health?: unknown;
    cache?: unknown;
  };
  simulate?: unknown;
  scenarios?: unknown;
  monteCarlo?: unknown;
  actions?: unknown;
  debt?: unknown;
};

type RunLike = {
  createdAt?: string;
  input?: { policyId?: unknown };
  meta?: {
    snapshot?: unknown;
    health?: unknown;
    cache?: unknown;
  };
  outputs?: {
    simulate?: unknown;
    scenarios?: unknown;
    monteCarlo?: unknown;
    actions?: unknown;
    debtStrategy?: unknown;
    resultDto?: unknown;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundTo(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizePct(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (typeof raw !== "number") return undefined;
  const pct = Math.abs(raw) <= 1 ? raw * 100 : raw;
  return roundTo(pct, 4);
}

function normalizeSnapshotMeta(value: unknown): SnapshotMeta {
  const row = asRecord(value);
  return {
    ...(asString(row.id) ? { id: asString(row.id) } : {}),
    ...(asString(row.asOf) ? { asOf: asString(row.asOf) } : {}),
    ...(asString(row.fetchedAt) ? { fetchedAt: asString(row.fetchedAt) } : {}),
    ...(row.missing === true ? { missing: true } : {}),
    ...(typeof asNumber(row.warningsCount) === "number" ? { warningsCount: asNumber(row.warningsCount) } : {}),
    ...(typeof asNumber(row.sourcesCount) === "number" ? { sourcesCount: asNumber(row.sourcesCount) } : {}),
  };
}

function normalizeHealthMeta(value: unknown): HealthMeta | undefined {
  const row = asRecord(value);
  if (Object.keys(row).length === 0) return undefined;
  return {
    ...(Array.isArray(row.warningsCodes) ? { warningsCodes: row.warningsCodes.map((code) => asString(code)).filter((code) => code.length > 0) } : {}),
    ...(typeof asNumber(row.criticalCount) === "number" ? { criticalCount: Math.max(0, Math.trunc(asNumber(row.criticalCount) ?? 0)) } : {}),
    ...(typeof asNumber(row.snapshotStaleDays) === "number" ? { snapshotStaleDays: Math.max(0, Math.trunc(asNumber(row.snapshotStaleDays) ?? 0)) } : {}),
  };
}

function normalizeCacheMeta(value: unknown): CacheMeta | undefined {
  const row = asRecord(value);
  if (Object.keys(row).length === 0) return undefined;
  return {
    ...(typeof row.hit === "boolean" ? { hit: row.hit } : {}),
    ...(asString(row.keyPrefix) ? { keyPrefix: asString(row.keyPrefix) } : {}),
  };
}

function normalizeWarningList(value: unknown): WarningV2[] {
  return asArray(value).map((entry) => {
    if (typeof entry === "string") {
      return {
        reasonCode: entry,
        message: `${entry} 경고가 감지되었습니다.`,
      };
    }
    const row = asRecord(entry);
    const code = asString(row.reasonCode) || asString(row.code) || "UNKNOWN";
    return {
      reasonCode: code,
      ...(asString(row.message) ? { message: asString(row.message) } : { message: `${code} 경고가 감지되었습니다.` }),
      ...(typeof asNumber(row.month) === "number" ? { month: asNumber(row.month) } : {}),
      ...(asString(row.severity) ? { severity: asString(row.severity) } : {}),
      ...(row.meta !== undefined ? { meta: row.meta } : {}),
      ...(row.data !== undefined ? { data: row.data } : {}),
    };
  });
}

function pickGoalRows(simulate: Record<string, unknown>): unknown[] {
  if (Array.isArray(simulate.goalStatus)) return simulate.goalStatus;
  if (Array.isArray(simulate.goalsStatus)) return simulate.goalsStatus;
  return [];
}

function buildGoalsDto(rawGoalRows: unknown[]): ResultDtoV1["goals"] {
  const mapped = mapGoals(rawGoalRows);
  return mapped.map((goal, index) => {
    const raw = asRecord(rawGoalRows[index]);
    const goalId = asString(raw.goalId) || asString(raw.id) || `goal-${index + 1}`;
    const lowered = `${goalId} ${goal.name}`.toLowerCase();
    const type = lowered.includes("emergency") || lowered.includes("비상")
      ? "emergencyFund"
      : lowered.includes("retire") || lowered.includes("은퇴")
        ? "retirement"
        : "lumpSum";
    return {
      id: goalId,
      title: goal.name,
      type,
      ...(typeof goal.targetAmount === "number" ? { targetKrw: goal.targetAmount } : {}),
      ...(typeof goal.currentAmount === "number" ? { currentKrw: goal.currentAmount } : {}),
      ...(typeof goal.shortfall === "number" ? { shortfallKrw: goal.shortfall } : {}),
      ...(typeof goal.targetMonth === "number" && goal.targetMonth > 0 ? { targetMonth: goal.targetMonth } : {}),
      achieved: goal.achieved,
      ...(goal.comment ? { comment: goal.comment } : {}),
    };
  }).slice(0, LIMITS.goalsTop);
}

function buildTimelinePoints(simulate: Record<string, unknown>): ResultDtoV1["timeline"]["points"] {
  const source = Array.isArray(simulate.keyTimelinePoints) && simulate.keyTimelinePoints.length > 0
    ? simulate.keyTimelinePoints
    : simulate.timeline;
  const rows = pickTimelinePoints(source);
  return rows.map((row) => ({
    label: row.label === "시작" ? "start" : row.label === "중간" ? "mid" : "end",
    monthIndex: row.monthIndex,
    ...(typeof row.income === "number" ? { incomeKrw: row.income } : {}),
    ...(typeof row.expenses === "number" ? { expensesKrw: row.expenses } : {}),
    ...(typeof row.debtPayment === "number" ? { debtPaymentKrw: row.debtPayment } : {}),
    ...(typeof row.cash === "number" ? { cashKrw: row.cash } : {}),
    ...(typeof row.netWorth === "number" ? { netWorthKrw: row.netWorth } : {}),
    ...(typeof row.totalDebt === "number" ? { totalDebtKrw: row.totalDebt } : {}),
  })).slice(0, LIMITS.timelinePoints);
}

function buildSimulationSummary(simulate: Record<string, unknown>, goals: ResultDtoV1["goals"]): {
  endNetWorthKrw?: number;
  worstCashKrw?: number;
  worstCashMonthIndex?: number;
  goalsAchieved?: { achieved: number; total: number };
  dsrPct?: number;
} {
  const summary = asRecord(simulate.summary);
  const timeline = asArray(simulate.timeline).map((entry) => asRecord(entry));
  const timelineLast = timeline.length > 0 ? timeline[timeline.length - 1] : {};

  let worstCash = Number.POSITIVE_INFINITY;
  let worstCashMonthIndex = 0;
  timeline.forEach((row, index) => {
    const cash = asNumber(row.liquidAssets) ?? asNumber(row.cash) ?? 0;
    if (cash < worstCash) {
      worstCash = cash;
      worstCashMonthIndex = Math.max(0, Math.trunc(asNumber(row.month) ?? index + 1) - 1);
    }
  });

  const achieved = goals.filter((goal) => goal.achieved).length;
  const total = goals.length;
  const goalsAchievedCount = asNumber(summary.goalsAchievedCount);
  const goalsMissedCount = asNumber(summary.goalsMissedCount);
  const explicitGoalsTotal = typeof goalsAchievedCount === "number" || typeof goalsMissedCount === "number"
    ? Math.max(0, Math.trunc(goalsAchievedCount ?? 0)) + Math.max(0, Math.trunc(goalsMissedCount ?? 0))
    : total;

  const dsrRaw = asNumber(summary.maxDebtServiceRatio);
  const dsrPct = normalizePct(dsrRaw);

  return {
    ...(typeof asNumber(summary.endNetWorthKrw) === "number"
      ? { endNetWorthKrw: asNumber(summary.endNetWorthKrw) }
      : (typeof asNumber(summary.endNetWorth) === "number"
        ? { endNetWorthKrw: asNumber(summary.endNetWorth) }
        : (typeof asNumber(timelineLast.netWorth) === "number" ? { endNetWorthKrw: asNumber(timelineLast.netWorth) } : {}))),
    ...(typeof asNumber(summary.worstCashKrw) === "number"
      ? { worstCashKrw: asNumber(summary.worstCashKrw) }
      : (Number.isFinite(worstCash) ? { worstCashKrw: worstCash } : {})),
    ...(typeof asNumber(summary.worstCashMonthIndex) === "number"
      ? { worstCashMonthIndex: Math.max(0, Math.trunc(asNumber(summary.worstCashMonthIndex) ?? 0)) }
      : (Number.isFinite(worstCash) ? { worstCashMonthIndex } : {})),
    ...(explicitGoalsTotal > 0
      ? {
          goalsAchieved: {
            achieved: Math.max(0, Math.trunc(goalsAchievedCount ?? achieved)),
            total: explicitGoalsTotal,
          },
        }
      : (total > 0 ? { goalsAchieved: { achieved, total } } : {})),
    ...(typeof dsrPct === "number" ? { dsrPct } : {}),
  };
}

function buildScenariosDto(scenarios: Record<string, unknown>): ResultDtoV1["scenarios"] | undefined {
  if (Object.keys(scenarios).length === 0) return undefined;

  if (Array.isArray(scenarios.table)) {
    const shortWhyRaw = asRecord(scenarios.shortWhyByScenario);
    const shortWhy = takeTop(Object.values(shortWhyRaw)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => asString(value))
      .filter((value) => value.length > 0), LIMITS.tracesTop);
    return {
      table: takeTop(scenarios.table, LIMITS.tracesTop),
      shortWhy,
    };
  }

  const base = asRecord(scenarios.base);
  const list = asArray(scenarios.scenarios).map((entry) => asRecord(entry));
  if (Object.keys(base).length === 0 && list.length === 0) return undefined;

  const table: unknown[] = [];
  if (Object.keys(base).length > 0) {
    table.push({
      id: asString(base.id) || "base",
      title: asString(base.title) || "Base",
      ...(asRecord(base.summary)),
    });
  }
  list.forEach((entry) => {
    table.push({
      id: asString(entry.id) || "scenario",
      title: asString(entry.title) || "Scenario",
      ...(asRecord(entry.summary)),
      diffVsBase: entry.diffVsBase,
    });
  });

  const shortWhy = takeTop(list.flatMap((entry) => asArray(asRecord(entry.diffVsBase).shortWhy))
    .map((line) => asString(line))
    .filter((line) => line.length > 0), LIMITS.tracesTop);

  return {
    table: takeTop(table, LIMITS.tracesTop),
    shortWhy,
  };
}

function buildMonteCarloDto(raw: Record<string, unknown>): ResultDtoV1["monteCarlo"] | undefined {
  const source = asRecord(raw.monteCarlo);
  const monte = Object.keys(source).length > 0 ? source : raw;
  if (Object.keys(monte).length === 0) return undefined;
  const probabilities = asRecord(monte.probabilities);
  const percentiles = asRecord(monte.percentiles);
  const notes = asArray(monte.notes).map((note) => asString(note)).filter((note) => note.length > 0).slice(0, LIMITS.actionsTop);
  if (Object.keys(probabilities).length === 0 && Object.keys(percentiles).length === 0 && notes.length === 0) {
    return undefined;
  }
  return {
    probabilities,
    percentiles,
    notes,
  };
}

function buildDebtDto(raw: Record<string, unknown>): ResultDtoV1["debt"] | undefined {
  if (Object.keys(raw).length === 0) return undefined;
  const summary = asRecord(raw.summary);
  const meta = asRecord(raw.meta);
  const dsrRaw = asNumber(summary.debtServiceRatio) ?? asNumber(meta.debtServiceRatio);
  const dsrPct = normalizePct(dsrRaw);
  return {
    ...(typeof dsrPct === "number" ? { dsrPct } : {}),
    ...(raw.summaries !== undefined ? { summaries: takeTop(asArray(raw.summaries), LIMITS.actionsTop) } : {}),
    ...(raw.refinance !== undefined ? { refinance: takeTop(asArray(raw.refinance), LIMITS.actionsTop) } : {}),
    ...(raw.whatIf !== undefined ? { whatIf: raw.whatIf } : {}),
    ...(Array.isArray(raw.cautions)
      ? { cautions: raw.cautions.map((entry) => asString(entry)).filter((entry) => entry.length > 0) }
      : {}),
  };
}

function toTopWarnings(rows: AggregatedWarning[]): ResultDtoV1["warnings"]["top"] {
  if (rows.length < 1) return [];
  return rows.slice(0, LIMITS.warningsTop).map((row) => ({
    code: row.code,
    severity: row.severity,
    message: row.sampleMessage,
  }));
}

function compactActionItem(row: ActionItemV2): ActionItemV2 {
  const why = Array.isArray(row.why) ? row.why.slice(0, LIMITS.warningsTop) : [];
  const steps = Array.isArray(row.steps) ? row.steps.slice(0, LIMITS.actionsTop) : [];
  const cautions = Array.isArray(row.cautions) ? row.cautions.slice(0, LIMITS.actionsTop) : [];
  return {
    ...row,
    why,
    steps,
    cautions,
  };
}

function buildActionsDto(rawItems: ActionItemV2[]): ResultDtoV1["actions"] | undefined {
  if (rawItems.length < 1) return undefined;
  const compacted = rawItems.map((row) => compactActionItem(row));
  const top = takeTop(compacted, LIMITS.actionsTop);
  if (top.length < 1) return undefined;
  return {
    items: top,
    top3: takeTop(top, 3),
    top,
  };
}

function buildRawDto(input: BuildResultDtoV1Input): ResultDtoV1["raw"] {
  const simulate = asRecord(input.simulate);
  const scenarios = asRecord(input.scenarios);
  const monteCarlo = asRecord(input.monteCarlo);
  const actions = asRecord(input.actions);
  const debt = asRecord(input.debt);

  const simulateRaw = (() => {
    if (Object.keys(simulate).length < 1) return undefined;
    const out: Record<string, unknown> = {};
    if (simulate.summary !== undefined) out.summary = simulate.summary;
    if (asRecord(simulate.assumptionsUsed) && Object.keys(asRecord(simulate.assumptionsUsed)).length > 0) {
      out.assumptionsUsed = simulate.assumptionsUsed;
    }
    const warnings = normalizeWarningList(simulate.warnings).slice(0, LIMITS.warningsTop);
    if (warnings.length > 0) out.warnings = warnings;
    const goals = takeTop(pickGoalRows(simulate), LIMITS.goalsTop);
    if (goals.length > 0) out.goalsStatus = goals;
    const timelineRows = asArray(simulate.timeline);
    if (timelineRows.length > 0) {
      out.timelineSampled = takeTop(sampleByStride(timelineRows, RAW_TIMELINE_SAMPLE_STEP_MONTHS), LIMITS.tracesTop);
    }
    const keyPoints = takeTop(asArray(simulate.keyTimelinePoints), LIMITS.timelinePoints);
    if (keyPoints.length > 0) out.keyTimelinePoints = keyPoints;
    const traces = takeTop(asArray(simulate.traces), LIMITS.tracesTop);
    if (traces.length > 0) out.traces = traces;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const scenariosRaw = (() => {
    if (Object.keys(scenarios).length < 1) return undefined;
    const out: Record<string, unknown> = {};
    const table = takeTop(asArray(scenarios.table), LIMITS.tracesTop);
    if (table.length > 0) out.table = table;
    const shortWhyByScenario = asRecord(scenarios.shortWhyByScenario);
    if (Object.keys(shortWhyByScenario).length > 0) {
      out.shortWhyByScenario = Object.fromEntries(
        Object.entries(shortWhyByScenario).map(([key, value]) => [key, takeTop(asArray(value), LIMITS.actionsTop)]),
      );
    }
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const monteCarloRaw = (() => {
    if (Object.keys(monteCarlo).length < 1) return undefined;
    const out: Record<string, unknown> = {};
    if (monteCarlo.probabilities !== undefined) out.probabilities = monteCarlo.probabilities;
    if (monteCarlo.percentiles !== undefined) out.percentiles = monteCarlo.percentiles;
    const notes = takeTop(asArray(monteCarlo.notes), LIMITS.actionsTop).map((entry) => asString(entry)).filter((entry) => entry.length > 0);
    if (notes.length > 0) out.notes = notes;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const actionsRaw = (() => {
    if (Object.keys(actions).length < 1) return undefined;
    const out: Record<string, unknown> = {};
    const rows = asArray(actions.actions)
      .map((entry) => asRecord(entry) as ActionItemV2)
      .map((entry) => compactActionItem(entry));
    const topRows = takeTop(rows, LIMITS.actionsTop);
    if (topRows.length > 0) out.actions = topRows;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const debtRaw = (() => {
    if (Object.keys(debt).length < 1) return undefined;
    const out: Record<string, unknown> = {};
    if (debt.summary !== undefined) out.summary = debt.summary;
    const warnings = normalizeWarningList(debt.warnings).slice(0, LIMITS.warningsTop);
    if (warnings.length > 0) out.warnings = warnings;
    const summaries = takeTop(asArray(debt.summaries), LIMITS.actionsTop);
    if (summaries.length > 0) out.summaries = summaries;
    const refinance = takeTop(asArray(debt.refinance), LIMITS.actionsTop);
    if (refinance.length > 0) out.refinance = refinance;
    if (debt.whatIf !== undefined) out.whatIf = debt.whatIf;
    const cautions = takeTop(asArray(debt.cautions), LIMITS.actionsTop).map((entry) => asString(entry)).filter((entry) => entry.length > 0);
    if (cautions.length > 0) out.cautions = cautions;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  return {
    ...(simulateRaw ? { simulate: simulateRaw } : {}),
    ...(scenariosRaw ? { scenarios: scenariosRaw } : {}),
    ...(monteCarloRaw ? { monteCarlo: monteCarloRaw } : {}),
    ...(actionsRaw ? { actions: actionsRaw } : {}),
    ...(debtRaw ? { debt: debtRaw } : {}),
  };
}

function toMarkdownWarningPeriod(firstMonth: number | undefined, lastMonth: number | undefined): string {
  if (typeof firstMonth !== "number" && typeof lastMonth !== "number") return "-";
  if (typeof firstMonth === "number" && typeof lastMonth === "number") {
    if (firstMonth === lastMonth) return `M${firstMonth + 1}`;
    return `M${firstMonth + 1}~M${lastMonth + 1}`;
  }
  if (typeof firstMonth === "number") return `M${firstMonth + 1}`;
  return `M${(lastMonth ?? 0) + 1}`;
}

function toMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function toPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function toSafeLine(value: unknown): string {
  return asString(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildResultDtoV1(input: BuildResultDtoV1Input): ResultDtoV1 {
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();
  const simulate = asRecord(input.simulate);
  const scenarios = asRecord(input.scenarios);
  const monteCarlo = asRecord(input.monteCarlo);
  const actions = asRecord(input.actions);
  const debt = asRecord(input.debt);
  const actionItems = asArray(actions.actions).map((entry) => asRecord(entry) as ActionItemV2);

  const rawGoals = pickGoalRows(simulate);
  const goals = buildGoalsDto(rawGoals);
  const timelinePoints = buildTimelinePoints(simulate);
  const simWarnings = normalizeWarningList(simulate.warnings);
  const debtWarnings = normalizeWarningList(debt.warnings);
  const aggregatedWarnings = aggregateWarnings([...simWarnings, ...debtWarnings]);
  const criticalWarnings = aggregatedWarnings
    .filter((warning) => warning.severity === "critical")
    .reduce((sum, warning) => sum + warning.count, 0);
  const totalWarnings = aggregatedWarnings.reduce((sum, warning) => sum + warning.count, 0);
  const simulateSummary = buildSimulationSummary(simulate, goals);
  const debtDto = buildDebtDto(debt);
  const actionsDto = buildActionsDto(actionItems);
  const scenariosDto = buildScenariosDto(scenarios);
  const monteCarloDto = buildMonteCarloDto(monteCarlo);
  const rawDto = buildRawDto(input);

  const summary: ResultDtoV1["summary"] = {
    ...(simulateSummary.endNetWorthKrw !== undefined ? { endNetWorthKrw: simulateSummary.endNetWorthKrw } : {}),
    ...(simulateSummary.worstCashKrw !== undefined ? { worstCashKrw: simulateSummary.worstCashKrw } : {}),
    ...(simulateSummary.worstCashMonthIndex !== undefined ? { worstCashMonthIndex: simulateSummary.worstCashMonthIndex } : {}),
    ...(simulateSummary.goalsAchieved ? { goalsAchieved: simulateSummary.goalsAchieved } : {}),
    ...(simulateSummary.dsrPct !== undefined
      ? { dsrPct: simulateSummary.dsrPct }
      : (debtDto?.dsrPct !== undefined ? { dsrPct: debtDto.dsrPct } : {})),
    criticalWarnings,
    totalWarnings,
  };

  return {
    version: 1,
    meta: {
      generatedAt,
      snapshot: normalizeSnapshotMeta(input.meta?.snapshot),
      ...(normalizeHealthMeta(input.meta?.health) ? { health: normalizeHealthMeta(input.meta?.health) } : {}),
      ...(normalizeCacheMeta(input.meta?.cache) ? { cache: normalizeCacheMeta(input.meta?.cache) } : {}),
      ...(asString(input.policyId) ? { policyId: asString(input.policyId) } : {}),
    },
    summary,
    warnings: {
      aggregated: aggregatedWarnings.map((warning) => ({
        code: warning.code,
        severity: warning.severity,
        count: warning.count,
        ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
        ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
        ...(warning.sampleMessage ? { sampleMessage: warning.sampleMessage } : {}),
      })),
      top: toTopWarnings(aggregatedWarnings),
    },
    goals,
    timeline: {
      points: timelinePoints,
    },
    ...(actionsDto ? { actions: actionsDto } : {}),
    ...(scenariosDto ? { scenarios: scenariosDto } : {}),
    ...(monteCarloDto ? { monteCarlo: monteCarloDto } : {}),
    ...(debtDto ? { debt: debtDto } : {}),
    ...(Object.keys(rawDto).length > 0 ? { raw: rawDto } : {}),
  };
}

export function buildResultDtoV1FromRunRecord(run: RunLike): ResultDtoV1 {
  const outputs = asRecord(run.outputs);
  return buildResultDtoV1({
    generatedAt: asString(run.createdAt),
    policyId: asString(asRecord(run.input).policyId) || undefined,
    meta: {
      snapshot: asRecord(run.meta).snapshot,
      health: asRecord(run.meta).health,
      cache: asRecord(run.meta).cache,
    },
    simulate: outputs.simulate,
    scenarios: outputs.scenarios,
    monteCarlo: outputs.monteCarlo,
    actions: outputs.actions,
    debt: outputs.debtStrategy,
  });
}

export function isResultDtoV1(value: unknown): value is ResultDtoV1 {
  const row = asRecord(value);
  if (row.version !== 1) return false;
  if (!asRecord(row.meta).generatedAt) return false;
  if (!isFinite(Number(asRecord(row.summary).totalWarnings ?? 0))) return false;
  return true;
}

export function toMarkdownFromResultDto(
  dto: ResultDtoV1,
  options?: {
    title?: string;
    reportId?: string;
    runId?: string;
  },
): string {
  const lines: string[] = [];
  const title = asString(options?.title) || "Planning v2 Report";
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## 기준정보");
  lines.push(`- 생성시각: ${dto.meta.generatedAt}`);
  lines.push(`- reportId: ${asString(options?.reportId) || "-"}`);
  lines.push(`- runId: ${asString(options?.runId) || "-"}`);
  lines.push(`- snapshotId: ${dto.meta.snapshot.id ?? "latest"}`);
  lines.push(`- snapshot asOf: ${dto.meta.snapshot.asOf ?? "-"}`);
  lines.push(`- snapshot fetchedAt: ${dto.meta.snapshot.fetchedAt ?? "-"}`);
  lines.push(`- snapshot missing: ${dto.meta.snapshot.missing ? "Y" : "N"}`);
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("| 지표 | 값 |");
  lines.push("| --- | --- |");
  lines.push(`| 말기 순자산 | ${toMoney(dto.summary.endNetWorthKrw)} |`);
  lines.push(`| 최저 현금(월) | ${toMoney(dto.summary.worstCashKrw)} (${typeof dto.summary.worstCashMonthIndex === "number" ? `M${dto.summary.worstCashMonthIndex + 1}` : "-"}) |`);
  lines.push(`| 목표 달성 | ${dto.summary.goalsAchieved ? `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}` : "-"} |`);
  lines.push(`| DSR | ${toPct(dto.summary.dsrPct)} |`);
  lines.push(`| 치명 경고 | ${Math.max(0, Math.trunc(dto.summary.criticalWarnings ?? 0))} |`);
  lines.push(`| 총 경고 | ${Math.max(0, Math.trunc(dto.summary.totalWarnings ?? 0))} |`);
  lines.push("");

  lines.push("## Warnings Summary");
  if (dto.warnings.aggregated.length < 1) {
    lines.push("- 경고 없음");
  } else {
    const warningsTop = dto.warnings.aggregated.slice(0, LIMITS.reportWarningsTop);
    lines.push("| 코드 | 심각도 | 횟수 | 기간 | 의미 |");
    lines.push("| --- | --- | ---: | --- | --- |");
    warningsTop.forEach((warning) => {
      lines.push(`| ${warning.code} | ${warning.severity} | ${warning.count} | ${toMarkdownWarningPeriod(warning.firstMonth, warning.lastMonth)} | ${toSafeLine(warning.sampleMessage ?? "")} |`);
    });
    const omitted = dto.warnings.aggregated.length - warningsTop.length;
    if (omitted > 0) lines.push(`- 추가 경고 ${omitted}건은 요약 출력에서 생략했습니다.`);
  }
  lines.push("");

  lines.push("## Goals");
  if (dto.goals.length < 1) {
    lines.push("- 목표 데이터 없음");
  } else {
    const goalsTop = dto.goals.slice(0, LIMITS.goalsTop);
    lines.push("| 목표 | 목표액 | 현재 | 부족액 | 목표월 | 달성 | 코멘트 |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
    goalsTop.forEach((goal) => {
      lines.push(`| ${toSafeLine(goal.title)} | ${Math.round(goal.targetKrw ?? 0).toLocaleString("ko-KR")} | ${Math.round(goal.currentKrw ?? 0).toLocaleString("ko-KR")} | ${Math.round(goal.shortfallKrw ?? 0).toLocaleString("ko-KR")} | ${goal.targetMonth ?? "-"} | ${goal.achieved ? "Y" : "N"} | ${toSafeLine(goal.comment ?? "-")} |`);
    });
    const omitted = dto.goals.length - goalsTop.length;
    if (omitted > 0) lines.push(`- 추가 목표 ${omitted}건은 요약 출력에서 생략했습니다.`);
  }
  lines.push("");

  lines.push(`## Actions Top ${LIMITS.actionsTop}`);
  const reportActions = dto.actions?.top ?? dto.actions?.top3 ?? [];
  if (reportActions.length < 1) {
    lines.push("- 권장 액션 없음");
  } else {
    const actionsTop = reportActions.slice(0, LIMITS.actionsTop);
    lines.push("| 심각도 | 코드 | 제목 | 요약 |");
    lines.push("| --- | --- | --- | --- |");
    actionsTop.forEach((action) => {
      lines.push(`| ${action.severity} | ${action.code} | ${toSafeLine(action.title)} | ${toSafeLine(action.summary)} |`);
    });
    const omitted = reportActions.length - actionsTop.length;
    if (omitted > 0) lines.push(`- 추가 액션 ${omitted}건은 요약 출력에서 생략했습니다.`);
  }
  lines.push("");

  if (dto.monteCarlo) {
    lines.push("## Monte Carlo");
    const depletion = asNumber(asRecord(dto.monteCarlo.probabilities).retirementDepletionBeforeEnd);
    if (typeof depletion === "number") {
      lines.push(`- 은퇴 자산 고갈 확률: ${(depletion * 100).toFixed(1)}%`);
    }
    const end = asRecord(asRecord(dto.monteCarlo.percentiles).endNetWorthKrw);
    const cash = asRecord(asRecord(dto.monteCarlo.percentiles).worstCashKrw);
    lines.push("| 지표 | P10 | P50 | P90 |");
    lines.push("| --- | ---: | ---: | ---: |");
    lines.push(`| 말기 순자산 | ${Math.round(asNumber(end.p10) ?? 0).toLocaleString("ko-KR")} | ${Math.round(asNumber(end.p50) ?? 0).toLocaleString("ko-KR")} | ${Math.round(asNumber(end.p90) ?? 0).toLocaleString("ko-KR")} |`);
    lines.push(`| 최저 현금 | ${Math.round(asNumber(cash.p10) ?? 0).toLocaleString("ko-KR")} | ${Math.round(asNumber(cash.p50) ?? 0).toLocaleString("ko-KR")} | ${Math.round(asNumber(cash.p90) ?? 0).toLocaleString("ko-KR")} |`);
    lines.push("");
  }

  if (dto.debt) {
    lines.push("## Debt");
    lines.push(`- DSR: ${toPct(dto.debt.dsrPct)}`);
    lines.push(`- 대환 분석 수: ${Array.isArray(dto.debt.refinance) ? dto.debt.refinance.length : 0}`);
    if (Array.isArray(dto.debt.cautions) && dto.debt.cautions.length > 0) {
      lines.push(`- 주의: ${dto.debt.cautions.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
