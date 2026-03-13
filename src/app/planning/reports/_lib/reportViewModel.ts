import { type ActionItemV2 } from "../../../../lib/planning/v2/actions/types";
import { type GoalRow } from "../../../../lib/planning/v2/report/mapGoals";
import { type TimelineRow } from "../../../../lib/planning/v2/report/pickTimelinePoints";
import {
  buildResultDtoV1FromRunRecord,
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
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "../../../../lib/planning/v2/normalizationDisclosure";
import { type CalcEvidence } from "../../../../lib/planning/calc";
import { buildResultSummaryMetrics } from "../../../../lib/planning/v2/resultSummary";
import { buildEvidence, type EvidenceItem } from "../../../../lib/planning/v2/insights/evidence";
import {
  mapGoalStatus,
  pickKeyTimelinePoints,
  resolveResultBadge,
  type AggregatedWarningRow,
  type GoalStatusRow,
  type ResultBadgeSummary,
  type TimelinePointRow,
} from "../../../../lib/planning/v2/resultGuide";
import { aggregateWarningsByUniqueMonth, type DashboardWarningAggRow } from "./warningAggregation";
import { resolveWarningCatalog, warningFallbackMessage } from "./warningCatalog";
import {
  buildReportInputContractFromRun,
  type ReportContractFallbackSource,
  resolveReportResultDtoFromRun as resolveCanonicalReportResultDtoFromRun,
  type BuildReportInputContractOptions,
  type ReportInputContract,
} from "../../../../lib/planning/reports/reportInputContract";
import { DEFAULT_PLANNING_POLICY } from "../../../../lib/planning/catalog/planningPolicy";

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

export type ReportActionRow = {
  code: string;
  title: string;
  summary: string;
  severity: "critical" | "warn" | "info";
  whyCount: number;
  steps: string[];
  cautions: string[];
};

export type ReportScenarioRow = {
  id: string;
  title: string;
  endNetWorthKrw: number;
  worstCashKrw: number;
  goalsAchievedCount: number;
  warningsCount: number;
  endNetWorthDeltaKrw: number;
  interpretation: string;
};

export type ReportMonteProbabilityRow = {
  label: string;
  value: string;
  interpretation: string;
};

export type ReportMontePercentileRow = {
  metric: string;
  p10: number;
  p50: number;
  p90: number;
};

export type ReportDebtSummaryRow = {
  liabilityId: string;
  name: string;
  repaymentType: string;
  principalKrw: number;
  aprPct?: number;
  monthlyPaymentKrw: number;
  monthlyInterestKrw: number;
  totalInterestRemainingKrw: number;
  payoffMonthIndex?: number;
};

export type MonthlyOperatingGuideSplit = {
  title: string;
  amountKrw: number;
  sharePct: number;
  tone: "slate" | "amber" | "rose" | "emerald";
  description: string;
};

export type MonthlyOperatingGuidePlan = {
  title: string;
  amountKrw?: number;
  sharePct?: number;
  tone: "slate" | "amber" | "rose" | "emerald";
  description: string;
};

type ReportSummaryEvidence = {
  monthlySurplusKrw?: CalcEvidence;
  dsrPct?: CalcEvidence;
  emergencyFundMonths?: CalcEvidence;
};

export type ReportVM = {
  header: { reportId: string; createdAt: string; runId: string };
  assumptionsLines: string[];
  contract?: {
    engineSchemaVersion: number;
    fallbacks: ReportContractFallbackSource[];
  };
  stage: {
    overallStatus?: PlanningRunOverallStatus;
    byId: Partial<Record<PlanningRunStageId, PlanningRunStageResult>>;
  };
  snapshot: { id?: string; asOf?: string; fetchedAt?: string; missing?: boolean; staleDays?: number };
  normalization?: ProfileNormalizationDisclosure;
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
  monthlyOperatingGuide?: {
    headline: string;
    basisLabel: string;
    currentSplit: MonthlyOperatingGuideSplit[];
    nextPlanTitle: string;
    nextPlan: MonthlyOperatingGuidePlan[];
  };
  evidence?: {
    summary: ReportSummaryEvidence;
    items: EvidenceItem[];
  };
  warningAgg: DashboardWarningAggRow[];
  goalsTable: GoalRow[];
  topActions: ActionItemV2[];
  actionRows: ReportActionRow[];
  timelinePoints: TimelineRow[];
  guide: {
    warnings: AggregatedWarningRow[];
    goals: GoalStatusRow[];
    timelineSummaryRows: TimelinePointRow[];
    badge: ResultBadgeSummary;
  };
  scenarioRows: ReportScenarioRow[];
  monteCarloSummary?: {
    keyProbs: MonteCarloKeyProb[];
    percentiles: MonteCarloPercentile[];
    notes: string[];
  };
  monteProbabilityRows: ReportMonteProbabilityRow[];
  montePercentileRows: ReportMontePercentileRow[];
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
  debtSummaryRows: ReportDebtSummaryRow[];
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
    summaryEvidence?: ReportSummaryEvidence;
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

export type SafeReportVMBuildResult = {
  vm: ReportVM | null;
  error: string | null;
};

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

function toSharePct(amountKrw: number, incomeKrw: number): number {
  if (!(incomeKrw > 0)) return 0;
  return Math.max(0, (amountKrw / incomeKrw) * 100);
}

function toRoundedKrw(value: number): number {
  return Math.max(0, Math.round(value));
}

function deriveSummaryMetricFallback(run: PlanningRunRecord | null, dto: ResultDtoV1): {
  monthlyIncomeKrw?: number;
  monthlyExpensesKrw?: number;
  monthlyDebtPaymentKrw?: number;
} | undefined {
  if (!run) return undefined;
  const start = dto.timeline.points.find((point) => point.label === "start") ?? dto.timeline.points[0];
  const engineTrace = asRecord(
    asRecord(
      asRecord(run.outputs.engine).financialStatus,
    ).trace,
  );
  const simulateTrace = asRecord(
    asRecord(
      asRecord(run.outputs.simulate).financialStatus,
    ).trace,
  );
  const trace = Object.keys(engineTrace).length > 0 ? engineTrace : simulateTrace;
  if (Object.keys(trace).length < 1) return undefined;

  const savingCapacityKrw = asNumber(trace.savingCapacity);
  const emergencyFundTargetKrw = asNumber(trace.emergencyFundTarget);
  const monthlyExpensesKrw = typeof emergencyFundTargetKrw === "number" && emergencyFundTargetKrw > 0
    ? Math.round(emergencyFundTargetKrw / 6)
    : undefined;
  const monthlyIncomeKrw = typeof savingCapacityKrw === "number" && typeof monthlyExpensesKrw === "number"
    ? Math.round(savingCapacityKrw + monthlyExpensesKrw)
    : undefined;
  const monthlyDebtPaymentKrw = asNumber(start?.debtPaymentKrw);

  if (
    typeof monthlyIncomeKrw !== "number"
    && typeof monthlyExpensesKrw !== "number"
    && typeof monthlyDebtPaymentKrw !== "number"
  ) {
    return undefined;
  }

  return {
    ...(typeof monthlyIncomeKrw === "number" ? { monthlyIncomeKrw } : {}),
    ...(typeof monthlyExpensesKrw === "number" ? { monthlyExpensesKrw } : {}),
    ...(typeof monthlyDebtPaymentKrw === "number" ? { monthlyDebtPaymentKrw } : {}),
  };
}

function buildMonthlyOperatingGuide(input: {
  summaryMetrics: ReturnType<typeof buildResultSummaryMetrics>;
  policy: PlanningInterpretationPolicy;
}): ReportVM["monthlyOperatingGuide"] | undefined {
  const monthlyInputs = input.summaryMetrics.evidence.monthlySurplusKrw?.inputs;
  const incomeKrw = asNumber(monthlyInputs?.monthlyIncomeKrw);
  const expensesKrw = asNumber(monthlyInputs?.monthlyExpensesKrw);
  const debtPaymentKrw = asNumber(monthlyInputs?.monthlyDebtPaymentKrw) ?? asNumber(input.summaryMetrics.totalMonthlyDebtPaymentKrw);
  const surplusKrw = asNumber(input.summaryMetrics.monthlySurplusKrw);
  const emergencyFundMonths = asNumber(input.summaryMetrics.emergencyFundMonths);
  const dsrPct = asNumber(input.summaryMetrics.dsrPct);

  if (
    typeof incomeKrw !== "number"
    || typeof expensesKrw !== "number"
    || typeof debtPaymentKrw !== "number"
    || typeof surplusKrw !== "number"
  ) {
    return undefined;
  }

  const currentSplit: MonthlyOperatingGuideSplit[] = [
    {
      title: "생활비/고정운영",
      amountKrw: expensesKrw,
      sharePct: toSharePct(expensesKrw, incomeKrw),
      tone: expensesKrw > incomeKrw * 0.65 ? "amber" : "slate",
      description: "매달 기본적으로 나가는 생활비와 운영비입니다.",
    },
    {
      title: "대출 상환",
      amountKrw: debtPaymentKrw,
      sharePct: toSharePct(debtPaymentKrw, incomeKrw),
      tone: typeof dsrPct === "number" && dsrPct >= input.policy.dsr.cautionPct ? "amber" : "slate",
      description: "줄이기 어렵다면 만기·금리·대환 가능성까지 같이 점검할 항목입니다.",
    },
    {
      title: surplusKrw >= 0 ? "남는 돈" : "부족한 돈",
      amountKrw: Math.abs(surplusKrw),
      sharePct: toSharePct(Math.abs(surplusKrw), incomeKrw),
      tone: surplusKrw < 0 ? "rose" : "emerald",
      description: surplusKrw < 0
        ? "현재 구조로는 매달 이만큼이 비어 적자 해소가 우선입니다."
        : "이 금액이 앞으로의 비상금·목표저축·여유예산 재원이 됩니다.",
    },
  ];

  if (surplusKrw < 0) {
    return {
      headline: "지금은 새 저축보다 적자부터 막는 운영이 우선입니다.",
      basisLabel: `월 수입에서 생활비와 대출상환을 빼면 매달 ${Math.abs(surplusKrw).toLocaleString("ko-KR")}원 부족합니다.`,
      currentSplit,
      nextPlanTitle: "우선 복구 순서",
      nextPlan: [
        {
          title: "줄여야 하는 적자",
          amountKrw: Math.abs(surplusKrw),
          sharePct: 100,
          tone: "rose",
          description: "매달 이 금액만큼 줄여야 흑자 0원 구간으로 돌아옵니다. 새 투자·목표저축보다 먼저 막는 편이 안전합니다.",
        },
        {
          title: "생활비부터 점검",
          amountKrw: expensesKrw,
          sharePct: toSharePct(expensesKrw, incomeKrw),
          tone: "amber",
          description: "구독, 식비, 고정비처럼 바로 줄일 수 있는 항목부터 점검하는 편이 현실적입니다.",
        },
        {
          title: "대출 구조 재점검",
          amountKrw: debtPaymentKrw,
          sharePct: toSharePct(debtPaymentKrw, incomeKrw),
          tone: typeof dsrPct === "number" && dsrPct >= input.policy.dsr.cautionPct ? "amber" : "slate",
          description: "상환 부담이 큰 편이면 금리·만기·대환 가능성을 같이 보는 편이 좋습니다.",
        },
      ],
    };
  }

  let reserveShare = 0.4;
  let goalShare = 0.4;
  let flexShare = 0.2;
  let headline = "남는 돈은 비상금, 목표저축, 여유예산으로 나눠 운영하는 편이 안정적입니다.";
  let basisLabel = `현재 매달 남는 돈 ${surplusKrw.toLocaleString("ko-KR")}원을 기준으로 한 운영안입니다.`;

  if (typeof emergencyFundMonths === "number" && emergencyFundMonths < input.policy.emergencyFundMonths.caution) {
    reserveShare = 0.6;
    goalShare = 0.25;
    flexShare = 0.15;
    headline = "지금은 남는 돈을 비상금부터 채우는 운영이 더 안전합니다.";
    basisLabel = `비상금이 ${input.policy.emergencyFundMonths.caution}개월보다 적어, 남는 돈 ${surplusKrw.toLocaleString("ko-KR")}원 중 비상금 비중을 높게 잡았습니다.`;
  } else if (typeof dsrPct === "number" && dsrPct >= input.policy.dsr.cautionPct && debtPaymentKrw > 0) {
    reserveShare = 0.4;
    goalShare = 0.35;
    flexShare = 0.25;
    headline = "남는 돈은 비상금과 부채 부담 완화 쪽에 먼저 배분하는 편이 좋습니다.";
    basisLabel = `대출 상환 비중이 큰 편이라, 남는 돈 ${surplusKrw.toLocaleString("ko-KR")}원을 안전자금과 상환여력 확보에 우선 배분했습니다.`;
  }

  const reserveAmount = toRoundedKrw(surplusKrw * reserveShare);
  const goalAmount = toRoundedKrw(surplusKrw * goalShare);
  const flexAmount = Math.max(0, surplusKrw - reserveAmount - goalAmount);

  const goalTitle = typeof dsrPct === "number" && dsrPct >= input.policy.dsr.cautionPct && debtPaymentKrw > 0
    ? "추가상환/대환 준비"
    : "목표저축";
  const goalDescription = goalTitle === "추가상환/대환 준비"
    ? "상환 부담을 낮추는 데 쓸 여유분입니다. 바로 상환하지 않더라도 대환·수수료·예상절감액 비교 재원으로 쓸 수 있습니다."
    : "여행·주거·은퇴처럼 중장기 목표를 위해 따로 떼어두는 금액입니다.";

  return {
    headline,
    basisLabel,
    currentSplit,
    nextPlanTitle: "남는 돈 운영안",
    nextPlan: [
      {
        title: "비상금/안전자금",
        amountKrw: reserveAmount,
        sharePct: reserveShare * 100,
        tone: "emerald",
        description: "예상 밖 지출이나 소득 변동을 버티기 위한 우선 재원입니다.",
      },
      {
        title: goalTitle,
        amountKrw: goalAmount,
        sharePct: goalShare * 100,
        tone: goalTitle === "추가상환/대환 준비" ? "amber" : "slate",
        description: goalDescription,
      },
      {
        title: "자유예산",
        amountKrw: flexAmount,
        sharePct: flexShare * 100,
        tone: "slate",
        description: "갑작스러운 약속, 취미, 작은 보상처럼 생활의 유연성을 위한 금액입니다.",
      },
    ],
  };
}

function toPolicyLabel(value: unknown): string {
  const raw = asString(value);
  if (raw === "balanced") return "균형형";
  if (raw === "safety") return "안정형";
  if (raw === "growth") return "성장형";
  return raw || "기본값";
}

function toRepaymentTypeLabel(value: unknown): string {
  const raw = asString(value);
  if (raw === "amortizing") return "원리금 분할상환";
  if (raw === "interestOnly") return "이자만 상환";
  return raw || "-";
}

function applyReportInputContractToRun(
  run: PlanningRunRecord,
  contract: ReportInputContract,
): PlanningRunRecord {
  const outputs = asRecord(run.outputs);
  const simulate = asRecord(outputs.simulate);

  return {
    ...run,
    outputs: {
      ...outputs,
      engineSchemaVersion: contract.engineSchemaVersion,
      resultDto: contract.resultDto,
      simulate: {
        ...simulate,
        engine: contract.engine,
      },
    } as PlanningRunRecord["outputs"],
  };
}

export function buildReportVMFromContract(
  contract: ReportInputContract,
  run: PlanningRunRecord | null,
  report?: ReportLike,
): ReportVM {
  if (!run) {
    return {
      ...buildReportVM(null, {
        ...report,
        runId: contract.runId,
      }),
      contract: {
        engineSchemaVersion: contract.engineSchemaVersion,
        fallbacks: contract.fallbacks,
      },
    };
  }
  const runWithContract = applyReportInputContractToRun(run, contract);
  return {
    ...buildReportVM(runWithContract, report),
    contract: {
      engineSchemaVersion: contract.engineSchemaVersion,
      fallbacks: contract.fallbacks,
    },
  };
}

export function buildReportVMFromRun(
  run: PlanningRunRecord | null,
  report?: ReportLike,
  options: BuildReportInputContractOptions = {},
): ReportVM {
  if (!run) {
    return buildReportVM(null, report);
  }

  const contract = buildReportInputContractFromRun(run, options);
  return buildReportVMFromContract(contract, run, report);
}

export function safeBuildReportVMFromRun(
  run: PlanningRunRecord | null,
  report?: ReportLike,
  options: BuildReportInputContractOptions = {},
): SafeReportVMBuildResult {
  try {
    return {
      vm: buildReportVMFromRun(run, report, options),
      error: null,
    };
  } catch (error) {
    const contractError = error instanceof Error ? error.message : "리포트 데이터를 해석하지 못했습니다.";
    if (run) {
      try {
        const fallbackVm = buildReportVM(run, report);
        const rawEngineSchemaVersion = asNumber(asRecord(run.outputs).engineSchemaVersion);
        const fallbackSource: ReportContractFallbackSource = contractError.includes("engine envelope is missing")
          ? "legacyEngineFallback"
          : contractError.includes("resultDto is missing")
            ? "legacyResultDtoFallback"
            : "contractBuildFailureFallback";
        return {
          vm: {
            ...fallbackVm,
            contract: {
              engineSchemaVersion: typeof rawEngineSchemaVersion === "number" && rawEngineSchemaVersion >= 1
                ? Math.trunc(rawEngineSchemaVersion)
                : 0,
              fallbacks: [fallbackSource],
            },
          },
          error: null,
        };
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "리포트 fallback 구성에 실패했습니다.";
        return {
          vm: null,
          error: `${contractError} / fallback: ${fallbackMessage}`,
        };
      }
    }
    return {
      vm: null,
      error: contractError,
    };
  }
}

export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord,
  options?: BuildReportInputContractOptions,
): ResultDtoV1;
export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord | null,
  options?: BuildReportInputContractOptions,
): ResultDtoV1 | null;
export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord | null,
  options: BuildReportInputContractOptions = {},
): ResultDtoV1 | null {
  return resolveCanonicalReportResultDtoFromRun(run, options);
}

