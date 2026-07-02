import crypto from "node:crypto";
import { type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { recordPlanningFallbackUsage } from "../engine";
import { runPlanningMigrationsOnStartup } from "../migrations/manager";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
  type StorageTransactionContext,
} from "../storage/journal";
import { withPlanningStoreWriteLock } from "../storage/storeWriteLock";
import { LIMITS, RAW_TIMELINE_SAMPLE_STEP_MONTHS, sampleByStride, takeTop } from "../v2/limits";
import { loadCanonicalRun } from "../v2/loadCanonicalRun";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
} from "../v2/resultDto";
import { backfillResultDtoDebtFromRaw } from "../v2/resultDtoDebtBackfill";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  resolveProfilePartitionsDir,
  resolveProfileRunBlobsDir,
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  resolveRunDir,
  resolveRunMetaPath,
  resolveRunPath,
  resolveRunsDir,
  resolveRunsIndexPath,
  sanitizeRecordId,
} from "./paths";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  resolveTrashKindDir,
  restoreFileFromTrash,
} from "./trash";
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
import { type PlanningRunRecord } from "./types";

export type { RunBlobName } from "./runBlobStore";
export type {
  LegacyRunBackfillCandidate,
  LegacyRunBackfillCandidateReason,
  LegacyRunBackfillResult,
  LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";

export const DEFAULT_RUNS_PER_PROFILE_RETENTION = 50;

const RUN_INDEX_VERSION = 1;
const BLOB_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

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

export type RunIndexEntry = {
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
  snapshot?: {
    id?: string;
    asOf?: string;
    missing?: boolean;
  };
  warningsCount?: number;
  criticalCount?: number;
};

type RunIndexFile = {
  version: typeof RUN_INDEX_VERSION;
  entries: RunIndexEntry[];
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

function sortByCreatedAtDesc<T extends { id: string; createdAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
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

function toRunIndexEntry(record: PlanningRunRecord): RunIndexEntry {
  return {
    id: record.id,
    profileId: record.profileId,
    ...(asString(record.title) ? { title: asString(record.title) } : {}),
    createdAt: record.createdAt,
    ...(record.overallStatus ? { overallStatus: record.overallStatus } : {}),
    snapshot: {
      ...(asString(record.meta.snapshot?.id) ? { id: asString(record.meta.snapshot?.id) } : {}),
      ...(asString(record.meta.snapshot?.asOf) ? { asOf: asString(record.meta.snapshot?.asOf) } : {}),
      ...(record.meta.snapshot?.missing === true ? { missing: true } : {}),
    },
    ...(typeof record.outputs?.resultDto?.summary?.totalWarnings === "number"
      ? { warningsCount: record.outputs.resultDto.summary.totalWarnings }
      : {}),
    ...(typeof record.meta.health?.criticalCount === "number"
      ? { criticalCount: record.meta.health.criticalCount }
      : {}),
  };
}

function isRunIndexEntry(value: unknown): value is RunIndexEntry {
  if (!isRecord(value)) return false;
  if (!asString(value.id)) return false;
  if (!asString(value.profileId)) return false;
  if (!asString(value.createdAt)) return false;
  return true;
}

function parseRunIndex(payload: unknown): RunIndexEntry[] {
  if (!isRecord(payload)) return [];
  const version = Math.trunc(Number(payload.version));
  if (version !== RUN_INDEX_VERSION) return [];
  const rows = asArray(payload.entries).filter((entry) => isRunIndexEntry(entry)) as RunIndexEntry[];
  return sortByCreatedAtDesc(rows).map((row) => ({ ...row }));
}

type RunPaths = {
  runId: string;
  profileId?: string;
  partitionMetaPath?: string;
  partitionRunDir?: string;
  partitionBlobDir?: string;
  legacyMetaPath: string;
  legacyFilePath: string;
  legacyRunDir: string;
};

type ReadRunMetaOptions = {
  persistMigrations?: boolean;
};

type ReadRunIndexOptions = {
  repair?: boolean;
};

export type RunReadDiagnosticAttempt = {
  source: "partition-hint" | "partition-scan" | "legacy-meta" | "legacy-file";
  path: string;
  status: "found" | "missing" | "unreadable";
  reason?: string;
};

export type RunReadDiagnostic = {
  id: string;
  profileIdHint?: string;
  status: "found" | "missing" | "unreadable";
  attempts: RunReadDiagnosticAttempt[];
  run?: PlanningRunRecord;
};

type ReadRunMetaByPathDetailedResult =
  | { status: "found"; run: PlanningRunRecord }
  | { status: "missing"; reason: string }
  | { status: "unreadable"; reason: string };

function getRunPaths(runId: string, profileId?: string): RunPaths {
  const safeRunId = sanitizeRecordId(runId);
  const safeProfileId = asString(profileId);
  return {
    runId: safeRunId,
    ...(safeProfileId ? {
      profileId: safeProfileId,
      partitionMetaPath: resolveProfileRunMetaPath(safeProfileId, safeRunId),
      partitionRunDir: resolveProfileRunDir(safeProfileId, safeRunId),
      partitionBlobDir: resolveProfileRunBlobsDir(safeProfileId, safeRunId),
    } : {}),
    legacyMetaPath: resolveRunMetaPath(safeRunId),
    legacyFilePath: resolveRunPath(safeRunId),
    legacyRunDir: resolveRunDir(safeRunId),
  };
}

async function tryMigrateLegacyRunToPartition(record: PlanningRunRecord, paths: RunPaths): Promise<void> {
  if (!paths.profileId || !paths.partitionMetaPath || !paths.partitionRunDir) return;
  const existing = await readJsonFile(paths.partitionMetaPath);
  if (existing !== null) return;

  await fs.mkdir(paths.partitionRunDir, { recursive: true });
  await writeJsonAtomic(paths.partitionMetaPath, await toStoredPayload(record));
  await fs.unlink(paths.legacyMetaPath).catch(() => undefined);
  await fs.unlink(paths.legacyFilePath).catch(() => undefined);
}

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
    if (canonicalMeta.migrated) {
      recordPlanningFallbackUsage("legacyReportContractFallbackCount", {
        source: canonicalMeta.source,
        sourceKey: "compatRebuild",
        runId: migration.run.id,
      });
    }
    if (migration.migrated) {
      recordPlanningFallbackUsage("legacyRunEngineMigrationCount", {
        source: `runStore/readRunMetaByPath/${migration.source ?? "unknown"}`,
        sourceKey: "legacyEngineFallback",
        runId: migration.run.id,
      });
    }
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

async function findPartitionMetaPathByRunId(runId: string): Promise<string | null> {
  const safeRunId = sanitizeRecordId(runId);
  const partitionRoot = resolveProfilePartitionsDir();
  let profileEntries: Dirent[];
  try {
    profileEntries = await fs.readdir(partitionRoot, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }

  for (const profileEntry of profileEntries) {
    if (!profileEntry.isDirectory()) continue;
    const profileId = asString(profileEntry.name);
    if (!profileId) continue;
    const candidate = resolveProfileRunMetaPath(profileId, safeRunId);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function readRunMeta(
  id: string,
  profileIdHint?: string,
  options?: ReadRunMetaOptions,
): Promise<PlanningRunRecord | null> {
  const paths = getRunPaths(id, profileIdHint);
  if (paths.partitionMetaPath) {
    const fromPartition = await readRunMetaByPath(paths.partitionMetaPath, options);
    if (fromPartition) return fromPartition;
  }
  if (!paths.partitionMetaPath) {
    const partitionMetaPath = await findPartitionMetaPathByRunId(paths.runId);
    if (partitionMetaPath) {
      const fromPartition = await readRunMetaByPath(partitionMetaPath, options);
      if (fromPartition) return fromPartition;
    }
  }

  const fromLegacyMeta = await readRunMetaByPath(paths.legacyMetaPath, options);
  if (fromLegacyMeta) {
    if (options?.persistMigrations === true) {
      await tryMigrateLegacyRunToPartition(fromLegacyMeta, getRunPaths(id, fromLegacyMeta.profileId));
    }
    return fromLegacyMeta;
  }

  const fromLegacyFile = await readRunMetaByPath(paths.legacyFilePath, options);
  if (fromLegacyFile) {
    if (options?.persistMigrations === true) {
      await tryMigrateLegacyRunToPartition(fromLegacyFile, getRunPaths(id, fromLegacyFile.profileId));
    }
    return fromLegacyFile;
  }

  return null;
}

async function scanPartitionRunsForIndex(): Promise<RunIndexEntry[]> {
  const partitionRoot = resolveProfilePartitionsDir();
  let profileEntries: Dirent[];
  try {
    profileEntries = await fs.readdir(partitionRoot, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const out: RunIndexEntry[] = [];
  for (const profileEntry of profileEntries) {
    if (!profileEntry.isDirectory()) continue;
    const profileId = asString(profileEntry.name);
    if (!profileId) continue;

    const runsDir = path.join(partitionRoot, profileId, "runs");
    let runEntries: Dirent[];
    try {
      runEntries = await fs.readdir(runsDir, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") continue;
      throw error;
    }

    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      const runId = asString(runEntry.name);
      if (!runId) continue;
      const row = await readRunMeta(runId, profileId);
      if (row) out.push(toRunIndexEntry(row));
    }
  }

  return out;
}

async function scanRunsDirForIndex(): Promise<RunIndexEntry[]> {
  const out: RunIndexEntry[] = [];
  const partitionRows = await scanPartitionRunsForIndex();
  out.push(...partitionRows);

  const dirPath = resolveRunsDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return sortByCreatedAtDesc(out) as RunIndexEntry[];
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const runId = sanitizeRecordId(entry.name);
        const row = await readRunMeta(runId);
        if (row) out.push(toRunIndexEntry(row));
      } catch {
        // ignore non-run directory names
      }
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    if (entry.name === path.basename(resolveRunsIndexPath())) continue;

    const runId = entry.name.slice(0, -5);
    if (!BLOB_NAME_PATTERN.test(runId)) continue;
    try {
      const row = await readRunMeta(runId);
      if (row) out.push(toRunIndexEntry(row));
    } catch {
      continue;
    }
  }

  const deduped = Array.from(new Map(out.map((row) => [row.id, row])).values());
  return sortByCreatedAtDesc(deduped) as RunIndexEntry[];
}

async function writeRunIndex(
  entries: RunIndexEntry[],
  options?: { journal?: boolean; tx?: StorageTransactionContext },
): Promise<void> {
  const filePath = resolveRunsIndexPath();
  const payload: RunIndexFile = {
    version: RUN_INDEX_VERSION,
    entries: sortByCreatedAtDesc(entries) as RunIndexEntry[],
  };
  const shouldJournal = options?.journal !== false;
  const tx = options?.tx ?? (shouldJournal
    ? await beginStorageTransaction("RUN_INDEX_UPDATE", {
      indexPath: normalizeRelativePath(filePath),
      entriesCount: payload.entries.length,
    })
    : null);
  try {
    await writeJsonAtomic(filePath, await toStoredPayload(payload));
    if (tx) {
      await appendStorageTransactionStep(tx, "WRITE_INDEX", {
        indexPath: normalizeRelativePath(filePath),
        entriesCount: payload.entries.length,
      });
      if (!options?.tx) {
        await endStorageTransaction(tx, "COMMIT");
      }
    }
  } catch (error) {
    if (tx && !options?.tx) {
      await endStorageTransaction(
        tx,
        "ROLLBACK",
        error instanceof Error ? error.message : "run index write failed",
      ).catch(() => undefined);
    }
    throw error;
  }
}

function withRunIndexWriteLock<T>(callback: () => Promise<T> | T): Promise<T> {
  return withPlanningStoreWriteLock(`planning:runs:index:${resolveRunsIndexPath()}`, callback);
}

async function readRunIndex(options?: ReadRunIndexOptions): Promise<RunIndexEntry[]> {
  const filePath = resolveRunsIndexPath();
  const loaded = await readJsonFile(filePath);
  const decoded = loaded === null ? null : await fromStoredPayload(loaded);
  const decodedPayload = decoded?.payload ?? loaded;
  const parsed = parseRunIndex(decodedPayload);
  if (parsed.length > 0 || (isRecord(decodedPayload) && Array.isArray(decodedPayload.entries))) {
    if (options?.repair === true && decoded?.rewriteToVault) {
      await withRunIndexWriteLock(() => writeRunIndex(parsed));
    }
    return parsed;
  }

  const scanned = await scanRunsDirForIndex();
  if (options?.repair === true && (scanned.length > 0 || loaded !== null)) {
    await withRunIndexWriteLock(() => writeRunIndex(scanned));
  }
  return scanned;
}

async function upsertRunIndexEntry(entry: RunIndexEntry): Promise<void> {
  await withRunIndexWriteLock(async () => {
    const entries = await readRunIndex({ repair: true });
    const next = entries.filter((row) => row.id !== entry.id);
    next.push(entry);
    await writeRunIndex(next);
  });
}

async function removeRunIndexEntry(id: string): Promise<void> {
  await withRunIndexWriteLock(async () => {
    const entries = await readRunIndex({ repair: true });
    const next = entries.filter((row) => row.id !== id);
    if (next.length === entries.length) return;
    await writeRunIndex(next);
  });
}

export async function listRunIndexEntries(options?: {
  profileId?: string;
  limit?: number;
  offset?: number;
}): Promise<RunIndexEntry[]> {
  assertServerOnly();

  const all = await readRunIndex();
  const filtered = asString(options?.profileId)
    ? all.filter((row) => row.profileId === asString(options?.profileId))
    : all;

  const offset = toSafeOffset(options?.offset);
  const limit = toSafeLimit(options?.limit, 100);
  return filtered.slice(offset, offset + limit);
}

export async function readRunIndexEntries(): Promise<RunIndexEntry[]> {
  assertServerOnly();
  return readRunIndex();
}

export async function rebuildRunIndexFromDisk(): Promise<{
  entries: number;
  indexPath: string;
}> {
  assertServerOnly();
  return withRunIndexWriteLock(async () => {
    const scanned = await scanRunsDirForIndex();
    await writeRunIndex(scanned);
    return {
      entries: scanned.length,
      indexPath: normalizeRelativePath(resolveRunsIndexPath()),
    };
  });
}

export async function scanRunIndexEntriesFromDisk(): Promise<RunIndexEntry[]> {
  assertServerOnly();
  return scanRunsDirForIndex();
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
  const indexRows = await readRunIndex();
  const hintedProfileId = indexRows.find((row) => row.id === safeId)?.profileId;
  return readRunMeta(safeId, hintedProfileId);
}

export async function diagnoseRunRead(id: string, profileIdHint?: string): Promise<RunReadDiagnostic> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const explicitProfileIdHint = asString(profileIdHint);
  const indexRows = explicitProfileIdHint ? [] : await readRunIndex();
  const hintedProfileId = explicitProfileIdHint || indexRows.find((row) => row.id === safeId)?.profileId;
  const attempts: RunReadDiagnosticAttempt[] = [];

  async function attempt(source: RunReadDiagnosticAttempt["source"], filePath: string): Promise<PlanningRunRecord | null> {
    const result = await readRunMetaByPathDetailed(filePath);
    attempts.push({
      source,
      path: normalizeRelativePath(filePath),
      status: result.status,
      ...(result.status === "found" ? {} : { reason: result.reason }),
    });
    return result.status === "found" ? result.run : null;
  }

  if (hintedProfileId) {
    const paths = getRunPaths(safeId, hintedProfileId);
    if (paths.partitionMetaPath) {
      const fromHint = await attempt("partition-hint", paths.partitionMetaPath);
      if (fromHint) {
        return {
          id: safeId,
          profileIdHint: hintedProfileId,
          status: "found",
          attempts,
          run: fromHint,
        };
      }
    }
  } else {
    const partitionMetaPath = await findPartitionMetaPathByRunId(safeId);
    if (partitionMetaPath) {
      const fromPartitionScan = await attempt("partition-scan", partitionMetaPath);
      if (fromPartitionScan) {
        return {
          id: safeId,
          status: "found",
          attempts,
          run: fromPartitionScan,
        };
      }
    }
  }

  const paths = getRunPaths(safeId, hintedProfileId);
  const fromLegacyMeta = await attempt("legacy-meta", paths.legacyMetaPath);
  if (fromLegacyMeta) {
    return {
      id: safeId,
      ...(hintedProfileId ? { profileIdHint: hintedProfileId } : {}),
      status: "found",
      attempts,
      run: fromLegacyMeta,
    };
  }

  const fromLegacyFile = await attempt("legacy-file", paths.legacyFilePath);
  if (fromLegacyFile) {
    return {
      id: safeId,
      ...(hintedProfileId ? { profileIdHint: hintedProfileId } : {}),
      status: "found",
      attempts,
      run: fromLegacyFile,
    };
  }

  return {
    id: safeId,
    ...(hintedProfileId ? { profileIdHint: hintedProfileId } : {}),
    status: attempts.some((row) => row.status === "unreadable") ? "unreadable" : "missing",
    attempts,
  };
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
    listIndexEntries: readRunIndex,
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
    listIndexEntries: readRunIndex,
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
    listIndexEntries: readRunIndex,
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
  await upsertRunIndexEntry(toRunIndexEntry(next));
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
  const all = await readRunIndex();
  const target = asString(options?.profileId)
    ? all.filter((row) => row.profileId === asString(options?.profileId))
    : all;

  const grouped = new Map<string, RunIndexEntry[]>();
  for (const row of target) {
    const list = grouped.get(row.profileId) ?? [];
    list.push(row);
    grouped.set(row.profileId, list);
  }

  const removedIds: string[] = [];
  for (const runs of grouped.values()) {
    const sorted = sortByCreatedAtDesc(runs).map((row) => row as RunIndexEntry);
    const purgeTargets = sorted.slice(maxPerProfile);
    for (const row of purgeTargets) {
      const removed = await deleteRun(row.id);
      if (removed) removedIds.push(row.id);
    }
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

    await upsertRunIndexEntry(toRunIndexEntry(record));
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
    await removeRunIndexEntry(runId).catch(() => undefined);
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
  const runDir = existing ? resolveProfileRunDir(existing.profileId, safeId) : resolveRunDir(safeId);
  const legacyPath = resolveRunPath(safeId);

  let deleted = false;

  try {
    await fs.rm(runDir, { recursive: true, force: false });
    deleted = true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
  }

  try {
    await fs.unlink(legacyPath);
    deleted = true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
  }

  if (deleted) {
    await removeRunIndexEntry(safeId);
  }

  return deleted;
}

export async function restoreRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const trashMetaPath = path.join(resolveTrashKindDir("runs"), `${safeId}.json`);
  const trashedPayload = await readJsonFile(trashMetaPath);
  const decoded = trashedPayload === null ? null : await fromStoredPayload(trashedPayload);
  const trashedRecord = decoded?.payload;
  const restoredProfileId = isRunRecord(trashedRecord) ? trashedRecord.profileId : "";
  const metaPath = restoredProfileId
    ? resolveProfileRunMetaPath(restoredProfileId, safeId)
    : resolveRunMetaPath(safeId);
  const restored = await restoreFileFromTrash(metaPath, {
    kind: "runs",
    id: safeId,
    ext: ".json",
  });

  if (!restored) return false;
  const run = await getRun(safeId);
  if (run) {
    await upsertRunIndexEntry(toRunIndexEntry(run));
  }
  return true;
}

export async function hardDeleteRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  return deleteFileFromTrash({
    kind: "runs",
    id: safeId,
    ext: ".json",
  });
}

export async function deleteRun(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const existing = await getRun(safeId);
  const metaPath = existing
    ? resolveProfileRunMetaPath(existing.profileId, safeId)
    : resolveRunMetaPath(safeId);
  const legacyPath = resolveRunPath(safeId);

  let moved = await moveFileToTrash(metaPath, {
    kind: "runs",
    id: safeId,
    ext: ".json",
  });

  if (!moved) {
    moved = await moveFileToTrash(legacyPath, {
      kind: "runs",
      id: safeId,
      ext: ".json",
    });
  }

  if (!moved) return false;

  try {
    const runDir = existing ? resolveProfileRunDir(existing.profileId, safeId) : resolveRunDir(safeId);
    await fs.rm(runDir, { recursive: true, force: true });
  } catch {
    // ignore directory cleanup errors
  }

  await removeRunIndexEntry(safeId);
  return true;
}
