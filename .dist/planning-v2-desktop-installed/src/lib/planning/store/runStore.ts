import fs from "node:fs/promises";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { LIMITS, RAW_TIMELINE_SAMPLE_STEP_MONTHS, sampleByStride, takeTop } from "../v2/limits";
import { loadCanonicalRun } from "../v2/loadCanonicalRun";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  resolveProfilePartitionsDir,
  resolveProfileRunBlobsDir,
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  resolveRunBlobsDir,
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
import { type PlanningRunRecord, type PlanningRunStageId } from "./types";

export const DEFAULT_RUNS_PER_PROFILE_RETENTION = 50;

const RUN_INDEX_VERSION = 1;
const BLOB_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export type RunBlobName = "simulate" | "scenarios" | "monteCarlo" | "actions" | "debtStrategy" | "raw";

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

function pickBlobRef(value: unknown): { name: string; path?: string; sizeBytes?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const name = asString(value.name);
  if (!name) return undefined;
  const pathValue = asString(value.path);
  const sizeRaw = Number(value.sizeBytes);
  return {
    name,
    ...(pathValue ? { path: pathValue } : {}),
    ...(Number.isFinite(sizeRaw) ? { sizeBytes: Math.max(0, Math.trunc(sizeRaw)) } : {}),
  };
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

function normalizeBlobName(name: unknown): RunBlobName | null {
  const value = asString(name);
  if (!BLOB_NAME_PATTERN.test(value)) return null;
  if (
    value === "simulate"
    || value === "scenarios"
    || value === "monteCarlo"
    || value === "actions"
    || value === "debtStrategy"
    || value === "raw"
  ) {
    return value;
  }
  return null;
}

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

function compactRunOutputs(
  outputs: PlanningRunRecord["outputs"],
  options?: CreateRunOptions,
): PlanningRunRecord["outputs"] {
  const source = isRecord(outputs) ? outputs : {};
  const resultDto = source.resultDto;
  const hasResultDto = isRecord(resultDto) && Number(asRecord(resultDto).version) === 1;
  if (!hasResultDto) {
    return outputs;
  }
  if (options?.storeRawOutputs !== true) {
    const dto = asRecord(resultDto);
    // Keep dto small for run-meta payloads.
    const lightDto = {
      ...dto,
      ...(isRecord(dto.raw) ? { raw: {} } : {}),
    };
    return { resultDto: lightDto as PlanningRunRecord["outputs"]["resultDto"] };
  }

  const timelineSampleStepMonths = toSafeLimit(options?.timelineSampleStepMonths, RAW_TIMELINE_SAMPLE_STEP_MONTHS);

  const compacted: PlanningRunRecord["outputs"] = {
    resultDto,
  };

  const simulate = asRecord(source.simulate);
  if (Object.keys(simulate).length > 0) {
    const simulateRef = pickBlobRef(simulate.ref);
    const timelineRows = asArray(simulate.timeline);
    const simulateOutput = {
      ...(simulateRef ? { ref: simulateRef } : {}),
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
    const scenariosRef = pickBlobRef(scenarios.ref);
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
    const monteCarloRef = pickBlobRef(monteCarlo.ref);
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
    const actionsRef = pickBlobRef(actions.ref);
    const actionRows = Array.isArray(actions.actions)
      ? (takeTop(actions.actions, LIMITS.actionsTop) as PlanningRunRecord["outputs"]["actions"]["actions"])
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
    const debtStrategyRef = pickBlobRef(debtStrategy.ref);
    const debtOutput = {
      ...(debtStrategyRef ? { ref: debtStrategyRef } : {}),
      ...(isRecord(debtStrategy.summary)
        ? { summary: debtStrategy.summary as PlanningRunRecord["outputs"]["debtStrategy"]["summary"] }
        : {}),
      ...(Array.isArray(debtStrategy.warnings)
        ? { warnings: takeTop(debtStrategy.warnings, LIMITS.warningsTop) as PlanningRunRecord["outputs"]["debtStrategy"]["warnings"] }
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

function sortByCreatedAtDesc(records: Array<{ id: string; createdAt: string }>): Array<{ id: string; createdAt: string }> {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function toStoredPayload(payload: unknown): Promise<unknown> {
  return encodeStoragePayload(payload);
}

async function fromStoredPayload(payload: unknown): Promise<{
  payload: unknown;
  rewriteToVault: boolean;
}> {
  const decoded = await decodeStoragePayload(payload);
  return {
    payload: decoded.payload,
    rewriteToVault: decoded.rewriteToVault,
  };
}

function toMetaRecord(record: PlanningRunRecord): PlanningRunRecord {
  const outputs = compactRunOutputs(record.outputs, { storeRawOutputs: true });
  return {
    ...record,
    schemaVersion: RUN_SCHEMA_VERSION,
    outputs,
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

async function readRunMetaByPath(filePath: string): Promise<PlanningRunRecord | null> {
  const loaded = await readJsonFile(filePath);
  if (!loaded) return null;
  const decoded = await fromStoredPayload(loaded);
  const parsed = decoded.payload;
  if (!isRunRecord(parsed)) return null;
  try {
    const canonical = loadCanonicalRun(parsed);
    const record = toMetaRecord(canonical.run);
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, await toStoredPayload(record));
    }
    return record;
  } catch {
    return null;
  }
}

async function findPartitionMetaPathByRunId(runId: string): Promise<string | null> {
  const safeRunId = sanitizeRecordId(runId);
  const partitionRoot = resolveProfilePartitionsDir();
  let profileEntries: Awaited<ReturnType<typeof fs.readdir>>;
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

async function readRunMeta(id: string, profileIdHint?: string): Promise<PlanningRunRecord | null> {
  const paths = getRunPaths(id, profileIdHint);
  if (paths.partitionMetaPath) {
    const fromPartition = await readRunMetaByPath(paths.partitionMetaPath);
    if (fromPartition) return fromPartition;
  }
  if (!paths.partitionMetaPath) {
    const partitionMetaPath = await findPartitionMetaPathByRunId(paths.runId);
    if (partitionMetaPath) {
      const fromPartition = await readRunMetaByPath(partitionMetaPath);
      if (fromPartition) return fromPartition;
    }
  }

  const fromLegacyMeta = await readRunMetaByPath(paths.legacyMetaPath);
  if (fromLegacyMeta) {
    await tryMigrateLegacyRunToPartition(fromLegacyMeta, getRunPaths(id, fromLegacyMeta.profileId));
    return fromLegacyMeta;
  }

  const fromLegacyFile = await readRunMetaByPath(paths.legacyFilePath);
  if (fromLegacyFile) {
    await tryMigrateLegacyRunToPartition(fromLegacyFile, getRunPaths(id, fromLegacyFile.profileId));
    return fromLegacyFile;
  }

  return null;
}

async function scanPartitionRunsForIndex(): Promise<RunIndexEntry[]> {
  const partitionRoot = resolveProfilePartitionsDir();
  let profileEntries: Awaited<ReturnType<typeof fs.readdir>>;
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
    let runEntries: Awaited<ReturnType<typeof fs.readdir>>;
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
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
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

async function writeRunIndex(entries: RunIndexEntry[]): Promise<void> {
  const filePath = resolveRunsIndexPath();
  const payload: RunIndexFile = {
    version: RUN_INDEX_VERSION,
    entries: sortByCreatedAtDesc(entries) as RunIndexEntry[],
  };
  await writeJsonAtomic(filePath, await toStoredPayload(payload));
}

async function readRunIndex(): Promise<RunIndexEntry[]> {
  const filePath = resolveRunsIndexPath();
  const loaded = await readJsonFile(filePath);
  const decoded = loaded === null ? null : await fromStoredPayload(loaded);
  const decodedPayload = decoded?.payload ?? loaded;
  const parsed = parseRunIndex(decodedPayload);
  if (parsed.length > 0 || (isRecord(decodedPayload) && Array.isArray(decodedPayload.entries))) {
    if (decoded?.rewriteToVault) {
      await writeRunIndex(parsed);
    }
    return parsed;
  }

  const scanned = await scanRunsDirForIndex();
  if (scanned.length > 0 || loaded !== null) {
    await writeRunIndex(scanned);
  }
  return scanned;
}

async function upsertRunIndexEntry(entry: RunIndexEntry): Promise<void> {
  const entries = await readRunIndex();
  const next = entries.filter((row) => row.id !== entry.id);
  next.push(entry);
  await writeRunIndex(next);
}

async function removeRunIndexEntry(id: string): Promise<void> {
  const entries = await readRunIndex();
  const next = entries.filter((row) => row.id !== id);
  if (next.length === entries.length) return;
  await writeRunIndex(next);
}

function stageIdToBlobName(id: PlanningRunStageId): RunBlobName | null {
  if (id === "simulate") return "simulate";
  if (id === "scenarios") return "scenarios";
  if (id === "monteCarlo") return "monteCarlo";
  if (id === "actions") return "actions";
  if (id === "debt") return "debtStrategy";
  return null;
}

async function writeBlob(
  profileId: string,
  runId: string,
  blobName: RunBlobName,
  payload: unknown,
): Promise<{ name: RunBlobName; path: string; sizeBytes: number } | null> {
  if (!normalizeBlobName(blobName)) return null;
  const blobPath = path.join(resolveProfileRunBlobsDir(profileId, runId), `${blobName}.json`);
  await writeJsonAtomic(blobPath, await toStoredPayload(payload));
  const stat = await fs.stat(blobPath).catch(() => null);
  return {
    name: blobName,
    path: normalizeRelativePath(blobPath),
    sizeBytes: stat?.size ?? 0,
  };
}

async function readBlob(runId: string, blobName: RunBlobName): Promise<unknown | null> {
  if (!normalizeBlobName(blobName)) return null;
  const run = await getRun(runId);
  const blobPath = run
    ? path.join(resolveProfileRunBlobsDir(run.profileId, run.id), `${blobName}.json`)
    : path.join(resolveRunBlobsDir(runId), `${blobName}.json`);
  const loaded = await readJsonFile(blobPath);
  if (loaded !== null) {
    const decoded = await fromStoredPayload(loaded);
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(blobPath, await toStoredPayload(decoded.payload));
    }
    return decoded.payload;
  }

  const legacy = await readRunMeta(runId);
  if (!legacy) return null;

  if (blobName === "simulate") return legacy.outputs.simulate ?? null;
  if (blobName === "scenarios") return legacy.outputs.scenarios ?? null;
  if (blobName === "monteCarlo") return legacy.outputs.monteCarlo ?? null;
  if (blobName === "actions") return legacy.outputs.actions ?? null;
  if (blobName === "debtStrategy") return legacy.outputs.debtStrategy ?? null;
  if (blobName === "raw") {
    return {
      run: legacy,
      outputs: {
        simulate: legacy.outputs.simulate,
        scenarios: legacy.outputs.scenarios,
        monteCarlo: legacy.outputs.monteCarlo,
        actions: legacy.outputs.actions,
        debtStrategy: legacy.outputs.debtStrategy,
      },
    };
  }

  return null;
}

function attachBlobRef<T extends Record<string, unknown>>(
  value: T | undefined,
  ref: { name: RunBlobName; path: string; sizeBytes: number } | null,
): T | undefined {
  if (!value) return undefined;
  if (!ref) return value;
  return {
    ...value,
    ref: {
      name: ref.name,
      path: ref.path,
      ...(typeof ref.sizeBytes === "number" ? { sizeBytes: ref.sizeBytes } : {}),
    },
  };
}

function withStageBlobRefs(
  outputs: PlanningRunRecord["outputs"],
  refs: Partial<Record<RunBlobName, { name: RunBlobName; path: string; sizeBytes: number }>>,
): PlanningRunRecord["outputs"] {
  const source = asRecord(outputs);
  const simulateRef = refs.simulate
    ? { ref: { name: refs.simulate.name, path: refs.simulate.path, ...(typeof refs.simulate.sizeBytes === "number" ? { sizeBytes: refs.simulate.sizeBytes } : {}) } }
    : undefined;
  const scenariosRef = refs.scenarios
    ? { ref: { name: refs.scenarios.name, path: refs.scenarios.path, ...(typeof refs.scenarios.sizeBytes === "number" ? { sizeBytes: refs.scenarios.sizeBytes } : {}) } }
    : undefined;
  const monteRef = refs.monteCarlo
    ? { ref: { name: refs.monteCarlo.name, path: refs.monteCarlo.path, ...(typeof refs.monteCarlo.sizeBytes === "number" ? { sizeBytes: refs.monteCarlo.sizeBytes } : {}) } }
    : undefined;
  const actionsRef = refs.actions
    ? { ref: { name: refs.actions.name, path: refs.actions.path, ...(typeof refs.actions.sizeBytes === "number" ? { sizeBytes: refs.actions.sizeBytes } : {}) } }
    : undefined;
  const debtRef = refs.debtStrategy
    ? { ref: { name: refs.debtStrategy.name, path: refs.debtStrategy.path, ...(typeof refs.debtStrategy.sizeBytes === "number" ? { sizeBytes: refs.debtStrategy.sizeBytes } : {}) } }
    : undefined;

  return {
    ...(source.resultDto !== undefined ? { resultDto: source.resultDto as PlanningRunRecord["outputs"]["resultDto"] } : {}),
    ...(isRecord(source.simulate)
      ? {
        simulate: attachBlobRef(
          source.simulate as PlanningRunRecord["outputs"]["simulate"],
          refs.simulate ?? null,
        ),
      }
      : (simulateRef ? { simulate: simulateRef } : {})),
    ...(isRecord(source.scenarios)
      ? {
        scenarios: attachBlobRef(
          source.scenarios as PlanningRunRecord["outputs"]["scenarios"],
          refs.scenarios ?? null,
        ),
      }
      : (scenariosRef ? { scenarios: scenariosRef } : {})),
    ...(isRecord(source.monteCarlo)
      ? {
        monteCarlo: attachBlobRef(
          source.monteCarlo as PlanningRunRecord["outputs"]["monteCarlo"],
          refs.monteCarlo ?? null,
        ),
      }
      : (monteRef ? { monteCarlo: monteRef } : {})),
    ...(isRecord(source.actions)
      ? {
        actions: attachBlobRef(
          source.actions as PlanningRunRecord["outputs"]["actions"],
          refs.actions ?? null,
        ),
      }
      : (actionsRef ? { actions: actionsRef } : {})),
    ...(isRecord(source.debtStrategy)
      ? {
        debtStrategy: attachBlobRef(
          source.debtStrategy as PlanningRunRecord["outputs"]["debtStrategy"],
          refs.debtStrategy ?? null,
        ),
      }
      : (debtRef ? { debtStrategy: debtRef } : {})),
  };
}

function withStageOutputRefs(
  stages: PlanningRunRecord["stages"],
  refs: Partial<Record<RunBlobName, { name: RunBlobName; path: string; sizeBytes: number }>>,
): PlanningRunRecord["stages"] {
  if (!Array.isArray(stages)) return stages;
  return stages.map((stage) => {
    const blobName = stageIdToBlobName(stage.id);
    if (!blobName) return stage;
    const ref = refs[blobName];
    if (!ref || !stage.outputRef) return stage;
    return {
      ...stage,
      outputRef: {
        ...stage.outputRef,
        ref: {
          name: ref.name,
          path: ref.path,
          ...(typeof ref.sizeBytes === "number" ? { sizeBytes: ref.sizeBytes } : {}),
        },
      },
    };
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

export async function getRunBlob(id: string, name: string): Promise<unknown | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const blobName = normalizeBlobName(name);
  if (!blobName) return null;

  if (blobName === "raw") {
    const run = await getRun(safeId);
    if (!run) return null;
    const outputs = {
      simulate: await readBlob(safeId, "simulate"),
      scenarios: await readBlob(safeId, "scenarios"),
      monteCarlo: await readBlob(safeId, "monteCarlo"),
      actions: await readBlob(safeId, "actions"),
      debtStrategy: await readBlob(safeId, "debtStrategy"),
    };
    return { run, outputs };
  }

  return readBlob(safeId, blobName);
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

  const runId = input.id ? sanitizeRecordId(input.id) : crypto.randomUUID();
  const profileId = sanitizeRecordId(input.profileId);
  const createdAt = input.createdAt && Number.isFinite(Date.parse(input.createdAt))
    ? new Date(input.createdAt).toISOString()
    : new Date().toISOString();

  const sourceOutputs = compactRunOutputs(input.outputs, {
    ...options,
    storeRawOutputs: true,
  });

  const blobRefs: Partial<Record<RunBlobName, { name: RunBlobName; path: string; sizeBytes: number }>> = {};

  if (isRecord(sourceOutputs.simulate)) {
    blobRefs.simulate = await writeBlob(profileId, runId, "simulate", sourceOutputs.simulate) ?? undefined;
  }
  if (isRecord(sourceOutputs.scenarios)) {
    blobRefs.scenarios = await writeBlob(profileId, runId, "scenarios", sourceOutputs.scenarios) ?? undefined;
  }
  if (isRecord(sourceOutputs.monteCarlo)) {
    blobRefs.monteCarlo = await writeBlob(profileId, runId, "monteCarlo", sourceOutputs.monteCarlo) ?? undefined;
  }
  if (isRecord(sourceOutputs.actions)) {
    blobRefs.actions = await writeBlob(profileId, runId, "actions", sourceOutputs.actions) ?? undefined;
  }
  if (isRecord(sourceOutputs.debtStrategy)) {
    blobRefs.debtStrategy = await writeBlob(profileId, runId, "debtStrategy", sourceOutputs.debtStrategy) ?? undefined;
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

  await upsertRunIndexEntry(toRunIndexEntry(record));

  if (options?.enforceRetention !== false) {
    await purgeRunsByRetention({
      profileId: record.profileId,
      maxPerProfile: options?.maxPerProfile ?? DEFAULT_RUNS_PER_PROFILE_RETENTION,
    });
  }

  return record;
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
