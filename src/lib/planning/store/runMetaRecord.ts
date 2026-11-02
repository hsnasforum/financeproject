import { LIMITS, RAW_TIMELINE_SAMPLE_STEP_MONTHS, sampleByStride, takeTop } from "../v2/limits";
import { loadCanonicalRun } from "../v2/loadCanonicalRun";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
} from "../v2/resultDto";
import { backfillResultDtoDebtFromRaw } from "../v2/resultDtoDebtBackfill";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  pickRunBlobRef,
  withStageBlobRefs,
  withStageOutputRefs,
  type RunBlobName,
  type RunBlobRef,
} from "./runBlobStore";
import { type PlanningRunRecord } from "./types";

type RunMetaCompactOptions = {
  storeRawOutputs?: boolean;
  timelineSampleStepMonths?: number;
};

type CreateRunRecordInput = Omit<PlanningRunRecord, "version" | "schemaVersion" | "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isRunRecord(value: unknown): value is PlanningRunRecord {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.schemaVersion !== undefined) {
    const schemaVersion = Math.trunc(Number(value.schemaVersion));
    if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > RUN_SCHEMA_VERSION) return false;
  }
  if (!asString(value.id)) return false;
  if (!asString(value.profileId)) return false;
  if (!asString(value.createdAt)) return false;
  if (!isRecord(value.input)) return false;
  if (!isRecord(value.meta)) return false;
  if (!isRecord(value.outputs)) return false;
  return true;
}