function toResultDto(run: PlanningRunRecord): ResultDtoV1 {
  try {
    return resolveCanonicalReportResultDtoFromRun(run);
  } catch {
    return buildResultDtoV1FromRunRecord(run);
  }
}

function toAssumptionLines(run: PlanningRunRecord | null): string[] {
  if (!run) return [];
  const lines: string[] = [];
  lines.push(`기간: ${run.input.horizonMonths}개월`);
  lines.push(`배분 정책: ${toPolicyLabel(run.input.policyId)}`);
  if (run.input.snapshotId) {
    lines.push(`요청 스냅샷 ID: ${run.input.snapshotId}`);
  }
  const overrides = asRecord(run.input.assumptionsOverride);
  const inflation = asNumber(overrides.inflationPct) ?? asNumber(overrides.inflation);
  const expectedReturn = asNumber(overrides.expectedReturnPct)
    ?? asNumber(overrides.investReturnPct)
    ?? asNumber(overrides.expectedReturn);
  const cashReturn = asNumber(overrides.cashReturnPct);
  const withdrawalRate = asNumber(overrides.withdrawalRatePct);
  if (typeof inflation === "number") lines.push(`인플레이션 가정: ${inflation.toFixed(1)}%`);
  if (typeof expectedReturn === "number") lines.push(`투자수익률 가정: ${expectedReturn.toFixed(1)}%`);
  if (typeof cashReturn === "number") lines.push(`현금수익률 가정: ${cashReturn.toFixed(1)}%`);
  if (typeof withdrawalRate === "number") lines.push(`인출률 가정: ${withdrawalRate.toFixed(1)}%`);
  return lines;
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
  const rawWarnings = asArray(dto.debt.warnings).map((entry) => asRecord(entry));
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
      totalMonthlyPaymentKrw: asNumber(dto.debt.totalMonthlyPaymentKrw) ?? 0,
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

function toGuideWarnings(rows: DashboardWarningAggRow[]): AggregatedWarningRow[] {
  return rows.map((row) => ({
    code: row.code,
    severity: row.severityMax,
    count: row.count,
    ...(typeof row.firstMonth === "number" ? { firstMonth: row.firstMonth + 1 } : {}),
    ...(typeof row.lastMonth === "number" ? { lastMonth: row.lastMonth + 1 } : {}),
    sampleMessage: asString(row.sampleMessage) || warningFallbackMessage(row.code),
  }));
}

function toGuideGoals(dto: ResultDtoV1): GoalStatusRow[] {
  return mapGoalStatus(dto.goals.map((goal) => ({
    goalId: goal.id,
    name: goal.title,
    achieved: goal.achieved,
    targetMonth: goal.targetMonth,
    targetAmount: goal.targetKrw,
    currentAmount: goal.currentKrw,
    shortfall: goal.shortfallKrw,
  })));
}

function toGuideTimelineRows(timelinePoints: TimelineRow[], dsrPct: number | undefined): TimelinePointRow[] {
  const dsrRatio = typeof dsrPct === "number"
    ? (dsrPct > 1 ? dsrPct / 100 : dsrPct)
    : 0;
  return pickKeyTimelinePoints(timelinePoints.map((point) => ({
    month: point.monthIndex + 1,
    liquidAssets: asNumber(point.cash) ?? 0,
    netWorth: asNumber(point.netWorth) ?? 0,
    totalDebt: asNumber(point.totalDebt) ?? 0,
    debtServiceRatio: dsrRatio,
  })));
}

function toGuideBadge(
  timelinePoints: TimelineRow[],
  warnings: AggregatedWarningRow[],
  goals: GoalStatusRow[],
  dsrPct: number | undefined,
): ResultBadgeSummary {
  const dsrRatio = typeof dsrPct === "number"
    ? (dsrPct > 1 ? dsrPct / 100 : dsrPct)
    : 0;
  return resolveResultBadge({
    timeline: timelinePoints.map((point) => ({
      month: point.monthIndex + 1,
      liquidAssets: asNumber(point.cash) ?? 0,
      netWorth: asNumber(point.netWorth) ?? 0,
      totalDebt: asNumber(point.totalDebt) ?? 0,
      debtServiceRatio: dsrRatio,
    })),
    warnings,
    goals,
  });
}

function toTopActions(dto: ResultDtoV1): ActionItemV2[] {
  return (dto.actions?.top3 ?? []).slice(0, 3).map((action) => ({
    ...action,
    candidates: undefined,
  }));
}

function toActionRows(dto: ResultDtoV1, run: PlanningRunRecord | null): ReportActionRow[] {
  const rows = dto?.actions?.items
    ? dto.actions.items as unknown[]
    : asArray(asRecord(run?.outputs?.actions).actions);
  const severityOrder: Record<ReportActionRow["severity"], number> = {
    critical: 0,
    warn: 1,
    info: 2,
  };
  return rows.map((row, index) => {
    const record = asRecord(row);
    const severityRaw = asString(record.severity);
    const severity: ReportActionRow["severity"] = severityRaw === "critical" || severityRaw === "warn" ? severityRaw : "info";
    const whyCount = asArray(record.why).length;
    const steps = asArray(record.steps).map((item) => {
      if (typeof item === "string") return item.trim();
      const stepRecord = asRecord(item);
      return asString(stepRecord.text) || asString(stepRecord.title) || asString(stepRecord.description);
    }).filter((item) => item.length > 0);
    const cautions = asArray(record.cautions).map((item) => {
      if (typeof item === "string") return item.trim();
      return asString(asRecord(item).text);
    }).filter((item) => item.length > 0);
    return {
      code: asString(record.code) || `ACTION_${index + 1}`,
      title: asString(record.title) || `액션 ${index + 1}`,
      summary: asString(record.summary),
      severity,
      whyCount,
      steps,
      cautions,
    };
  }).sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.code.localeCompare(b.code);
  });
}

