import { buildPlanningChartPoints, type PlanningChartPoint } from "@/lib/planning/v2/chartPoints";
import { aggregateWarnings as aggregateGuideWarnings } from "@/lib/planning/v2/resultGuide";
import { buildResultSummaryMetrics, type ResultSummaryEvidence } from "@/lib/planning/v2/resultSummary";
import { type ResultDtoV1 } from "@/lib/planning/v2/resultDto";
import { type ActionItemV2 } from "@/lib/planning/v2/actions/types";

export type WorkspaceGuideBadge = {
  status: "risk" | "warn" | "ok";
  reason: string;
  minCashKrw: number;
  maxDsr: number;
  missedGoals: number;
  contributionSkippedCount: number;
};

export function buildWorkspaceGuideBadge(input: {
  summaryWorstCashKrw: number;
  hasNegativeCashflow: boolean;
  dtoDsrRatio: number;
  missedGoals: number;
  contributionSkippedCount: number;
}): WorkspaceGuideBadge {
  const {
    summaryWorstCashKrw,
    hasNegativeCashflow,
    dtoDsrRatio,
    missedGoals,
    contributionSkippedCount,
  } = input;

  if (summaryWorstCashKrw <= 0 || hasNegativeCashflow || dtoDsrRatio >= 0.6) {
    return {
      status: "risk",
      reason: "현금 부족 또는 과도한 부채부담 신호가 있어 즉시 조정이 필요합니다.",
      minCashKrw: summaryWorstCashKrw,
      maxDsr: dtoDsrRatio,
      missedGoals,
      contributionSkippedCount,
    };
  }
  if (dtoDsrRatio >= 0.4 || missedGoals > 0 || contributionSkippedCount >= 3) {
    return {
      status: "warn",
      reason: "일부 지표가 경고 구간입니다. 목표/지출/상환 계획을 점검하세요.",
      minCashKrw: summaryWorstCashKrw,
      maxDsr: dtoDsrRatio,
      missedGoals,
      contributionSkippedCount,
    };
  }
  return {
    status: "ok",
    reason: "현재 가정 기준으로 주요 지표가 안정 범위입니다.",
    minCashKrw: summaryWorstCashKrw,
    maxDsr: dtoDsrRatio,
    missedGoals,
    contributionSkippedCount,
  };
}

export function buildWorkspaceKeyFindings(input: {
  summaryWorstCashKrw: number;
  summaryDsr: number;
  totalGoals: number;
  achievedGoalCount: number;
  aggregatedWarningsCount: number;
  summaryCriticalWarnings: number;
}): string[] {
  const findings: string[] = [];
  const {
    summaryWorstCashKrw,
    summaryDsr,
    totalGoals,
    achievedGoalCount,
    aggregatedWarningsCount,
    summaryCriticalWarnings,
  } = input;

  if (summaryWorstCashKrw <= 0) {
    findings.push("현금흐름 위험: 기간 중 최저 현금이 0 이하로 내려갑니다.");
  } else {
    findings.push("현금흐름: 현재 가정에서는 현금이 0 이하로 내려가지 않습니다.");
  }

  if (summaryDsr >= 0.6) findings.push("부채부담 위험: DSR이 60% 이상입니다.");
  else if (summaryDsr >= 0.4) findings.push("부채부담 주의: DSR이 40% 이상입니다.");
  else findings.push("부채부담: DSR이 상대적으로 안정 구간입니다.");

  if (totalGoals > 0) {
    if (achievedGoalCount < totalGoals) findings.push(`목표 진행: ${totalGoals - achievedGoalCount}개 목표가 미달입니다.`);
    else findings.push("목표 진행: 현재 시뮬레이션에서 모든 목표를 달성했습니다.");
  }

  if (findings.length < 3) {
    findings.push(`경고 요약: 집계 경고 ${aggregatedWarningsCount}개(치명 ${summaryCriticalWarnings}개).`);
  }

  return findings;
}