function toSafeLimit(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

export function isEngineEnvelopeLike(value: unknown): value is NonNullable<PlanningRunRecord["outputs"]["engine"]> {
  if (!isRecord(value)) return false;
  const stage = asString(value.stage);
  if (stage !== "DEFICIT" && stage !== "DEBT" && stage !== "EMERGENCY" && stage !== "INVEST") return false;
  if (!isRecord(value.financialStatus)) return false;
  if (!isRecord(value.stageDecision)) return false;
  return true;
}

export function compactRunOutputs(
  outputs: PlanningRunRecord["outputs"],
  options?: RunMetaCompactOptions,
): PlanningRunRecord["outputs"] {
  const source = isRecord(outputs) ? outputs : {};
  const rawEngineSchemaVersion = Math.trunc(Number(source.engineSchemaVersion));
  const engineSchemaVersion = Number.isFinite(rawEngineSchemaVersion) && rawEngineSchemaVersion >= 1
    ? rawEngineSchemaVersion
    : undefined;
  const resultDto = source.resultDto;
  const hasResultDto = isRecord(resultDto) && Number(asRecord(resultDto).version) === 1;
  if (!hasResultDto) {
    return outputs;
  }
  const rootEngine = isEngineEnvelopeLike(source.engine)
    ? source.engine
    : undefined;
  const simulateSource = asRecord(source.simulate);
  const simulateEngine = isEngineEnvelopeLike(simulateSource.engine)
    ? simulateSource.engine
    : undefined;
  const scenarios = asRecord(source.scenarios);
  const shortWhyByScenario = isRecord(scenarios.shortWhyByScenario)
    ? Object.fromEntries(
      Object.entries(scenarios.shortWhyByScenario).map(([key, value]) => [key, takeTop(asArray(value), LIMITS.actionsTop)]),
    )
    : undefined;

  if (options?.storeRawOutputs !== true) {
    const dto = asRecord(resultDto);
    // Keep dto small for run-meta payloads.
    const lightDto = {
      ...dto,
      ...(isRecord(dto.raw) ? { raw: {} } : {}),
    };
    return {
      ...(typeof engineSchemaVersion === "number" ? { engineSchemaVersion } : {}),
      resultDto: lightDto as PlanningRunRecord["outputs"]["resultDto"],
      ...(rootEngine ? { engine: rootEngine } : {}),
      ...(simulateEngine ? { simulate: { engine: simulateEngine } as PlanningRunRecord["outputs"]["simulate"] } : {}),
      // Keep only the bounded ID-to-explanation map here; withStageBlobRefs adds the blob ref.
      ...(shortWhyByScenario && Object.keys(shortWhyByScenario).length > 0
        ? { scenarios: { shortWhyByScenario } as PlanningRunRecord["outputs"]["scenarios"] }
        : {}),
    };
  }

  const timelineSampleStepMonths = toSafeLimit(options?.timelineSampleStepMonths, RAW_TIMELINE_SAMPLE_STEP_MONTHS);

  const compacted: PlanningRunRecord["outputs"] = {
    ...(typeof engineSchemaVersion === "number" ? { engineSchemaVersion } : {}),
    resultDto,
    ...(rootEngine ? { engine: rootEngine } : {}),
  };

  const simulate = simulateSource;
  if (Object.keys(simulate).length > 0) {
    const simulateRef = pickRunBlobRef(simulate.ref);
    const timelineRows = asArray(simulate.timeline);
    const simulateOutput = {
      ...(simulateRef ? { ref: simulateRef } : {}),
      ...(isRecord(simulate.engine) ? { engine: simulate.engine } : {}),
      ...(typeof simulate.stage === "string" ? { stage: simulate.stage } : {}),
      ...(isRecord(simulate.financialStatus) ? { financialStatus: simulate.financialStatus } : {}),
      ...(isRecord(simulate.stageDecision) ? { stageDecision: simulate.stageDecision } : {}),
      ...(simulate.summary !== undefined ? { summary: simulate.summary } : {}),
      ...(Array.isArray(simulate.warnings) ? { warnings: takeTop(simulate.warnings, LIMITS.warningsTop) } : {}),
      ...(Array.isArray(simulate.goalsStatus) ? { goalsStatus: takeTop(simulate.goalsStatus, LIMITS.goalsTop) } : {}),
      ...(Array.isArray(simulate.keyTimelinePoints) ? { keyTimelinePoints: takeTop(simulate.keyTimelinePoints, LIMITS.timelinePoints) } : {}),
      ...(timelineRows.length > 0
        ? { timelineSampled: takeTop(sampleByStride(timelineRows, timelineSampleStepMonths), LIMITS.tracesTop) }
        : {}),
      ...(Array.isArray(simulate.traces) ? { traces: takeTop(simulate.traces, LIMITS.tracesTop) } : {}),
    };
    if (Object.keys(simulateOutput).length > 0) {
      compacted.simulate = simulateOutput as PlanningRunRecord["outputs"]["simulate"];
    }
  }

  if (Object.keys(scenarios).length > 0) {
    const scenariosRef = pickRunBlobRef(scenarios.ref);
    const scenariosOutput = {
      ...(scenariosRef ? { ref: scenariosRef } : {}),
      ...(Array.isArray(scenarios.table) ? { table: takeTop(scenarios.table, LIMITS.tracesTop) } : {}),
      ...(shortWhyByScenario ? { shortWhyByScenario } : {}),
    };
    if (Object.keys(scenariosOutput).length > 0) {
      compacted.scenarios = scenariosOutput as PlanningRunRecord["outputs"]["scenarios"];
    }
  }

  const monteCarlo = asRecord(source.monteCarlo);
  if (Object.keys(monteCarlo).length > 0) {
    const monteCarloRef = pickRunBlobRef(monteCarlo.ref);
    const monteOutput = {
      ...(monteCarloRef ? { ref: monteCarloRef } : {}),
      ...(monteCarlo.probabilities !== undefined ? { probabilities: monteCarlo.probabilities } : {}),
      ...(monteCarlo.percentiles !== undefined ? { percentiles: monteCarlo.percentiles } : {}),
      ...(Array.isArray(monteCarlo.notes) ? { notes: takeTop(monteCarlo.notes, LIMITS.actionsTop).map((entry) => String(entry)) } : {}),
    };
    if (Object.keys(monteOutput).length > 0) {
      compacted.monteCarlo = monteOutput as PlanningRunRecord["outputs"]["monteCarlo"];
    }
  }

  const actions = asRecord(source.actions);
  if (Object.keys(actions).length > 0) {
    const actionsRef = pickRunBlobRef(actions.ref);
    const actionRows = Array.isArray(actions.actions)
      ? takeTop(actions.actions, LIMITS.actionsTop)
      : [];
    const actionsOutput = {
      ...(actionsRef ? { ref: actionsRef } : {}),
      ...(actionRows.length > 0 ? { actions: actionRows } : {}),
    };
    if (Object.keys(actionsOutput).length > 0) {
      compacted.actions = actionsOutput as PlanningRunRecord["outputs"]["actions"];
    }
  }

  const debtStrategy = asRecord(source.debtStrategy);
  if (Object.keys(debtStrategy).length > 0) {
    const debtStrategyRef = pickRunBlobRef(debtStrategy.ref);
    const debtOutput = {
      ...(debtStrategyRef ? { ref: debtStrategyRef } : {}),
      ...(isRecord(debtStrategy.summary)
        ? { summary: debtStrategy.summary as NonNullable<PlanningRunRecord["outputs"]["debtStrategy"]>["summary"] }
        : {}),
      ...(Array.isArray(debtStrategy.warnings)
        ? { warnings: takeTop(debtStrategy.warnings, LIMITS.warningsTop) as NonNullable<PlanningRunRecord["outputs"]["debtStrategy"]>["warnings"] }
        : {}),
      ...(Array.isArray(debtStrategy.summaries) ? { summaries: takeTop(debtStrategy.summaries, LIMITS.actionsTop) } : {}),
      ...(debtStrategy.refinance !== undefined ? { refinance: takeTop(asArray(debtStrategy.refinance), LIMITS.actionsTop) } : {}),
      ...(debtStrategy.whatIf !== undefined ? { whatIf: debtStrategy.whatIf } : {}),
    };
    if (Object.keys(debtOutput).length > 0) {
      compacted.debtStrategy = debtOutput as PlanningRunRecord["outputs"]["debtStrategy"];
    }
  }

  return compacted;
}

export function toMetaRecord(record: PlanningRunRecord): PlanningRunRecord {
  const outputs = compactRunOutputs(record.outputs, { storeRawOutputs: true });
  return {
    ...record,
    schemaVersion: RUN_SCHEMA_VERSION,
    outputs,
  };
}

function ensureCanonicalResultDto(record: PlanningRunRecord): {
  run: PlanningRunRecord;
  migrated: boolean;
} {
  const existing = asRecord(record.outputs).resultDto;
  if (isResultDtoV1(existing)) {
    const migratedDebt = backfillResultDtoDebtFromRaw(existing);
    if (!migratedDebt.migrated) {
      return {
        run: record,
        migrated: false,
      };
    }
    return {
      run: {
        ...record,
        outputs: compactRunOutputs({
          ...record.outputs,
          resultDto: migratedDebt.resultDto,
        }, { storeRawOutputs: true }),
      },
      migrated: true,
    };
  }

  return {
    run: {
      ...record,
      outputs: compactRunOutputs({
        ...record.outputs,
        resultDto: buildResultDtoV1FromRunRecord(record),
      }, { storeRawOutputs: true }),
    },
    migrated: true,
  };
}

function toFallbackSourceForResultDtoMigration(record: PlanningRunRecord): string {
  const resultDto = asRecord(record.outputs).resultDto;
  if (!isResultDtoV1(resultDto)) return "runStore/readRunMetaByPath/outputs.resultDto.rebuild";
  const rawDebt = asRecord(asRecord(resultDto.raw).debt);
  if (Object.keys(rawDebt).length > 0) {
    return "runStore/readRunMetaByPath/outputs.resultDto.debtRawBackfill";
  }
  return "runStore/readRunMetaByPath/outputs.resultDto.normalize";
}

export function ensureCanonicalResultDtoWithSource(record: PlanningRunRecord): {
  run: PlanningRunRecord;
  migrated: boolean;
  source: string;
} {
  const migrated = ensureCanonicalResultDto(record);
  return {
    ...migrated,
    source: toFallbackSourceForResultDtoMigration(record),
  };
}

export function normalizeRunMetaForRead(record: PlanningRunRecord): {
  run: PlanningRunRecord;
  migrated: boolean;
  source: string;
} {
  const canonical = loadCanonicalRun(record);
  return ensureCanonicalResultDtoWithSource(toMetaRecord(canonical.run));
}

export function normalizeRawRunForBackfill(value: unknown): PlanningRunRecord | null {
  if (!isRunRecord(value)) return null;
  try {
    const canonical = loadCanonicalRun(value);
    return toMetaRecord(canonical.run);
  } catch {
    return null;
  }
}

export function compactRawRunOutputs(
  outputs: PlanningRunRecord["outputs"],
  options?: RunMetaCompactOptions,
): PlanningRunRecord["outputs"] {
  return compactRunOutputs(outputs, {
    ...options,
    storeRawOutputs: true,
  });
}

export function buildCreateRunRecord(input: {
  source: CreateRunRecordInput;
  runId: string;
  profileId: string;
  createdAt: string;
  blobRefs: Partial<Record<RunBlobName, RunBlobRef>>;
  options?: RunMetaCompactOptions;
}): PlanningRunRecord {
  const source = input.source;
  const metaOutputs = withStageBlobRefs(
    compactRunOutputs(source.outputs, {
      ...input.options,
      storeRawOutputs: false,
    }),
    input.blobRefs,
  );

  return {
    version: 1,
    schemaVersion: RUN_SCHEMA_VERSION,
    id: input.runId,
    profileId: input.profileId,
    ...(asString(source.title) ? { title: asString(source.title) } : {}),
    createdAt: input.createdAt,
    ...(isRecord(source.scenario) ? { scenario: source.scenario as PlanningRunRecord["scenario"] } : {}),
    ...(typeof source.overallStatus === "string" ? { overallStatus: source.overallStatus } : {}),
    ...(Array.isArray(source.stages) ? { stages: withStageOutputRefs(source.stages, input.blobRefs) } : {}),
    input: source.input,
    meta: source.meta,
    ...(isRecord(source.reproducibility) ? { reproducibility: source.reproducibility } : {}),
    outputs: metaOutputs,
  };
}
