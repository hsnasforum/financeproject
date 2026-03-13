import { type EngineEnvelope } from "../engine";
import { type PlanningRunRecord } from "../store/types";
import {
  isResultDtoV1,
  type ResultDtoV1,
} from "../v2/resultDto";
import { backfillResultDtoDebtFromRaw } from "../v2/resultDtoDebtBackfill";

export interface ReportInputContract {
  runId: string;
  resultDto: ResultDtoV1;
  engine: EngineEnvelope;
  engineSchemaVersion: number;
  fallbacks: ReportContractFallbackSource[];
}

export type ReportContractMode = "strict";
export type ReportContractFallbackSource =
  | "legacyEngineFallback"
  | "legacyResultDtoFallback"
  | "contractBuildFailureFallback";

export type BuildReportInputContractOptions = {
  mode?: ReportContractMode;
};

export function resolveReportContractMode(value: unknown): ReportContractMode {
  void value;
  return "strict";
}

export function getReportInputContractOptions(
  mode: ReportContractMode = "strict",
): BuildReportInputContractOptions {
  void mode;
  return { mode: "strict" };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isEngineEnvelope(value: unknown): value is EngineEnvelope {
  const row = asRecord(value);
  return (
    typeof row === "object"
    && row !== null
    && typeof row.stage === "string"
    && typeof row.financialStatus === "object"
    && row.financialStatus !== null
    && typeof row.stageDecision === "object"
    && row.stageDecision !== null
  );
}

export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord,
  _options?: BuildReportInputContractOptions,
): ResultDtoV1;
export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord | null,
  _options?: BuildReportInputContractOptions,
): ResultDtoV1 | null;
export function resolveReportResultDtoFromRun(
  run: PlanningRunRecord | null,
  options: BuildReportInputContractOptions = {},
): ResultDtoV1 | null {
  void options;
  if (!run) return null;
  const rawResultDto = asRecord(run.outputs).resultDto;
  if (!isResultDtoV1(rawResultDto)) {
    throw new Error("resultDto is missing in run outputs");
  }
  return backfillResultDtoDebtFromRaw(rawResultDto).resultDto;
}

export function buildReportInputContractFromRun(
  run: PlanningRunRecord,
  options: BuildReportInputContractOptions = {},
): ReportInputContract {
  void options;
  const resultDto = resolveReportResultDtoFromRun(run);
  if (!resultDto) {
    throw new Error("resultDto is missing in run outputs");
  }

  const rawEngine = asRecord(run.outputs).engine;
  if (!isEngineEnvelope(rawEngine)) {
    throw new Error("engine envelope is missing in run outputs");
  }

  const rawEngineSchemaVersion = asNumber(asRecord(run.outputs).engineSchemaVersion);
  const engineSchemaVersion = typeof rawEngineSchemaVersion === "number" && rawEngineSchemaVersion >= 1
    ? Math.trunc(rawEngineSchemaVersion)
    : 1;

  return {
    runId: run.id,
    resultDto,
    engine: rawEngine,
    engineSchemaVersion,
    fallbacks: [],
  };
}
