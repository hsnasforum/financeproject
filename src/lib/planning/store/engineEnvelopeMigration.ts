import {
  createEngineEnvelope,
  ENGINE_SCHEMA_VERSION,
  runPlanningEngine,
  type EngineEnvelope,
  type FinancialStatus,
  type Stage,
  type StageDecision,
} from "../engine";
import {
  isResultDtoV1,
  type ResultDtoV1,
} from "../v2/resultDto";
import { type PlanningRunRecord } from "./types";

type LegacyEngineSource =
  | "outputs.engine"
  | "outputs.simulate.engine"
  | "outputs.simulate.legacy"
  | "resultDtoFallback";

export type EngineEnvelopeMigrationResult = {
  run: PlanningRunRecord;
  migrated: boolean;
  source?: LegacyEngineSource;
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
  return typeof row.priority === "string" && typeof row.investmentAllowed === "boolean" && Array.isArray(row.warnings);
}

function isEngineEnvelope(value: unknown): value is EngineEnvelope {
  const row = asRecord(value);
  return isStage(row.stage) && isFinancialStatus(row.financialStatus) && isStageDecision(row.stageDecision);
}

function extractEngineFromOutputs(run: PlanningRunRecord): { engine: EngineEnvelope; source: LegacyEngineSource } | null {
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

function buildEngineFromResultDto(run: PlanningRunRecord): EngineEnvelope | null {
  const rawResultDto = asRecord(run.outputs).resultDto;
  if (!isResultDtoV1(rawResultDto)) return null;
  return buildLegacyEngineEnvelopeFromResultDto(rawResultDto);
}

function buildLegacyEngineEnvelopeFromResultDto(resultDto: ResultDtoV1): EngineEnvelope {
  const start = resultDto.timeline.points.find((point) => point.label === "start")
    ?? resultDto.timeline.points[0];
  const emergencyGoal = resultDto.goals.find((goal) => goal.type === "emergencyFund");
  const monthlyExpense = asNumber(start?.expensesKrw) ?? 0;
  const emergencyFundMonths = monthlyExpense > 0 && typeof asNumber(emergencyGoal?.targetKrw) === "number"
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

function readEngineSchemaVersion(run: PlanningRunRecord): number | null {
  const raw = asNumber(asRecord(run.outputs).engineSchemaVersion);
  if (typeof raw !== "number" || raw < 1) return null;
  return Math.trunc(raw);
}

export function migrateLegacyRunToEngineEnvelope(run: PlanningRunRecord): EngineEnvelopeMigrationResult {
  const extracted = extractEngineFromOutputs(run);
  const engine = extracted?.engine ?? buildEngineFromResultDto(run);
  if (!engine) {
    return {
      run,
      migrated: false,
    };
  }

  const schemaVersion = readEngineSchemaVersion(run);
  const shouldRewrite = !extracted || schemaVersion !== ENGINE_SCHEMA_VERSION || extracted.source !== "outputs.engine";
  if (!shouldRewrite) {
    return {
      run,
      migrated: false,
      source: extracted.source,
    };
  }

  return {
    run: {
      ...run,
      outputs: {
        ...run.outputs,
        engine,
        engineSchemaVersion: ENGINE_SCHEMA_VERSION,
      },
    },
    migrated: true,
    source: extracted?.source ?? "resultDtoFallback",
  };
}
