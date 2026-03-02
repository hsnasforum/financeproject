import { type ActionItemV2 } from "../../../../lib/planning/v2/actions/types";
import { type GoalRow } from "../../../../lib/planning/v2/report/mapGoals";
import { type TimelineRow } from "../../../../lib/planning/v2/report/pickTimelinePoints";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
  toMarkdownFromResultDto,
  type ResultDtoV1,
} from "../../../../lib/planning/v2/resultDto";
import {
  type PlanningRunOverallStatus,
  type PlanningRunRecord,
  type PlanningRunStageId,
  type PlanningRunStageResult,
} from "../../../../lib/planning/store/types";
import { type PlanningInterpretationPolicy } from "../../../../lib/planning/catalog/planningPolicy";
import { type AssumptionsOverrideEntry } from "../../../../lib/planning/assumptions/overrides";
import { aggregateWarningsByUniqueMonth, type DashboardWarningAggRow } from "./warningAggregation";
import { resolveWarningCatalog, warningFallbackMessage } from "./warningCatalog";

type ReportLike = {
  id?: string;
  createdAt?: string;
  runId?: string;
  markdown?: string;
};

type MonteCarloKeyProb = {
  key: string;
  label: string;
  probability: number;
};

type MonteCarloPercentile = {
  metric: string;
  p10?: number;
  p50?: number;
  p90?: number;
};

export type ReportVM = {
  header: { reportId: string; createdAt: string; runId: string };
  stage: {
    overallStatus?: PlanningRunOverallStatus;
    byId: Partial<Record<PlanningRunStageId, PlanningRunStageResult>>;
  };
  snapshot: { id?: string; asOf?: string; fetchedAt?: string; missing?: boolean; staleDays?: number };
  reproducibility?: {
    runId: string;
    createdAt: string;
    assumptionsSnapshotId?: string;
    staleDays?: number;
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsHash?: string;
    effectiveAssumptionsHash?: string;
    appliedOverrides: AssumptionsOverrideEntry[];
    policy: PlanningInterpretationPolicy;
  };
  summaryCards: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    debtTotalKrw?: number;
    totalMonthlyDebtPaymentKrw?: number;
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    worstCashMonthIndex?: number;
    goalsAchieved?: string;
    criticalWarnings?: number;
    totalWarnings?: number;
  };
  warningAgg: DashboardWarningAggRow[];
  goalsTable: GoalRow[];
  topActions: ActionItemV2[];
  timelinePoints: TimelineRow[];
  monteCarloSummary?: {
    keyProbs: MonteCarloKeyProb[];
    percentiles: MonteCarloPercentile[];
    notes: string[];
  };
  debtSummary?: {
    meta: {
      debtServiceRatio: number;
      totalMonthlyPaymentKrw: number;
    };
    summaries: Array<Record<string, unknown>>;
    refinance?: Array<Record<string, unknown>>;
    whatIf: Record<string, unknown>;
    warnings: Array<{ code: string; message: string; data?: unknown }>;
    cautions: string[];
  };
  insight: {
    summaryMetrics: {
      monthlySurplusKrw?: number;
      emergencyFundMonths?: number;
      endNetWorthKrw?: number;
      worstCashKrw?: number;
      worstCashMonthIndex?: number;
      dsrPct?: number;
      goalsAchievedText?: string;
    };
    aggregatedWarnings: Array<{
      code: string;
      severity: "info" | "warn" | "critical";
      count: number;
      firstMonth?: number;
      lastMonth?: number;
      sampleMessage?: string;
      suggestedActionId?: string;
      subjectLabel?: string;
    }>;
    goals: GoalRow[];
    outcomes: {
      actionsTop: ActionItemV2[];
      snapshotMeta: {
        missing?: boolean;
        staleDays?: number;
      };
      monteCarlo: {
        retirementDepletionBeforeEnd?: number;
      };
    };
  };
  raw?: { reportMarkdown?: string; runJson?: unknown; resultDto?: ResultDtoV1 };
};

export type ReportViewModel = ReportVM;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toResultDto(run: PlanningRunRecord): ResultDtoV1 {
  const rawDto = asRecord(run.outputs).resultDto;
  if (isResultDtoV1(rawDto)) return rawDto;
  return buildResultDtoV1FromRunRecord(run);
}

