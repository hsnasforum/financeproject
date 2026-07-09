import crypto from "node:crypto";
import { sanitizeRecordId } from "./paths";
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
import { type ReadRunMetaRecordOptions } from "./runMetaReader";
import { type RunReadDiagnostic } from "./runReadObservability";
import { createRunReadStore } from "./runReadStore";
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
import { createRunDeleteStore } from "./runDeleteStore";
import { writeRunMetaRecord } from "./runMetaWriter";
import {
  createRunRetentionStore,
  type RunRetentionPurgeOptions,
} from "./runRetentionStore";
import { ensurePlanningStartupMigrations } from "./startupMigrationGate";
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

type PurgeRunsOptions = RunRetentionPurgeOptions;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning run store is server-only.");
  }
}

assertServerOnly();

async function ensureStartupMigrations(): Promise<void> {
  await ensurePlanningStartupMigrations();
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

const runReadStore = createRunReadStore();

async function readRunMeta(
  id: string,
  profileIdHint?: string,
  options?: ReadRunMetaRecordOptions,
): Promise<PlanningRunRecord | null> {
  return runReadStore.readRunMeta(id, profileIdHint, options);
}

const runIndexStore = createRunIndexStore({ readRunMeta });
const runDeleteStore = createRunDeleteStore({
  getRun: (id) => getRun(id),
  removeIndexEntry: (id) => runIndexStore.remove(id),
  upsertIndexEntry: (entry) => runIndexStore.upsert(entry),
});
const runRetentionStore = createRunRetentionStore({
  defaultMaxPerProfile: DEFAULT_RUNS_PER_PROFILE_RETENTION,
  deleteRun: (id) => runDeleteStore.deleteRun(id),
  listIndexEntries: () => runIndexStore.read(),
});

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
  return runReadStore.diagnoseRunRead(safeId, hintedProfileId);
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
  return runRetentionStore.purgeRunsByRetention(options);
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
  return runDeleteStore.hardDeleteRun(id);
}

export async function restoreRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  return runDeleteStore.restoreRunFromTrash(id);
}

export async function hardDeleteRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  return runDeleteStore.hardDeleteRunFromTrash(id);
}

export async function deleteRun(id: string): Promise<boolean> {
  assertServerOnly();
  return runDeleteStore.deleteRun(id);
}