export function buildDebtWhatIfSummary(input: {
  termExtensionsCount: number;
  termReductionsCount: number;
  extraPaymentsCount: number;
}): Array<{ title: string; count: number; interpretation: string }> {
  return [
    {
      title: "상환기간 연장",
      count: input.termExtensionsCount,
      interpretation: "월 상환액을 낮추는 대신 총이자는 늘어날 수 있습니다.",
    },
    {
      title: "상환기간 단축",
      count: input.termReductionsCount,
      interpretation: "월 상환 부담은 늘지만 총이자는 줄어드는 방향입니다.",
    },
    {
      title: "추가상환",
      count: input.extraPaymentsCount,
      interpretation: "여유자금을 투입해 만기 단축과 이자 절감을 기대할 수 있습니다.",
    },
  ];
}

export type WorkspaceAggregatedWarningInsight = {
  code: string;
  severity: "info" | "warn" | "critical";
  count: number;
  firstMonth?: number;
  lastMonth?: number;
  sampleMessage: string;
};

export type WorkspaceAggregatedWarning = WorkspaceAggregatedWarningInsight;

export type WorkspaceGoalTableRow = {
  goalId: string;
  name: string;
  achieved: boolean;
  targetMonth: number;
  progressPct: number;
  shortfallKrw: number;
  interpretation: string;
};

export type WorkspaceGoalInsight = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  shortfall: number;
  targetMonth: number;
  achieved: boolean;
  comment: string;
};

export type WorkspaceTimelineSummaryRow = {
  label: "시작" | "중간" | "마지막";
  monthIndex: number;
  month: number;
  liquidAssetsKrw: number;
  netWorthKrw: number;
  totalDebtKrw: number;
  debtServiceRatio: number;
  interpretation: string;
};

export type WorkspaceScenarioComparisonRow = {
  id: string;
  title: string;
  endNetWorthKrw: number;
  worstCashKrw: number;
  goalsAchieved: number;
  warningsCount: number;
  endNetWorthDeltaKrw: number;
  goalsAchievedDelta: number;
  shortWhy: string[];
};

export type WorkspaceScenarioVm = {
  baseSummary: {
    endNetWorthKrw: number;
    worstCashKrw: number;
    goalsAchieved: number;
    warningsCount: number;
  };
  baseWarnings: Array<{ reasonCode: string; message: string }>;
  comparisonRows: WorkspaceScenarioComparisonRow[];
};

export type WorkspaceDebtVm = {
  meta: {
    debtServiceRatio: number;
    totalMonthlyPaymentKrw: number;
  };
  summaries: Array<Record<string, unknown>>;
  refinance: Array<Record<string, unknown>>;
  whatIfSummary: Array<{ title: string; count: number; interpretation: string }>;
  warnings: WorkspaceAggregatedWarning[];
};

export type WorkspaceMonteCarloVm = {
  data: Record<string, unknown>;
  probabilities: Record<string, unknown>;
  percentiles: {
    endNetWorthKrw: Record<string, unknown>;
    worstCashKrw: Record<string, unknown>;
  };
  depletionProbability?: number;
};

export type WorkspaceActionTableRow = {
  code: string;
  severity: string;
  title: string;
  summary: string;
  whyCount: number;
  steps: string[];
  cautions: string[];
};

export type WorkspaceActionsVm = {
  topActionTitles: string[];
  tableRows: WorkspaceActionTableRow[];
  topActionsForInsight: ActionItemV2[];
};

export type WorkspaceDebugSection = {
  label: string;
  value: unknown;
};