function toGoals(dto: ResultDtoV1): GoalRow[] {
  return dto.goals.map((goal) => ({
    name: goal.title,
    targetAmount: asNumber(goal.targetKrw) ?? 0,
    currentAmount: asNumber(goal.currentKrw) ?? 0,
    shortfall: asNumber(goal.shortfallKrw) ?? Math.max(0, (asNumber(goal.targetKrw) ?? 0) - (asNumber(goal.currentKrw) ?? 0)),
    targetMonth: Math.max(0, Math.trunc(asNumber(goal.targetMonth) ?? 0)),
    achieved: goal.achieved === true,
    comment: asString(goal.comment) || (goal.achieved ? "달성" : "진행 중"),
  }));
}

function toTimeline(dto: ResultDtoV1): TimelineRow[] {
  return dto.timeline.points.map((point) => ({
    label: point.label === "start" ? "시작" : point.label === "mid" ? "중간" : "마지막",
    monthIndex: point.monthIndex,
    income: asNumber(point.incomeKrw) ?? 0,
    expenses: asNumber(point.expensesKrw) ?? 0,
    debtPayment: asNumber(point.debtPaymentKrw) ?? 0,
    operatingCashflow: 0,
    cash: asNumber(point.cashKrw) ?? 0,
    netWorth: asNumber(point.netWorthKrw) ?? 0,
    totalDebt: asNumber(point.totalDebtKrw) ?? 0,
  }));
}

function summaryMonthlySurplusKrw(dto: ResultDtoV1): number | undefined {
  const start = dto.timeline.points.find((point) => point.label === "start") ?? dto.timeline.points[0];
  if (!start) return undefined;
  const income = asNumber(start.incomeKrw);
  const expenses = asNumber(start.expensesKrw);
  const debtPayment = asNumber(start.debtPaymentKrw) ?? 0;
  if (typeof income !== "number" || typeof expenses !== "number") return undefined;
  return income - expenses - debtPayment;
}

function summaryEmergencyFundMonths(dto: ResultDtoV1): number | undefined {
  const emergencyGoal = dto.goals.find((goal) => goal.type === "emergencyFund");
  if (!emergencyGoal) return undefined;
  const currentKrw = asNumber(emergencyGoal.currentKrw);
  if (typeof currentKrw !== "number") return undefined;
  const start = dto.timeline.points.find((point) => point.label === "start") ?? dto.timeline.points[0];
  const monthlyExpense = asNumber(start?.expensesKrw);
  if (typeof monthlyExpense !== "number" || monthlyExpense <= 0) return undefined;
  return Math.round((currentKrw / monthlyExpense) * 10) / 10;
}

function summaryDebtTotalKrw(dto: ResultDtoV1): number | undefined {
  const debtRows = asArray(dto.debt?.summaries).map((entry) => asRecord(entry));
  const principalRows = debtRows
    .map((row) => asNumber(row.principalKrw))
    .filter((value): value is number => typeof value === "number");
  if (principalRows.length > 0) {
    return principalRows.reduce((sum, value) => sum + value, 0);
  }
  const start = dto.timeline.points.find((point) => point.label === "start") ?? dto.timeline.points[0];
  return asNumber(start?.totalDebtKrw);
}

function toMonteCarlo(dto: ResultDtoV1): ReportVM["monteCarloSummary"] | undefined {
  if (!dto.monteCarlo) return undefined;
  const probabilities = asRecord(dto.monteCarlo.probabilities);
  const keyProbs: MonteCarloKeyProb[] = Object.entries(probabilities)
    .map(([key, value]) => {
      const probability = asNumber(value);
      if (typeof probability !== "number") return null;
      return {
        key,
        label: key === "retirementDepletionBeforeEnd" ? "은퇴 자산 고갈 확률" : key,
        probability,
      };
    })
    .filter((entry): entry is MonteCarloKeyProb => entry !== null);

  const percentiles = asRecord(dto.monteCarlo.percentiles);
  const percentileRows: MonteCarloPercentile[] = Object.entries(percentiles).map(([metric, raw]) => {
    const row = asRecord(raw);
    return {
      metric,
      ...(typeof asNumber(row.p10) === "number" ? { p10: asNumber(row.p10) } : {}),
      ...(typeof asNumber(row.p50) === "number" ? { p50: asNumber(row.p50) } : {}),
      ...(typeof asNumber(row.p90) === "number" ? { p90: asNumber(row.p90) } : {}),
    };
  });

  return {
    keyProbs,
    percentiles: percentileRows,
    notes: dto.monteCarlo.notes,
  };
}

