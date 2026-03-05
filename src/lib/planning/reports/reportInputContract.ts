import {
  createEngineEnvelope,
  recordPlanningFallbackUsage,
  runPlanningEngine,
  type EngineEnvelope,
  type FinancialStatus,
  type Stage,
  type StageDecision,
} from "../engine";
import { type PlanningRunRecord } from "../store/types";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
  type ResultDtoV1,
} from "../v2/resultDto";

export interface ReportInputContract {
  runId: string;
  resultDto: ResultDtoV1;
  engine: EngineEnvelope;
  engineSchemaVersion: number;
}

type BuildReportInputContractOptions = {
  allowLegacyEngineFallback?: boolean;
  allowLegacyResultDtoFallback?: boolean;
};

type ExtractedEngineEnvelope = {
  engine: EngineEnvelope;
  source: "outputs.engine" | "outputs.simulate.engine" | "outputs.simulate.legacy";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isStage(value: unknown): value is Stage {
  return value === "DEFICIT" || value === "DEBT" || value === "EMERGENCY" || value === "INVEST";
}

function isFinancialStatus(value: unknown): value is FinancialStatus {
  const row = asRecord(value);
  return isStage(row.stage) && Boolean(row.trace && typeof row.trace === "object" && !Array.isArray(row.trace));
}

function isStageDecision(value: unknown): value is StageDecision {
  const row = asRecord(value);
  return (
    typeof row.priority === "string"
    && typeof row.investmentAllowed === "boolean"
    && Array.isArray(row.warnings)
  );
}

function isEngineEnvelope(value: unknown): value is EngineEnvelope {
  const row = asRecord(value);
  return isStage(row.stage) && isFinancialStatus(row.financialStatus) && isStageDecision(row.stageDecision);
}

function resolveResultDtoFromRun(
  run: PlanningRunRecord,
  allowLegacyResultDtoFallback: boolean,
): ResultDtoV1 {
  const rawResultDto = asRecord(run.outputs).resultDto;
  if (isResultDtoV1(rawResultDto)) return rawResultDto;
  if (!allowLegacyResultDtoFallback) {
    throw new Error("resultDto is missing in run outputs");
  }
  return buildResultDtoV1FromRunRecord(run);
}

function extractEngineEnvelopeFromRun(run: PlanningRunRecord): ExtractedEngineEnvelope | null {
  const outputs = asRecord(run.outputs);
  if (isEngineEnvelope(outputs.engine)) {
    return {
      engine: outputs.engine,
      source: "outputs.engine",
    };
  }

  const simulate = asRecord(outputs.simulate);
  if (isEngineEnvelope(simulate.engine)) {
    return {
      engine: simulate.engine,
      source: "outputs.simulate.engine",
    };
  }

  const legacyStage = simulate.stage;
  const legacyFinancialStatus = simulate.financialStatus;
  const legacyStageDecision = simulate.stageDecision;
  if (isStage(legacyStage) && isFinancialStatus(legacyFinancialStatus) && isStageDecision(legacyStageDecision)) {
    return {
      engine: {
        stage: legacyStage,
        financialStatus: legacyFinancialStatus,
        stageDecision: legacyStageDecision,
      },
      source: "outputs.simulate.legacy",
    };
  }
  return null;
}

function buildLegacyEngineEnvelopeFromResultDto(resultDto: ResultDtoV1): EngineEnvelope {
  const start = resultDto.timeline.points.find((point) => point.label === "start")
    ?? resultDto.timeline.points[0];
  const emergencyGoal = resultDto.goals.find((goal) => goal.type === "emergencyFund");
  const monthlyExpense = asNumber(start?.expensesKrw) ?? 0;
  const emergencyFundMonths = (
    monthlyExpense > 0
    && typeof asNumber(emergencyGoal?.targetKrw) === "number"
  )
    ? (asNumber(emergencyGoal?.targetKrw) as number) / monthlyExpense
    : undefined;

  const status = runPlanningEngine({
    monthlyIncome: Math.max(0, asNumber(start?.incomeKrw) ?? 0),
    monthlyExpense: Math.max(0, monthlyExpense),
    liquidAssets: Math.max(0, asNumber(start?.cashKrw) ?? 0),
    debtBalance: Math.max(0, asNumber(start?.totalDebtKrw) ?? 0),
    ...(typeof emergencyFundMonths === "number" && Number.isFinite(emergencyFundMonths)
      ? { emergencyFundMonths }
      : {}),
  });

  return createEngineEnvelope({
    status: status.status,
    decision: status.decision,
  });
}

export function buildReportInputContractFromRun(
  run: PlanningRunRecord,
  options: BuildReportInputContractOptions = {},
): ReportInputContract {
  const allowLegacyEngineFallback = options.allowLegacyEngineFallback !== false;
  const allowLegacyResultDtoFallback = options.allowLegacyResultDtoFallback !== false;

  const resultDto = resolveResultDtoFromRun(run, allowLegacyResultDtoFallback);
  const extractedEngine = extractEngineEnvelopeFromRun(run);
  const usedLegacyResultDtoFallback = !extractedEngine && allowLegacyEngineFallback;
  const engine = extractedEngine?.engine
    ?? (usedLegacyResultDtoFallback ? buildLegacyEngineEnvelopeFromResultDto(resultDto) : null);

  if (engine && extractedEngine && extractedEngine.source !== "outputs.engine") {
    recordPlanningFallbackUsage("legacyReportContractFallbackCount", {
      source: `reportInput/${extractedEngine.source}`,
      runId: run.id,
    });
  }
  if (engine && usedLegacyResultDtoFallback) {
    recordPlanningFallbackUsage("legacyReportContractFallbackCount", {
      source: "reportInput/resultDtoFallback",
      runId: run.id,
    });
  }

  const rawEngineSchemaVersion = asNumber(asRecord(run.outputs).engineSchemaVersion);
  const engineSchemaVersion = typeof rawEngineSchemaVersion === "number" && rawEngineSchemaVersion >= 1
    ? Math.trunc(rawEngineSchemaVersion)
    : extractedEngine
      ? 1
      : 0;

  if (!engine) {
    throw new Error("engine envelope is missing in run outputs");
  }

  return {
    runId: run.id,
    resultDto,
    engine,
    engineSchemaVersion,
  };
}
