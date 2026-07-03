import crypto from "node:crypto";
import path from "node:path";
import { runPlanningMigrationsOnStartup } from "../migrations/manager";
import { sanitizeRecordId } from "./paths";
import {
  deleteRunMetaFromTrash,
  hardDeleteRunFiles,
  moveRunMetaToTrash,
  restoreRunMetaFromTrash,
} from "./runTrashStore";
import {
  normalizeRunBlobName,
  readRunBlobPayload,
} from "./runBlobStore";
import {
  type LegacyRunBackfillCandidate,
  type LegacyRunBackfillResult,
  type LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";
import { createRunLegacyBackfillStore } from "./runLegacyBackfillStore";
import {
  fromStoredPayload,
  readJsonFile,
} from "./runRecordCodec";
import {
  isEngineEnvelopeLike,
  normalizeRawRunForBackfill,
  toMetaRecord,
} from "./runMetaRecord";
import {
  readRunMetaRecordByPath,
  readRunMetaRecordByPathDetailed,
  type ReadRunMetaRecordOptions,
} from "./runMetaReader";
import {
  createRunReadDiagnosticRecorder,
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
import {
  createRunInFileStore,
  type RunCreateStoreOptions,
  type RunCreateStoreSource,
} from "./runCreateStore";
import { writeRunMetaRecord } from "./runMetaWriter";
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

type CreateRunOptions = RunCreateStoreOptions;

type CreateRunInput = RunCreateStoreSource;

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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

async function readRunMetaByPath(
  filePath: string,
  options?: ReadRunMetaRecordOptions,
): Promise<PlanningRunRecord | null> {
  return readRunMetaRecordByPath(filePath, options);
}

async function readRunMeta(
  id: string,
  profileIdHint?: string,
  options?: ReadRunMetaRecordOptions,
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

const legacyRunBackfillStore = createRunLegacyBackfillStore({
  listIndexEntries: runIndexStore.read,
  readRunForCandidate: (candidate, options) => readRunMeta(candidate.id, candidate.profileId, options),
  ensureStartupMigrations,
  isEngineEnvelopeLike,
  readJsonFile,
  decodeStoredPayload: fromStoredPayload,
  normalizeRawRun: normalizeRawRunForBackfill,
});

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
    const result = await readRunMetaRecordByPathDetailed(candidate.filePath);
    diagnostics.recordAttempt(candidate.source, candidate.filePath, result);
    if (result.status === "found") {
      return diagnostics.found(result.run);
    }
  }

  return diagnostics.final();
}

export async function summarizeLegacyRunBackfill(): Promise<LegacyRunBackfillSummary> {
  assertServerOnly();
  return legacyRunBackfillStore.summarize();
}

export async function listLegacyRunBackfillCandidates(options?: {
  limit?: number;
  includeOpsDoctor?: boolean;
}): Promise<LegacyRunBackfillCandidate[]> {
  assertServerOnly();
  return legacyRunBackfillStore.listCandidates(options);
}

export async function backfillLegacyRuns(options?: {
  limit?: number;
  includeOpsDoctor?: boolean;
}): Promise<LegacyRunBackfillResult> {
  assertServerOnly();
  return legacyRunBackfillStore.backfill(options);
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
    id: current.id,
    profileId: current.profileId,
    createdAt: current.createdAt,
    version: 1,
  });
  await writeRunMetaRecord(next);
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

  return createRunInFileStore({
    source: input,
    runId,
    profileId,
    createdAt,
    options,
    upsertIndexEntry: (entry) => runIndexStore.upsert(entry),
    removeIndexEntry: (id) => runIndexStore.remove(id),
    applyRetention: (record, retentionOptions) => purgeRunsByRetention({
      profileId: record.profileId,
      maxPerProfile: retentionOptions?.maxPerProfile ?? DEFAULT_RUNS_PER_PROFILE_RETENTION,
    }).then(() => undefined),
  });
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