export type WorkspaceResultSummaryVm = {
  simulateTimeline: Array<Record<string, unknown>>;
  simulateWarnings: Array<Record<string, unknown>>;
  simulateGoals: Array<Record<string, unknown>>;
  chartPoints: PlanningChartPoint[];
  chartMode: "full" | "key" | "none";
  aggregatedWarningsForInsight: WorkspaceAggregatedWarningInsight[];
  aggregatedWarnings: WorkspaceAggregatedWarning[];
  goalTableRows: WorkspaceGoalTableRow[];
  goalsForInsight: WorkspaceGoalInsight[];
  timelineSummaryRows: WorkspaceTimelineSummaryRow[];
  achievedGoalCount: number;
  summaryEndNetWorthKrw: number;
  summaryWorstCashKrw: number;
  summaryWorstCashMonth: number;
  summaryGoalsText: string;
  summaryDsr: number;
  summaryMonthlySurplusKrw?: number;
  summaryEmergencyFundMonths?: number;
  summaryEvidence: ResultSummaryEvidence;
  summaryCriticalWarnings: number;
  warningsSummaryTop5: WorkspaceAggregatedWarning[];
  guideBadge: WorkspaceGuideBadge;
  keyFindings: string[];
};

export function buildWorkspaceWarningsGoalsDebugSections(input: {
  beginnerMode: boolean;
  aggregatedWarnings: WorkspaceAggregatedWarning[];
  goalTableRows: WorkspaceGoalTableRow[];
  timelineSummaryRows: WorkspaceTimelineSummaryRow[];
  chartPoints: PlanningChartPoint[];
}): WorkspaceDebugSection[] {
  if (input.beginnerMode) return [];
  return [
    { label: "warning aggregates", value: input.aggregatedWarnings },
    { label: "goal rows", value: input.goalTableRows },
    { label: "timeline summary", value: input.timelineSummaryRows },
    { label: "chart points", value: input.chartPoints },
  ];
}

export function buildWorkspaceScenarioDebugSections(input: {
  beginnerMode: boolean;
  baseSummary: WorkspaceScenarioVm["baseSummary"];
  comparisonRows: WorkspaceScenarioComparisonRow[];
  baseWarnings: Array<{ reasonCode: string; message: string }>;
}): WorkspaceDebugSection[] {
  if (input.beginnerMode) return [];
  return [
    {
      label: "scenario base summary",
      value: {
        endNetWorthKrw: Number(input.baseSummary.endNetWorthKrw ?? 0),
        worstCashKrw: Number(input.baseSummary.worstCashKrw ?? 0),
        goalsAchieved: Number(input.baseSummary.goalsAchieved ?? 0),
        warningsCount: Number(input.baseSummary.warningsCount ?? 0),
      },
    },
    { label: "scenario comparison rows", value: input.comparisonRows },
    { label: "scenario base warnings", value: input.baseWarnings },
  ];
}

export function buildWorkspaceMonteCarloDebugSections(input: {
  beginnerMode: boolean;
  probabilities: Record<string, unknown>;
  endNetWorthKrw: Record<string, unknown>;
  worstCashKrw: Record<string, unknown>;
  depletionProbability?: number;
}): WorkspaceDebugSection[] {
  if (input.beginnerMode) return [];
  return [
    { label: "probabilities", value: input.probabilities },
    {
      label: "percentiles",
      value: {
        endNetWorthKrw: input.endNetWorthKrw,
        worstCashKrw: input.worstCashKrw,
      },
    },
    ...(typeof input.depletionProbability === "number"
      ? [{ label: "retirement depletion probability", value: input.depletionProbability }]
      : []),
  ];
}

export function buildWorkspaceActionsDebugSections(input: {
  beginnerMode: boolean;
  topActionTitles: string[];
  actionRows: WorkspaceActionTableRow[];
}): WorkspaceDebugSection[] {
  if (input.beginnerMode) return [];
  return [
    { label: "top action titles", value: input.topActionTitles },
    { label: "action rows", value: input.actionRows },
  ];
}