function toScenarioRows(dto: ResultDtoV1, run: PlanningRunRecord | null): ReportScenarioRow[] {
  const scenarios = dto?.scenarios ? asRecord(dto.scenarios) : asRecord(run?.outputs?.scenarios);
  const table = asArray(scenarios.table);
  const shortWhyByScenario = asRecord(scenarios.shortWhyByScenario);
  return table.map((row, index) => {
    const record = asRecord(row);
    const id = asString(record.id) || `scenario-${index + 1}`;
    const diffVsBase = asRecord(record.diffVsBase);
    const whyRows = asArray(shortWhyByScenario[id]).map((item) => asString(item)).filter((item) => item.length > 0);
    return {
      id,
      title: asString(record.title) || id,
      endNetWorthKrw: asNumber(record.endNetWorthKrw) ?? 0,
      goalsAchievedCount: asNumber(record.goalsAchievedCount) ?? 0,
      warningsCount: asNumber(record.warningsCount) ?? 0,
      worstCashKrw: asNumber(record.worstCashKrw) ?? 0,
      endNetWorthDeltaKrw: asNumber(record.endNetWorthDeltaKrw) ?? asNumber(diffVsBase.endNetWorthDeltaKrw) ?? 0,
      interpretation: whyRows[0] || "기준 대비 순자산/경고 변화를 함께 확인하세요.",
    };
  });
}