function toDebt(dto: ResultDtoV1): ReportVM["debtSummary"] | undefined {
  if (!dto.debt) return undefined;
  const rawWarnings = asArray(asRecord(dto.raw?.debt).warnings).map((entry) => asRecord(entry));
  const warnings = rawWarnings.map((warning) => ({
    code: asString(warning.code) || "UNKNOWN",
    message: asString(warning.message) || warningFallbackMessage(asString(warning.code) || "UNKNOWN"),
    ...(warning.data !== undefined ? { data: warning.data } : {}),
  }));
  const summaries = asArray(dto.debt.summaries).map((entry) => asRecord(entry));
  const refinance = Array.isArray(dto.debt.refinance) ? dto.debt.refinance.map((entry) => asRecord(entry)) : undefined;
  return {
    meta: {
      debtServiceRatio: (asNumber(dto.debt.dsrPct) ?? 0) / 100,
      totalMonthlyPaymentKrw: asNumber(asRecord(asRecord(dto.raw?.debt).summary).totalMonthlyPaymentKrw) ?? 0,
    },
    summaries,
    ...(refinance ? { refinance } : {}),
    whatIf: asRecord(dto.debt.whatIf),
    warnings,
    cautions: asArray(dto.debt.cautions).map((entry) => asString(entry)).filter((entry) => entry.length > 0),
  };
}

function fallbackWarningAggFromDto(dto: ResultDtoV1): DashboardWarningAggRow[] {
  return dto.warnings.aggregated.map((warning) => {
    const firstMonth = typeof warning.firstMonth === "number" ? warning.firstMonth : undefined;
    const lastMonth = typeof warning.lastMonth === "number" ? warning.lastMonth : undefined;
    const spanCount = (typeof firstMonth === "number" && typeof lastMonth === "number" && lastMonth >= firstMonth)
      ? (lastMonth - firstMonth + 1)
      : undefined;
    const dedupedCount = typeof spanCount === "number"
      ? Math.min(Math.max(1, Math.trunc(warning.count)), spanCount)
      : warning.count;
    const catalog = resolveWarningCatalog(warning.code);
    return {
      code: warning.code,
      title: catalog.title,
      plainDescription: catalog.plainDescription,
      ...(catalog.suggestedActionId ? { suggestedActionId: catalog.suggestedActionId } : {}),
      severity: warning.severity === "critical" || warning.severity === "warn" ? warning.severity : "info",
      severityMax: warning.severity === "critical" || warning.severity === "warn" ? warning.severity : "info",
      count: dedupedCount,
      periodMinMax: (typeof firstMonth === "number" && typeof lastMonth === "number")
        ? (firstMonth === lastMonth ? `M${firstMonth + 1}` : `M${firstMonth + 1}~M${lastMonth + 1}`)
        : "-",
      ...(typeof firstMonth === "number" ? { firstMonth } : {}),
      ...(typeof lastMonth === "number" ? { lastMonth } : {}),
      sampleMessage: asString(warning.sampleMessage) || warningFallbackMessage(warning.code),
    };
  });
}

function toWarningAgg(dto: ResultDtoV1, run: PlanningRunRecord | null): DashboardWarningAggRow[] {
  const outputs = asRecord(run?.outputs);
  const simulateWarnings = asArray(asRecord(outputs.simulate).warnings);
  const debtWarnings = asArray(asRecord(outputs.debtStrategy).warnings);
  const fromRun = aggregateWarningsByUniqueMonth([...simulateWarnings, ...debtWarnings]);
  if (fromRun.length > 0) return fromRun;
  return fallbackWarningAggFromDto(dto);
}

