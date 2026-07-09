import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runPlanningMigrationsOnStartup } from "../migrations/manager";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
} from "../storage/journal";
import { LIMITS, RAW_TIMELINE_SAMPLE_STEP_MONTHS, sampleByStride, takeTop } from "../v2/limits";
import { loadCanonicalRun } from "../v2/loadCanonicalRun";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
} from "../v2/resultDto";
import { backfillResultDtoDebtFromRaw } from "../v2/resultDtoDebtBackfill";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  sanitizeRecordId,
} from "./paths";
import {
  deleteRunMetaFromTrash,
  hardDeleteRunFiles,
  moveRunMetaToTrash,
  restoreRunMetaFromTrash,
} from "./runTrashStore";
import { migrateLegacyRunToEngineEnvelope } from "./engineEnvelopeMigration";
import {
  normalizeRunBlobName,
  pickRunBlobRef,
  readRunBlobPayload,
  withStageBlobRefs,
  withStageOutputRefs,
  writeStageBlobs,
  type RunBlobName,
  type RunBlobRef,
} from "./runBlobStore";
import {
  backfillLegacyRunsWith,
  listLegacyRunBackfillCandidatesWith,
  summarizeLegacyRunBackfillWith,
  type LegacyRunBackfillCandidate,
  type LegacyRunBackfillResult,
  type LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";
import {
  fromStoredPayload,
  readJsonFile,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import {
  createRunReadDiagnosticRecorder,
  recordRunReadFallbackUsage,
  type ReadRunMetaByPathDetailedResult,
  type RunReadDiagnostic,
} from "./runReadObservability";
import { migrateLegacyRunToPartition } from "./runReadMigration";
import {
  getRunPaths,
  resolveRunReadSources,
} from "./runReadSources";
import {
  toRunIndexEntry,
  type RunIndexEntry,
} from "./runIndex";
import { createRunIndexStore } from "./runIndexStore";
import { selectRunRetentionTargets } from "./runRetention";
import { type PlanningRunRecord } from "./types";

export type { RunBlobName } from "./runBlobStore";
export type {
  LegacyRunBackfillCandidate,
  LegacyRunBackfillCandidateReason,
  LegacyRunBackfillResult,
  LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";
export type { RunIndexEntry } from "./runIndex";
export type { RunReadDiagnostic, RunReadDiagnosticAttempt } from "./runReadObservability";

export const DEFAULT_RUNS_PER_PROFILE_RETENTION = 50;

type ListRunsOptions = {
  profileId?: string;
  limit?: number;
  offset?: number;
};

type CreateRunOptions = {
  enforceRetention?: boolean;
  maxPerProfile?: number;
  storeRawOutputs?: boolean;
  timelineSampleStepMonths?: number;
};

type CreateRunInput = Omit<PlanningRunRecord, "version" | "schemaVersion" | "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

type PurgeRunsOptions = {
  profileId?: string;
  maxPerProfile?: number;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning run store is server-only.");
  }
}

assertServerOnly();

async function ensureStartupMigrations(): Promise<void> {
  await runPlanningMigrationsOnStartup();
}

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

function isRunRecord(value: unknown): value is PlanningRunRecord {
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

function toSafeOffset(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function isEngineEnvelopeLike(value: unknown): value is NonNullable<PlanningRunRecord["outputs"]["engine"]> {
  if (!isRecord(value)) return false;
  const stage = asString(value.stage);
  if (stage !== "DEFICIT" && stage !== "DEBT" && stage !== "EMERGENCY" && stage !== "INVEST") return false;
  if (!isRecord(value.financialStatus)) return false;
  if (!isRecord(value.stageDecision)) return false;
  return true;
}

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

function compactRunOutputs(
  outputs: PlanningRunRecord["outputs"],
  options?: CreateRunOptions,
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

  const scenarios = asRecord(source.scenarios);
  if (Object.keys(scenarios).length > 0) {
    const scenariosRef = pickRunBlobRef(scenarios.ref);
    const scenariosOutput = {
      ...(scenariosRef ? { ref: scenariosRef } : {}),
      ...(Array.isArray(scenarios.table) ? { table: takeTop(scenarios.table, LIMITS.tracesTop) } : {}),
      ...(isRecord(scenarios.shortWhyByScenario)
        ? {
          shortWhyByScenario: Object.fromEntries(
            Object.entries(scenarios.shortWhyByScenario).map(([key, value]) => [key, takeTop(asArray(value), LIMITS.actionsTop)]),
          ),
        }
        : {}),
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

function toMetaRecord(record: PlanningRunRecord): PlanningRunRecord {
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

function ensureCanonicalResultDtoWithSource(record: PlanningRunRecord): {
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

type ReadRunMetaOptions = {
  persistMigrations?: boolean;
};

async function readRunMetaByPath(
  filePath: string,
  options?: ReadRunMetaOptions,
): Promise<PlanningRunRecord | null> {
  const detailed = await readRunMetaByPathDetailed(filePath, options);
  return detailed.status === "found" ? detailed.run : null;
}

async function readRunMetaByPathDetailed(
  filePath: string,
  options?: ReadRunMetaOptions,
): Promise<ReadRunMetaByPathDetailedResult> {
  let loaded: unknown;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    loaded = JSON.parse(raw) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return { status: "missing", reason: "file-missing" };
    }
    if (error instanceof SyntaxError) {
      return { status: "unreadable", reason: "invalid-json" };
    }
    return {
      status: "unreadable",
      reason: nodeError?.code ? `read-failed:${nodeError.code}` : "read-failed",
    };
  }

  let decoded: Awaited<ReturnType<typeof fromStoredPayload>>;
  try {
    decoded = await fromStoredPayload(loaded);
  } catch {
    return { status: "unreadable", reason: "decode-failed" };
  }

  const parsed = decoded.payload;
  if (!isRunRecord(parsed)) return { status: "unreadable", reason: "invalid-run-record" };
  try {
    const canonical = loadCanonicalRun(parsed);
    const canonicalMeta = ensureCanonicalResultDtoWithSource(toMetaRecord(canonical.run));
    const migration = migrateLegacyRunToEngineEnvelope(canonicalMeta.run);
    recordRunReadFallbackUsage({ canonicalMeta, migration });
    if (options?.persistMigrations === true && (decoded.rewriteToVault || canonicalMeta.migrated || migration.migrated)) {
      await writeJsonAtomic(filePath, await toStoredPayload(migration.run));
    }
    return { status: "found", run: migration.run };
  } catch {
    return { status: "unreadable", reason: "canonicalization-failed" };
  }
}

async function readRawRunMetaByPath(filePath: string): Promise<PlanningRunRecord | null> {
  const loaded = await readJsonFile(filePath);
  if (!loaded) return null;
  const decoded = await fromStoredPayload(loaded);
  const parsed = decoded.payload;
  if (!isRunRecord(parsed)) return null;
  try {
    const canonical = loadCanonicalRun(parsed);
    return toMetaRecord(canonical.run);
  } catch {
    return null;
  }
}

async function readRunMeta(
  id: string,
  profileIdHint?: string,
  options?: ReadRunMetaOptions,
): Promise<PlanningRunRecord | null> {
  const { sources } = await resolveRunReadSources(id, profileIdHint);
  for (const candidate of sources) {
    const run = await readRunMetaByPath(candidate.filePath, options);
    if (!run) continue;
    if (
      options?.persistMigrations === true
      && (candidate.source === "legacy-meta" || candidate.source === "legacy-file")
    ) {
      await migrateLegacyRunToPartition({
        record: run,
        paths: getRunPaths(id, run.profileId),
      });
    }
    return run;
  }

  return null;
}

const runIndexStore = createRunIndexStore({ readRunMeta });

export async function listRunIndexEntries(options?: {
  profileId?: string;
  limit?: number;
  offset?: number;
}): Promise<RunIndexEntry[]> {
  assertServerOnly();

  const all = await runIndexStore.read();
  const filtered = asString(options?.profileId)
    ? all.filter((row) => row.profileId === asString(options?.profileId))
    : all;

  const offset = toSafeOffset(options?.offset);
  const limit = toSafeLimit(options?.limit, 100);
  return filtered.slice(offset, offset + limit);
}

export async function readRunIndexEntries(): Promise<RunIndexEntry[]> {
  assertServerOnly();
  return runIndexStore.read();
}

export async function rebuildRunIndexFromDisk(): Promise<{
  entries: number;
  indexPath: string;
}> {
  assertServerOnly();
  return runIndexStore.rebuild();
}

export async function scanRunIndexEntriesFromDisk(): Promise<RunIndexEntry[]> {
  assertServerOnly();
  return runIndexStore.scan();
}

export async function listRuns(options?: ListRunsOptions): Promise<PlanningRunRecord[]> {
  assertServerOnly();

  const rows = await listRunIndexEntries({
    ...(options?.profileId ? { profileId: options.profileId } : {}),
    limit: toSafeLimit(options?.limit, 100),
    offset: toSafeOffset(options?.offset),
  });

  const loaded = await Promise.all(rows.map((row) => readRunMeta(row.id, row.profileId)));
  return loaded.filter((row): row is PlanningRunRecord => Boolean(row));
}

export async function getRun(id: string): Promise<PlanningRunRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const indexRows = await runIndexStore.read();
  const hintedProfileId = indexRows.find((row) => row.id === safeId)?.profileId;
  return readRunMeta(safeId, hintedProfileId);
}

export async function diagnoseRunRead(id: string, profileIdHint?: string): Promise<RunReadDiagnostic> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const explicitProfileIdHint = asString(profileIdHint);
  const indexRows = explicitProfileIdHint ? [] : await runIndexStore.read();
  const hintedProfileId = explicitProfileIdHint || indexRows.find((row) => row.id === safeId)?.profileId;
  const diagnostics = createRunReadDiagnosticRecorder({
    id: safeId,
    ...(hintedProfileId ? { profileIdHint: hintedProfileId } : {}),
    normalizePath: normalizeRelativePath,
  });

  const { sources } = await resolveRunReadSources(safeId, hintedProfileId);
  for (const candidate of sources) {
    const result = await readRunMetaByPathDetailed(candidate.filePath);
    diagnostics.recordAttempt(candidate.source, candidate.filePath, result);
    if (result.status === "found") {
      return diagnostics.found(result.run);
    }
  }

  return diagnostics.final();
}

async function readRawRunMetaForIndexEntry(row: Pick<RunIndexEntry, "id" | "profileId">): Promise<PlanningRunRecord | null> {
  const paths = getRunPaths(row.id, row.profileId);
  return await readRawRunMetaByPath(paths.partitionMetaPath ?? paths.legacyMetaPath)
    ?? await readRawRunMetaByPath(paths.legacyMetaPath)
    ?? await readRawRunMetaByPath(paths.legacyFilePath);
}

export async function summarizeLegacyRunBackfill(): Promise<LegacyRunBackfillSummary> {
  assertServerOnly();
  return summarizeLegacyRunBackfillWith({
    listIndexEntries: runIndexStore.read,
    readRawRunForIndexEntry: readRawRunMetaForIndexEntry,
    readRunForCandidate: (candidate, options) => readRunMeta(candidate.id, candidate.profileId, options),
    ensureStartupMigrations,
    isEngineEnvelopeLike,
  });
}

export async function listLegacyRunBackfillCandidates(options?: {
  limit?: number;
  includeOpsDoctor?: boolean;
}): Promise<LegacyRunBackfillCandidate[]> {
  assertServerOnly();
  return listLegacyRunBackfillCandidatesWith({
    listIndexEntries: runIndexStore.read,
    readRawRunForIndexEntry: readRawRunMetaForIndexEntry,
    readRunForCandidate: (candidate, readOptions) => readRunMeta(candidate.id, candidate.profileId, readOptions),
    ensureStartupMigrations,
    isEngineEnvelopeLike,
  }, options);
}

export async function backfillLegacyRuns(options?: {
  limit?: number;
  includeOpsDoctor?: boolean;
}): Promise<LegacyRunBackfillResult> {
  assertServerOnly();
  return backfillLegacyRunsWith({
    listIndexEntries: runIndexStore.read,
    readRawRunForIndexEntry: readRawRunMetaForIndexEntry,
    readRunForCandidate: (candidate, readOptions) => readRunMeta(candidate.id, candidate.profileId, readOptions),
    ensureStartupMigrations,
    isEngineEnvelopeLike,
  }, options);
}

type UpdateRunPatchBase = Partial<Pick<
  PlanningRunRecord,
  "title" | "scenario" | "overallStatus" | "stages" | "input" | "meta" | "outputs" | "reproducibility"
>>;

export type UpdateRunPatch = UpdateRunPatchBase & {
  actionCenter?: PlanningRunRecord["actionCenter"] | null;
};

function mergeRunPatch(current: PlanningRunRecord, patch: UpdateRunPatch): PlanningRunRecord {
  const next: PlanningRunRecord = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.scenario !== undefined ? { scenario: patch.scenario } : {}),
    ...(patch.overallStatus !== undefined ? { overallStatus: patch.overallStatus } : {}),
    ...(patch.stages !== undefined ? { stages: patch.stages } : {}),
    ...(patch.input ? { input: { ...current.input, ...patch.input } } : {}),
    ...(patch.meta ? { meta: { ...current.meta, ...patch.meta } } : {}),
    ...(patch.outputs ? { outputs: { ...current.outputs, ...patch.outputs } } : {}),
    ...(patch.reproducibility !== undefined ? { reproducibility: patch.reproducibility } : {}),
  };
  if (patch.actionCenter === null) {
    delete next.actionCenter;
  } else if (patch.actionCenter !== undefined) {
    next.actionCenter = patch.actionCenter;
  }
  return next;
}

export async function updateRun(id: string, patch: UpdateRunPatch): Promise<PlanningRunRecord | null> {
  assertServerOnly();
  await ensureStartupMigrations();
  const safeId = sanitizeRecordId(id);
  const current = await getRun(safeId);
  if (!current) return null;

  const next = toMetaRecord({
    ...mergeRunPatch(current, patch),
    schemaVersion: RUN_SCHEMA_VERSION,
    id: current.id,
    profileId: current.profileId,
    createdAt: current.createdAt,
    version: 1,
  });
  const metaPath = resolveProfileRunMetaPath(current.profileId, current.id);
  await fs.mkdir(resolveProfileRunDir(current.profileId, current.id), { recursive: true });
  await writeJsonAtomic(metaPath, await toStoredPayload(next));
  await runIndexStore.upsert(toRunIndexEntry(next));
  return next;
}

export async function getRunBlob(id: string, name: string): Promise<unknown | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const blobName = normalizeRunBlobName(name);
  if (!blobName) return null;

  if (blobName === "raw") {
    const run = await getRun(safeId);
    if (!run) return null;
    const outputs = {
      simulate: await readRunBlobPayload({ runId: safeId, blobName: "simulate", run, fallbackRun: run }),
      scenarios: await readRunBlobPayload({ runId: safeId, blobName: "scenarios", run, fallbackRun: run }),
      monteCarlo: await readRunBlobPayload({ runId: safeId, blobName: "monteCarlo", run, fallbackRun: run }),
      actions: await readRunBlobPayload({ runId: safeId, blobName: "actions", run, fallbackRun: run }),
      debtStrategy: await readRunBlobPayload({ runId: safeId, blobName: "debtStrategy", run, fallbackRun: run }),
    };
    return { run, outputs };
  }

  const run = await getRun(safeId);
  return readRunBlobPayload({ runId: safeId, blobName, run, fallbackRun: run });
}

export async function purgeRunsByRetention(options?: PurgeRunsOptions): Promise<string[]> {
  assertServerOnly();

  const maxPerProfile = toSafeLimit(options?.maxPerProfile, DEFAULT_RUNS_PER_PROFILE_RETENTION);
  const all = await runIndexStore.read();
  const purgeTargets = selectRunRetentionTargets(all, {
    maxPerProfile,
    ...(asString(options?.profileId) ? { profileId: asString(options?.profileId) } : {}),
  });
  const removedIds: string[] = [];
  for (const row of purgeTargets) {
    const removed = await deleteRun(row.id);
    if (removed) removedIds.push(row.id);
  }

  return removedIds;
}

export async function createRun(input: CreateRunInput, options?: CreateRunOptions): Promise<PlanningRunRecord> {
  assertServerOnly();
  await ensureStartupMigrations();

  const runId = input.id ? sanitizeRecordId(input.id) : crypto.randomUUID();
  const profileId = sanitizeRecordId(input.profileId);
  const createdAt = input.createdAt && Number.isFinite(Date.parse(input.createdAt))
    ? new Date(input.createdAt).toISOString()
    : new Date().toISOString();

  const tx = await beginStorageTransaction("RUN_CREATE", {
    runId,
    profileId,
    runDir: normalizeRelativePath(resolveProfileRunDir(profileId, runId)),
    runMetaPath: normalizeRelativePath(resolveProfileRunMetaPath(profileId, runId)),
  });

  let createdRecord: PlanningRunRecord | null = null;
  const sourceOutputs = compactRunOutputs(input.outputs, {
    ...options,
    storeRawOutputs: true,
  });

  try {
    const blobRefs = await writeStageBlobs({
      profileId,
      runId,
      outputs: sourceOutputs,
    });

    for (const [blob, ref] of Object.entries(blobRefs) as Array<[RunBlobName, RunBlobRef | undefined]>) {
      if (!ref) continue;
      await appendStorageTransactionStep(tx, "WRITE_BLOB", {
        blob,
        path: ref.path,
        sizeBytes: ref.sizeBytes,
      });
    }

    const metaOutputs = withStageBlobRefs(
      compactRunOutputs(input.outputs, {
        ...options,
        storeRawOutputs: false,
      }),
      blobRefs,
    );

    const record: PlanningRunRecord = {
      version: 1,
      schemaVersion: RUN_SCHEMA_VERSION,
      id: runId,
      profileId,
      ...(asString(input.title) ? { title: asString(input.title) } : {}),
      createdAt,
      ...(isRecord(input.scenario) ? { scenario: input.scenario as PlanningRunRecord["scenario"] } : {}),
      ...(typeof input.overallStatus === "string" ? { overallStatus: input.overallStatus } : {}),
      ...(Array.isArray(input.stages) ? { stages: withStageOutputRefs(input.stages, blobRefs) } : {}),
      input: input.input,
      meta: input.meta,
      ...(isRecord(input.reproducibility) ? { reproducibility: input.reproducibility } : {}),
      outputs: metaOutputs,
    };

    const metaPath = resolveProfileRunMetaPath(record.profileId, record.id);
    await fs.mkdir(resolveProfileRunDir(record.profileId, record.id), { recursive: true });
    await writeJsonAtomic(metaPath, await toStoredPayload(record));
    await appendStorageTransactionStep(tx, "WRITE_META", {
      path: normalizeRelativePath(metaPath),
    });

    await runIndexStore.upsert(toRunIndexEntry(record));
    await appendStorageTransactionStep(tx, "UPSERT_INDEX", {
      runId: record.id,
    });

    if (options?.enforceRetention !== false) {
      await purgeRunsByRetention({
        profileId: record.profileId,
        maxPerProfile: options?.maxPerProfile ?? DEFAULT_RUNS_PER_PROFILE_RETENTION,
      });
      await appendStorageTransactionStep(tx, "APPLY_RETENTION", {
        profileId: record.profileId,
      });
    }

    createdRecord = record;
    await endStorageTransaction(tx, "COMMIT");
    return record;
  } catch (error) {
    await endStorageTransaction(
      tx,
      "ROLLBACK",
      error instanceof Error ? error.message : "create run failed",
    ).catch(() => undefined);
    await fs.rm(resolveProfileRunDir(profileId, runId), { recursive: true, force: true }).catch(() => undefined);
    await runIndexStore.remove(runId).catch(() => undefined);
    if (createdRecord) {
      await fs.rm(resolveProfileRunDir(createdRecord.profileId, createdRecord.id), { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }
}

export async function hardDeleteRun(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const existing = await getRun(safeId);
  const deleted = await hardDeleteRunFiles({
    id: safeId,
    existing,
  });

  if (deleted) {
    await runIndexStore.remove(safeId);
  }

  return deleted;
}

export async function restoreRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const restored = await restoreRunMetaFromTrash(safeId);

  if (!restored) return false;
  const run = await getRun(safeId);
  if (run) {
    await runIndexStore.upsert(toRunIndexEntry(run));
  }
  return true;
}

export async function hardDeleteRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  return deleteRunMetaFromTrash(safeId);
}

export async function deleteRun(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const existing = await getRun(safeId);
  const moved = await moveRunMetaToTrash({
    id: safeId,
    existing,
  });

  if (!moved) return false;

  await runIndexStore.remove(safeId);
  return true;
}