export function buildWorkspaceDebtDebugSections(input: {
  beginnerMode: boolean;
  debtMeta: WorkspaceDebtVm["meta"];
  debtSummaries: Array<Record<string, unknown>>;
  debtRefinance: Array<Record<string, unknown>>;
  debtWhatIfSummary: Array<{ title: string; count: number; interpretation: string }>;
  debtWarnings: WorkspaceAggregatedWarning[];
}): WorkspaceDebugSection[] {
  if (input.beginnerMode) return [];
  return [
    { label: "debt meta", value: input.debtMeta },
    { label: "debt summary rows", value: input.debtSummaries },
    { label: "debt refinance rows", value: input.debtRefinance },
    { label: "debt what-if summary", value: input.debtWhatIfSummary },
    { label: "debt warning rows", value: input.debtWarnings },
  ];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildWorkspaceScenarioVm(resultDto: ResultDtoV1 | null): WorkspaceScenarioVm {
  const scenarioTable = asArray(resultDto?.scenarios?.table).map((entry) => asRecord(entry));
  const scenariosBase = scenarioTable.find((entry) => String(entry.id ?? "") === "base") ?? {};
  const scenariosList = scenarioTable.filter((entry) => String(entry.id ?? "") !== "base");
  const scenariosBaseSummary = asRecord(asRecord(scenariosBase).summary);
  const comparisonRows = scenariosList.map((scenario) => {
    const summary = asRecord(scenario.summary);
    const summarySource = Object.keys(summary).length > 0 ? summary : scenario;
    const diffVsBase = asRecord(scenario.diffVsBase);
    const diffMetrics = asRecord(diffVsBase.keyMetrics);
    const shortWhy = asArray(diffVsBase.shortWhy).map((entry) => String(entry));
    return {
      id: String(scenario.id ?? ""),
      title: String(scenario.title ?? "시나리오"),
      endNetWorthKrw: Number(summarySource.endNetWorthKrw ?? summarySource.endNetWorth ?? 0),
      worstCashKrw: Number(summarySource.worstCashKrw ?? 0),
      goalsAchieved: Number(summarySource.goalsAchievedCount ?? summarySource.goalsAchieved ?? 0),
      warningsCount: Number(summarySource.warningsCount ?? 0),
      endNetWorthDeltaKrw: Number(diffMetrics.endNetWorthDeltaKrw ?? scenario.endNetWorthDeltaKrw ?? 0),
      goalsAchievedDelta: Number(diffMetrics.goalsAchievedDelta ?? scenario.goalsAchievedDelta ?? 0),
      shortWhy,
    };
  });

  return {
    baseSummary: {
      endNetWorthKrw: Number(scenariosBaseSummary.endNetWorthKrw ?? scenariosBaseSummary.endNetWorth ?? 0),
      worstCashKrw: Number(scenariosBaseSummary.worstCashKrw ?? 0),
      goalsAchieved: Number(scenariosBaseSummary.goalsAchievedCount ?? scenariosBaseSummary.goalsAchieved ?? 0),
      warningsCount: Number(scenariosBaseSummary.warningsCount ?? 0),
    },
    baseWarnings: asArray(resultDto?.warnings.top).map((entry) => ({
      reasonCode: String(asRecord(entry).code ?? ""),
      message: String(asRecord(entry).message ?? ""),
    })),
    comparisonRows,
  };
}

export function buildWorkspaceDebtVm(resultDto: ResultDtoV1 | null): WorkspaceDebtVm {
  const debtData = asRecord(resultDto?.debt);
  const debtWhatIf = asRecord(debtData.whatIf);
  const debtWarningsRaw = asArray(
    debtData.warnings ?? asRecord(asRecord(resultDto?.raw).debt).warnings,
  ).map((entry) => asRecord(entry));

  return {
    meta: {
      debtServiceRatio: typeof debtData.dsrPct === "number"
        ? (debtData.dsrPct > 1 ? debtData.dsrPct / 100 : debtData.dsrPct)
        : 0,
      totalMonthlyPaymentKrw: Number(
        debtData.totalMonthlyPaymentKrw
        ?? asRecord(asRecord(asRecord(resultDto?.raw).debt).summary).totalMonthlyPaymentKrw
        ?? 0,
      ),
    },
    summaries: asArray(debtData.summaries).map((entry) => asRecord(entry)),
    refinance: asArray(debtData.refinance).map((entry) => asRecord(entry)),
    whatIfSummary: buildDebtWhatIfSummary({
      termExtensionsCount: asArray(debtWhatIf.termExtensions).length,
      termReductionsCount: asArray(debtWhatIf.termReductions).length,
      extraPaymentsCount: asArray(debtWhatIf.extraPayments).length,
    }),
    warnings: aggregateGuideWarnings(debtWarningsRaw.map((warning) => ({
      reasonCode: warning.code,
      message: warning.message,
      data: warning.data,
    }))),
  };
}

export function buildWorkspaceMonteCarloVm(resultDto: ResultDtoV1 | null): WorkspaceMonteCarloVm {
  const data = asRecord(resultDto?.monteCarlo);
  const probabilities = asRecord(data.probabilities);
  const percentiles = asRecord(data.percentiles);
  const depletionProbability = typeof probabilities.retirementDepletionBeforeEnd === "number"
    ? probabilities.retirementDepletionBeforeEnd
    : undefined;

  return {
    data,
    probabilities,
    percentiles: {
      endNetWorthKrw: asRecord(percentiles.endNetWorthKrw),
      worstCashKrw: asRecord(percentiles.worstCashKrw),
    },
    ...(typeof depletionProbability === "number" ? { depletionProbability } : {}),
  };
}

export function buildWorkspaceActionsVm(resultDto: ResultDtoV1 | null): WorkspaceActionsVm {
  const actionsRow = asRecord(resultDto?.actions);
  const items = asArray(actionsRow.items);
  const tableRows = items.map((entry) => {
    const row = asRecord(entry);
    const whyRows = asArray(row.why);
    const steps = asArray(row.steps).map((step) => String(step).trim()).filter((step) => step.length > 0);
    const cautions = asArray(row.cautions).map((caution) => String(caution).trim()).filter((caution) => caution.length > 0);

    return {
      code: String(row.code ?? "UNKNOWN"),
      severity: String(row.severity ?? "info"),
      title: String(row.title ?? "권장 조치"),
      summary: String(row.summary ?? "").trim(),
      whyCount: whyRows.length,
      steps,
      cautions,
    };
  });

  return {
    topActionTitles: asArray(actionsRow.top3)
      .map((entry) => String(asRecord(entry).title ?? "").trim())
      .filter((title) => title.length > 0)
      .slice(0, 3),
    tableRows,
    topActionsForInsight: asArray(actionsRow.top3).map((entry) => asRecord(entry) as ActionItemV2),
  };
}

export function buildWorkspaceResultSummaryVm(input: {
  resultDto: ResultDtoV1 | null;
  debtMonthlyPaymentKrw?: number;
}): WorkspaceResultSummaryVm {
  const { resultDto, debtMonthlyPaymentKrw } = input;
  if (!resultDto) {
    return {
      simulateTimeline: [],
      simulateWarnings: [],
      simulateGoals: [],
      chartPoints: [],
      chartMode: "none",
      aggregatedWarningsForInsight: [],
      aggregatedWarnings: [],
      goalTableRows: [],
      goalsForInsight: [],
      timelineSummaryRows: [],
      achievedGoalCount: 0,
      summaryEndNetWorthKrw: 0,
      summaryWorstCashKrw: 0,
      summaryWorstCashMonth: 0,
      summaryGoalsText: "-",
      summaryDsr: 0,
      summaryEvidence: {},
      summaryCriticalWarnings: 0,
      warningsSummaryTop5: [],
      guideBadge: buildWorkspaceGuideBadge({
        summaryWorstCashKrw: 0,
        hasNegativeCashflow: false,
        dtoDsrRatio: 0,
        missedGoals: 0,
        contributionSkippedCount: 0,
      }),
      keyFindings: [],
    };
  }

  const simulateRow = asRecord(resultDto.raw?.simulate);
  const simulateTimeline = asArray(simulateRow.timeline ?? simulateRow.timelineSampled).map((entry) => asRecord(entry));
  const keyTimelinePoints = resultDto.timeline.points.map((point) => ({
    monthIndex: point.monthIndex,
    row: {
      income: point.incomeKrw ?? 0,
      expenses: point.expensesKrw ?? 0,
      debtPayment: point.debtPaymentKrw ?? 0,
      operatingCashflow: 0,
      liquidAssets: point.cashKrw ?? 0,
      netWorth: point.netWorthKrw ?? 0,
      totalDebt: point.totalDebtKrw ?? 0,
    },
  }));
  const chartPoints = buildPlanningChartPoints({
    timeline: simulateTimeline,
    keyTimelinePoints,
  });
  const chartMode: "full" | "key" | "none" = simulateTimeline.length > 3
    ? "full"
    : chartPoints.length > 0
      ? "key"
      : "none";
  const simulateWarnings = asArray(simulateRow.warnings).map((entry) => asRecord(entry));
  const simulateGoals = asArray(simulateRow.goalStatus ?? simulateRow.goalsStatus).map((entry) => asRecord(entry));
  const aggregatedWarningsForInsight = resultDto.warnings.aggregated.map((warning) => {
    const severity: "info" | "warn" | "critical" = warning.severity === "critical" || warning.severity === "warn"
      ? warning.severity
      : "info";
    return {
      code: warning.code,
      severity,
      count: warning.count,
      ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
      ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
      sampleMessage: warning.sampleMessage ?? `${warning.code} 경고가 감지되었습니다.`,
    };
  });
  const aggregatedWarnings = aggregatedWarningsForInsight.map((warning) => ({
    ...warning,
    ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth + 1 } : {}),
    ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth + 1 } : {}),
  }));
  const goalTableRows = resultDto.goals.map((goal) => {
    const target = Number(goal.targetKrw ?? 0);
    const current = Number(goal.currentKrw ?? 0);
    const shortfall = Number(goal.shortfallKrw ?? Math.max(0, target - current));
    const progressPct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
    return {
      goalId: goal.id,
      name: goal.title,
      achieved: goal.achieved === true,
      targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
      progressPct,
      shortfallKrw: shortfall,
      interpretation: String(goal.comment ?? (goal.achieved ? "기한 내 목표를 달성했습니다." : "기한 내 달성을 위해 추가 조정이 필요합니다.")),
    };
  });
  const goalsForInsight = resultDto.goals.map((goal) => ({
    name: goal.title,
    targetAmount: Number(goal.targetKrw ?? 0),
    currentAmount: Number(goal.currentKrw ?? 0),
    shortfall: Number(goal.shortfallKrw ?? 0),
    targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
    achieved: goal.achieved === true,
    comment: String(goal.comment ?? ""),
  }));
  const dtoDsrRatio = typeof resultDto.summary.dsrPct === "number"
    ? (resultDto.summary.dsrPct > 1 ? resultDto.summary.dsrPct / 100 : resultDto.summary.dsrPct)
    : 0;
  const timelineSummaryRows = resultDto.timeline.points.map((row) => ({
    label: row.label === "start" ? "시작" as const : row.label === "mid" ? "중간" as const : "마지막" as const,
    monthIndex: row.monthIndex,
    month: row.monthIndex + 1,
    liquidAssetsKrw: Number(row.cashKrw ?? 0),
    netWorthKrw: Number(row.netWorthKrw ?? 0),
    totalDebtKrw: Number(row.totalDebtKrw ?? 0),
    debtServiceRatio: dtoDsrRatio,
    interpretation: "핵심 포인트 구간입니다.",
  }));

  const achievedGoalCount = goalTableRows.filter((goal) => goal.achieved).length;
  const contributionSkippedCount = aggregatedWarningsForInsight.find((warning) => warning.code === "CONTRIBUTION_SKIPPED")?.count ?? 0;
  const hasNegativeCashflow = aggregatedWarningsForInsight.some((warning) => warning.code === "NEGATIVE_CASHFLOW");
  const missedGoals = goalTableRows.filter((goal) => !goal.achieved).length;

  const guideBadge = buildWorkspaceGuideBadge({
    summaryWorstCashKrw: resultDto.summary.worstCashKrw ?? 0,
    hasNegativeCashflow,
    dtoDsrRatio,
    missedGoals,
    contributionSkippedCount,
  });

  const simulateSummary = asRecord(resultDto.summary);
  const timelineLastRow = simulateTimeline.length > 0 ? simulateTimeline[simulateTimeline.length - 1] : {};
  const summaryEndNetWorthKrw = typeof simulateSummary.endNetWorthKrw === "number"
    ? simulateSummary.endNetWorthKrw
    : Number(asRecord(timelineLastRow).netWorth ?? 0);
  const summaryWorstCashKrw = typeof simulateSummary.worstCashKrw === "number"
    ? simulateSummary.worstCashKrw
    : Number(simulateSummary.minCashKrw ?? 0);
  const summaryWorstCashMonth = typeof simulateSummary.worstCashMonthIndex === "number"
    ? Math.max(0, Math.trunc(simulateSummary.worstCashMonthIndex))
    : 0;
  const summaryGoalsAchieved = Number(asRecord(simulateSummary.goalsAchieved).achieved ?? achievedGoalCount);
  const summaryGoalsText = goalTableRows.length > 0 ? `${summaryGoalsAchieved}/${goalTableRows.length}` : "-";
  const summaryDsr = typeof simulateSummary.dsrPct === "number"
    ? (simulateSummary.dsrPct > 1 ? simulateSummary.dsrPct / 100 : simulateSummary.dsrPct)
    : 0;
  const summaryMetrics = buildResultSummaryMetrics(resultDto, {
    ...(typeof debtMonthlyPaymentKrw === "number" ? { debtMonthlyPaymentKrw } : {}),
  });
  const summaryMonthlySurplusKrw = summaryMetrics.monthlySurplusKrw;
  const summaryEmergencyFundMonths = summaryMetrics.emergencyFundMonths;
  const summaryEvidence = summaryMetrics.evidence;
  const summaryCriticalWarnings = Math.max(
    0,
    Math.trunc(Number(simulateSummary.criticalWarnings ?? resultDto.meta.health?.criticalCount ?? 0)),
  );
  const warningsSummaryTop5 = aggregatedWarnings.slice(0, 5);

  const keyFindings = buildWorkspaceKeyFindings({
    summaryWorstCashKrw,
    summaryDsr,
    totalGoals: goalTableRows.length,
    achievedGoalCount,
    aggregatedWarningsCount: aggregatedWarnings.length,
    summaryCriticalWarnings,
  });

  return {
    simulateTimeline,
    simulateWarnings,
    simulateGoals,
    chartPoints,
    chartMode,
    aggregatedWarningsForInsight,
    aggregatedWarnings,
    goalTableRows,
    goalsForInsight,
    timelineSummaryRows,
    achievedGoalCount,
    summaryEndNetWorthKrw,
    summaryWorstCashKrw,
    summaryWorstCashMonth,
    summaryGoalsText,
    summaryDsr,
    ...(typeof summaryMonthlySurplusKrw === "number" ? { summaryMonthlySurplusKrw } : {}),
    ...(typeof summaryEmergencyFundMonths === "number" ? { summaryEmergencyFundMonths } : {}),
    summaryEvidence,
    summaryCriticalWarnings,
    warningsSummaryTop5,
    guideBadge,
    keyFindings,
  };
}