function toMonteProbabilityRows(summary: ReportVM["monteCarloSummary"] | undefined): ReportMonteProbabilityRow[] {
  const rows: ReportMonteProbabilityRow[] = [];
  for (const item of summary?.keyProbs ?? []) {
    const value = `${Math.round(item.probability * 100)}%`;
    if (item.key === "retirementDepletionBeforeEnd") {
      rows.push({
        label: item.label,
        value,
        interpretation: "기간 종료 전에 자산이 고갈될 가능성입니다. 비중이 높으면 지출/적립 조정이 필요합니다.",
      });
      continue;
    }
    rows.push({
      label: item.label,
      value,
      interpretation: "확률값이므로 단일 시점 보장값으로 해석하면 안 됩니다.",
    });
  }
  return rows;
}

function toMontePercentileRows(summary: ReportVM["monteCarloSummary"] | undefined): ReportMontePercentileRow[] {
  return (summary?.percentiles ?? []).flatMap((row) => {
    if (typeof row.p10 !== "number" || typeof row.p50 !== "number" || typeof row.p90 !== "number") {
      return [];
    }
    return [{
      metric: row.metric,
      p10: row.p10,
      p50: row.p50,
      p90: row.p90,
    }];
  });
}

function toDebtSummaryRows(debtSummary: ReportVM["debtSummary"] | undefined): ReportDebtSummaryRow[] {
  return asArray(debtSummary?.summaries).map((row, index) => {
    const record = asRecord(row);
    const aprPct = asNumber(record.aprPct);
    const payoffMonthIndex = asNumber(record.payoffMonthIndex);
    return {
      liabilityId: asString(record.liabilityId) || `debt-${index + 1}`,
      name: asString(record.name) || "부채",
      repaymentType: toRepaymentTypeLabel(record.type ?? record.repaymentType),
      principalKrw: asNumber(record.principalKrw) ?? 0,
      ...(typeof aprPct === "number" ? { aprPct } : {}),
      monthlyPaymentKrw: asNumber(record.monthlyPaymentKrw) ?? 0,
      monthlyInterestKrw: asNumber(record.monthlyInterestKrw) ?? 0,
      totalInterestRemainingKrw: asNumber(record.totalInterestRemainingKrw) ?? 0,
      ...(typeof payoffMonthIndex === "number" ? { payoffMonthIndex } : {}),
    };
  });
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
      assumptionsLines: [],
      stage: {
        byId: {},
      },
      snapshot: {},
      summaryCards: {},
      warningAgg: [],
      goalsTable: [],
      topActions: [],
      actionRows: [],
      timelinePoints: [],
      guide: {
        warnings: [],
        goals: [],
        timelineSummaryRows: [],
        badge: {
          status: "ok",
          reason: "현재 가정 기준으로 주요 지표가 안정 범위입니다.",
          minCashKrw: 0,
          maxDsr: 0,
          missedGoals: 0,
          contributionSkippedCount: 0,
        },
      },
      scenarioRows: [],
      monteProbabilityRows: [],
      montePercentileRows: [],
      debtSummaryRows: [],
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
  const assumptionsLines = toAssumptionLines(run);
  const actionRows = toActionRows(dto, run);
  const scenarioRows = toScenarioRows(dto, run);
  const monteProbabilityRows = toMonteProbabilityRows(monteCarloSummary);
  const montePercentileRows = toMontePercentileRows(monteCarloSummary);
  const debtSummaryRows = toDebtSummaryRows(debtSummary);
  const summaryMetricFallback = deriveSummaryMetricFallback(run, dto);

  const summaryMetrics = buildResultSummaryMetrics(dto, {
    debtMonthlyPaymentKrw: debtSummary?.meta.totalMonthlyPaymentKrw,
    ...(summaryMetricFallback ? { fallbackStart: summaryMetricFallback } : {}),
  });
  const monthlySurplusKrw = summaryMetrics.monthlySurplusKrw;
  const emergencyFundMonths = summaryMetrics.emergencyFundMonths;
  const debtTotalKrw = summaryMetrics.debtTotalKrw;
  const totalMonthlyDebtPaymentKrw = summaryMetrics.totalMonthlyDebtPaymentKrw;
  const dtoDsrPct = asNumber(dto.summary.dsrPct);
  const dsrPct = typeof dtoDsrPct === "number" ? dtoDsrPct : summaryMetrics.dsrPct;
  const summaryEvidence: ReportSummaryEvidence = summaryMetrics.evidence;
  const guideWarnings = toGuideWarnings(warningAgg);
  const guideGoals = toGuideGoals(dto);
  const guideTimelineSummaryRows = toGuideTimelineRows(timelinePoints, dsrPct);
  const guideBadge = toGuideBadge(timelinePoints, guideWarnings, guideGoals, dsrPct);
  const totalWarnings = typeof dto.summary.totalWarnings === "number"
    ? dto.summary.totalWarnings
    : warningAgg.reduce((sum, row) => sum + row.count, 0);
  const criticalWarnings = typeof dto.summary.criticalWarnings === "number"
    ? dto.summary.criticalWarnings
    : warningAgg
      .filter((row) => row.severityMax === "critical")
      .reduce((sum, row) => sum + row.count, 0);
  const goalsAchieved = dto.summary.goalsAchieved
    ? `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}`
    : undefined;
  const reportMarkdown = asString(report?.markdown) || toMarkdownFromResultDto(dto, {
    reportId,
    runId,
  });
  const stageById = toStageById(run);
  const repro = run.reproducibility;
  const normalization = parseProfileNormalizationDisclosure(run.meta.normalization) ?? undefined;
  const evidenceItems = buildEvidence(
    {
      summaryCards: {
        ...(typeof monthlySurplusKrw === "number" ? { monthlySurplusKrw } : {}),
        ...(typeof dsrPct === "number" ? { dsrPct } : {}),
        ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
        ...(typeof totalMonthlyDebtPaymentKrw === "number" ? { totalMonthlyDebtPaymentKrw } : {}),
      },
      evidence: {
        summary: summaryEvidence,
      },
    },
    repro?.policy,
    summaryEvidence,
  );

  const keyDepletionProb = monteCarloSummary?.keyProbs.find((item) => item.key === "retirementDepletionBeforeEnd")?.probability;
  const monthlyOperatingGuide = buildMonthlyOperatingGuide({
    summaryMetrics,
    policy: repro?.policy ?? DEFAULT_PLANNING_POLICY,
  });

  return {
    header: {
      reportId,
      createdAt: reportCreatedAt,
      runId,
    },
    assumptionsLines,
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
    ...(normalization ? { normalization } : {}),
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
      ...(typeof dsrPct === "number" ? { dsrPct } : {}),
      ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
      ...(typeof debtTotalKrw === "number" ? { debtTotalKrw } : {}),
      ...(typeof totalMonthlyDebtPaymentKrw === "number" ? { totalMonthlyDebtPaymentKrw } : {}),
      ...(typeof dto.summary.endNetWorthKrw === "number" ? { endNetWorthKrw: dto.summary.endNetWorthKrw } : {}),
      ...(typeof dto.summary.worstCashKrw === "number" ? { worstCashKrw: dto.summary.worstCashKrw } : {}),
      ...(typeof dto.summary.worstCashMonthIndex === "number" ? { worstCashMonthIndex: dto.summary.worstCashMonthIndex } : {}),
      ...(goalsAchieved ? { goalsAchieved } : {}),
      ...(criticalWarnings > 0 ? { criticalWarnings } : {}),
      ...(totalWarnings > 0 ? { totalWarnings } : {}),
    },
    ...(monthlyOperatingGuide ? { monthlyOperatingGuide } : {}),
    evidence: {
      summary: summaryEvidence,
      items: evidenceItems,
    },
    warningAgg,
    goalsTable,
    topActions,
    actionRows,
    timelinePoints,
    guide: {
      warnings: guideWarnings,
      goals: guideGoals,
      timelineSummaryRows: guideTimelineSummaryRows,
      badge: guideBadge,
    },
    scenarioRows,
    ...(monteCarloSummary ? { monteCarloSummary } : {}),
    monteProbabilityRows,
    montePercentileRows,
    ...(debtSummary ? { debtSummary } : {}),
    debtSummaryRows,
    insight: {
      summaryMetrics: {
        ...(typeof monthlySurplusKrw === "number" ? { monthlySurplusKrw } : {}),
        ...(typeof emergencyFundMonths === "number" ? { emergencyFundMonths } : {}),
        ...(typeof dto.summary.endNetWorthKrw === "number" ? { endNetWorthKrw: dto.summary.endNetWorthKrw } : {}),
        ...(typeof dto.summary.worstCashKrw === "number" ? { worstCashKrw: dto.summary.worstCashKrw } : {}),
        ...(typeof dto.summary.worstCashMonthIndex === "number" ? { worstCashMonthIndex: dto.summary.worstCashMonthIndex } : {}),
        ...(typeof dsrPct === "number" ? { dsrPct } : {}),
        ...(goalsAchieved ? { goalsAchievedText: goalsAchieved } : {}),
      },
      summaryEvidence,
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
export const buildReportViewModelFromContract = buildReportVMFromContract;
export const buildReportViewModelFromRun = buildReportVMFromRun;
export const safeBuildReportViewModelFromRun = safeBuildReportVMFromRun;