function toInsightWarnings(rows: DashboardWarningAggRow[]): ReportVM["insight"]["aggregatedWarnings"] {
  return rows.map((row) => ({
    code: row.code,
    severity: row.severityMax,
    count: row.count,
    ...(typeof row.firstMonth === "number" ? { firstMonth: row.firstMonth } : {}),
    ...(typeof row.lastMonth === "number" ? { lastMonth: row.lastMonth } : {}),
    ...(row.sampleMessage ? { sampleMessage: row.sampleMessage } : {}),
    ...(row.suggestedActionId ? { suggestedActionId: row.suggestedActionId } : {}),
    ...(row.subjectLabel ? { subjectLabel: row.subjectLabel } : {}),
  }));
}

function toTopActions(dto: ResultDtoV1): ActionItemV2[] {
  return (dto.actions?.top3 ?? []).slice(0, 3).map((action) => ({
    ...action,
    candidates: undefined,
  }));
}

function toStageById(run: PlanningRunRecord | null): Partial<Record<PlanningRunStageId, PlanningRunStageResult>> {
  if (!Array.isArray(run?.stages)) return {};
  const out: Partial<Record<PlanningRunStageId, PlanningRunStageResult>> = {};
  for (const stage of run.stages) {
    out[stage.id] = stage;
  }
  return out;
}

export function buildReportVM(
  run: PlanningRunRecord | null,
  report?: ReportLike,
): ReportVM {
  const reportId = asString(report?.id) || asString(run?.id) || "-";
  const reportCreatedAt = asString(report?.createdAt) || asString(run?.createdAt) || "-";
  const fallbackRunId = run?.id ?? "-";
  const runId = asString(report?.runId) || fallbackRunId;

  if (!run) {
    return {
      header: {
        reportId,
        createdAt: reportCreatedAt,
        runId,
      },
      stage: {
        byId: {},
      },
      snapshot: {},
      summaryCards: {},
      warningAgg: [],
      goalsTable: [],
      topActions: [],
      timelinePoints: [],
      insight: {
        summaryMetrics: {},
        aggregatedWarnings: [],
        goals: [],
        outcomes: {
          actionsTop: [],
          snapshotMeta: {},
          monteCarlo: {},
        },
      },
      raw: {
        ...(asString(report?.markdown) ? { reportMarkdown: asString(report?.markdown) } : {}),
      },
    };
  }

  const dto = toResultDto(run);
  const warningAgg = toWarningAgg(dto, run);
  const goalsTable = toGoals(dto);
  const timelinePoints = toTimeline(dto);
  const topActions = toTopActions(dto);
  const monteCarloSummary = toMonteCarlo(dto);
  const debtSummary = toDebt(dto);

  const monthlySurplusKrw = summaryMonthlySurplusKrw(dto);
  const emergencyFundMonths = summaryEmergencyFundMonths(dto);
  const debtTotalKrw = summaryDebtTotalKrw(dto);
  const totalMonthlyDebtPaymentKrw = debtSummary?.meta.totalMonthlyPaymentKrw;
  const goalsAchieved = dto.summary.goalsAchieved
    ? `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}`
    : undefined;
  const reportMarkdown = asString(report?.markdown) || toMarkdownFromResultDto(dto, {
    reportId,
    runId,
  });
  const stageById = toStageById(run);
  const repro = run.reproducibility;

  const keyDepletionProb = monteCarloSummary?.keyProbs.find((item) => item.key === "retirementDepletionBeforeEnd")?.probability;

  return {
    header: {
      reportId,
      createdAt: reportCreatedAt,
      runId,
    },
    stage: {
      ...(run.overallStatus ? { overallStatus: run.overallStatus } : {}),
      byId: stageById,
    },
    snapshot: {
      ...(dto.meta.snapshot.id ? { id: dto.meta.snapshot.id } : {}),
      ...(dto.meta.snapshot.asOf ? { asOf: dto.meta.snapshot.asOf } : {}),
      ...(dto.meta.snapshot.fetchedAt ? { fetchedAt: dto.meta.snapshot.fetchedAt } : {}),
      ...(dto.meta.snapshot.missing ? { missing: true } : {}),
      ...(typeof dto.meta.health?.snapshotStaleDays === "number" ? { staleDays: dto.meta.health.snapshotStaleDays } : {}),
    },
    ...(repro
      ? {
        reproducibility: {
          runId: run.id,
          createdAt: run.createdAt,
          ...(asString(repro.assumptionsSnapshotId) ? { assumptionsSnapshotId: asString(repro.assumptionsSnapshotId) } : {}),
          ...(typeof dto.meta.health?.snapshotStaleDays === "number" ? { staleDays: dto.meta.health.snapshotStaleDays } : {}),
          appVersion: asString(repro.appVersion) || "unknown",
          engineVersion: asString(repro.engineVersion) || "planning-v2",
          profileHash: asString(repro.profileHash),
          ...(asString(repro.assumptionsHash) ? { assumptionsHash: asString(repro.assumptionsHash) } : {}),
          ...(asString(repro.effectiveAssumptionsHash) ? { effectiveAssumptionsHash: asString(repro.effectiveAssumptionsHash) } : {}),
          appliedOverrides: Array.isArray(repro.appliedOverrides) ? repro.appliedOverrides : [],
          policy: repro.policy,
        },
      }
      : {}),
    summaryCards: {
      ...(typeof monthlySurplusKrw === "number" ? { monthlySurplusKrw } : {}),
      ...(typeof dto.summary.dsrPct === "number" ? { dsrPct: dto.summary.dsrPct } : {}),
      ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
      ...(typeof debtTotalKrw === "number" ? { debtTotalKrw } : {}),
      ...(typeof totalMonthlyDebtPaymentKrw === "number" ? { totalMonthlyDebtPaymentKrw } : {}),
      ...(typeof dto.summary.endNetWorthKrw === "number" ? { endNetWorthKrw: dto.summary.endNetWorthKrw } : {}),
      ...(typeof dto.summary.worstCashKrw === "number" ? { worstCashKrw: dto.summary.worstCashKrw } : {}),
      ...(typeof dto.summary.worstCashMonthIndex === "number" ? { worstCashMonthIndex: dto.summary.worstCashMonthIndex } : {}),
      ...(goalsAchieved ? { goalsAchieved } : {}),
      ...(typeof dto.summary.criticalWarnings === "number" ? { criticalWarnings: dto.summary.criticalWarnings } : {}),
      ...(typeof dto.summary.totalWarnings === "number" ? { totalWarnings: dto.summary.totalWarnings } : {}),
    },
    warningAgg,
    goalsTable,
    topActions,
    timelinePoints,
    ...(monteCarloSummary ? { monteCarloSummary } : {}),
    ...(debtSummary ? { debtSummary } : {}),
    insight: {
      summaryMetrics: {
        ...(typeof monthlySurplusKrw === "number" ? { monthlySurplusKrw } : {}),
        ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
        ...(typeof dto.summary.endNetWorthKrw === "number" ? { endNetWorthKrw: dto.summary.endNetWorthKrw } : {}),
        ...(typeof dto.summary.worstCashKrw === "number" ? { worstCashKrw: dto.summary.worstCashKrw } : {}),
        ...(typeof dto.summary.worstCashMonthIndex === "number" ? { worstCashMonthIndex: dto.summary.worstCashMonthIndex } : {}),
        ...(typeof dto.summary.dsrPct === "number" ? { dsrPct: dto.summary.dsrPct } : {}),
        ...(goalsAchieved ? { goalsAchievedText: goalsAchieved } : {}),
      },
      aggregatedWarnings: toInsightWarnings(warningAgg),
      goals: goalsTable,
      outcomes: {
        actionsTop: topActions,
        snapshotMeta: {
          ...(dto.meta.snapshot.missing ? { missing: true } : {}),
          ...(typeof dto.meta.health?.snapshotStaleDays === "number" ? { staleDays: dto.meta.health.snapshotStaleDays } : {}),
        },
        monteCarlo: {
          ...(typeof keyDepletionProb === "number" ? { retirementDepletionBeforeEnd: keyDepletionProb } : {}),
        },
      },
    },
    raw: {
      ...(reportMarkdown ? { reportMarkdown } : {}),
      runJson: run,
      resultDto: dto,
    },
  };
}

export const buildReportViewModel = buildReportVM;
