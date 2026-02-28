import fs from "node:fs/promises";
import path from "node:path";
import {
  decryptPlanningJson,
  encryptPlanningJson,
  isPlanningEncryptedEnvelope,
} from "../crypto/encrypt";
import {
  resolveRunPath,
  resolveRunsDir,
  sanitizeRecordId,
} from "./paths";
import { getPlanningStorageSecurityOptions } from "./security";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  restoreFileFromTrash,
} from "./trash";
import { type PlanningRunRecord } from "./types";

export const DEFAULT_RUNS_PER_PROFILE_RETENTION = 50;

type ListRunsOptions = {
  profileId?: string;
  limit?: number;
  offset?: number;
};

type CreateRunOptions = {
  enforceRetention?: boolean;
  maxPerProfile?: number;
};

type CreateRunInput = Omit<PlanningRunRecord, "version" | "id" | "createdAt"> & {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRunRecord(value: unknown): value is PlanningRunRecord {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (typeof value.profileId !== "string" || !value.profileId.trim()) return false;
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) return false;
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

function sortByCreatedAtDesc(records: PlanningRunRecord[]): PlanningRunRecord[] {
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

async function toStoredPayload(payload: unknown): Promise<unknown> {
  const options = getPlanningStorageSecurityOptions();
  if (!options.encryptionEnabled) return payload;
  if (!options.encryptionPassphrase) {
    throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  return encryptPlanningJson(payload, options.encryptionPassphrase);
}

async function readRunFile(filePath: string): Promise<PlanningRunRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const options = getPlanningStorageSecurityOptions();
    const parsed = options.encryptionEnabled && isPlanningEncryptedEnvelope(loaded)
      ? await decryptPlanningJson(loaded, options.encryptionPassphrase ?? "")
      : loaded;
    if (!isRunRecord(parsed)) return null;
    return parsed;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function listAllRuns(): Promise<PlanningRunRecord[]> {
  const dirPath = resolveRunsDir();
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const records: PlanningRunRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(dirPath, entry.name);
    const record = await readRunFile(filePath);
    if (record) records.push(record);
  }
  return sortByCreatedAtDesc(records);
}

export async function listRuns(options?: ListRunsOptions): Promise<PlanningRunRecord[]> {
  assertServerOnly();

  const all = await listAllRuns();
  const filtered = typeof options?.profileId === "string" && options.profileId.trim()
    ? all.filter((row) => row.profileId === options.profileId?.trim())
    : all;

  const offset = toSafeOffset(options?.offset);
  const limit = toSafeLimit(options?.limit, 100);
  return filtered.slice(offset, offset + limit);
}

export async function getRun(id: string): Promise<PlanningRunRecord | null> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const filePath = resolveRunPath(safeId);
  return readRunFile(filePath);
}

export async function purgeRunsByRetention(options?: PurgeRunsOptions): Promise<string[]> {
  assertServerOnly();

  const maxPerProfile = toSafeLimit(options?.maxPerProfile, DEFAULT_RUNS_PER_PROFILE_RETENTION);
  const all = await listAllRuns();
  const target = options?.profileId?.trim()
    ? all.filter((row) => row.profileId === options.profileId?.trim())
    : all;

  const grouped = new Map<string, PlanningRunRecord[]>();
  for (const row of target) {
    const list = grouped.get(row.profileId) ?? [];
    list.push(row);
    grouped.set(row.profileId, list);
  }

  const removedIds: string[] = [];
  for (const runs of grouped.values()) {
    const sorted = sortByCreatedAtDesc(runs);
    const purgeTargets = sorted.slice(maxPerProfile);
    for (const row of purgeTargets) {
      const removed = await moveFileToTrash(resolveRunPath(row.id), {
        kind: "runs",
        id: row.id,
        ext: ".json",
      });
      if (removed) removedIds.push(row.id);
    }
  }

  return removedIds;
}

export async function createRun(input: CreateRunInput, options?: CreateRunOptions): Promise<PlanningRunRecord> {
  assertServerOnly();

  const record: PlanningRunRecord = {
    version: 1,
    id: input.id ? sanitizeRecordId(input.id) : crypto.randomUUID(),
    profileId: sanitizeRecordId(input.profileId),
    ...(typeof input.title === "string" && input.title.trim() ? { title: input.title.trim() } : {}),
    createdAt: input.createdAt && Number.isFinite(Date.parse(input.createdAt))
      ? new Date(input.createdAt).toISOString()
      : new Date().toISOString(),
    input: input.input,
    meta: input.meta,
    outputs: input.outputs,
  };

  const filePath = resolveRunPath(record.id);
  await writeJsonAtomic(filePath, await toStoredPayload(record));

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
  const filePath = resolveRunPath(safeId);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

export async function restoreRunFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  return restoreFileFromTrash(resolveRunPath(safeId), {
    kind: "runs",
    id: safeId,
    ext: ".json",
  });
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
  return moveFileToTrash(resolveRunPath(safeId), {
    kind: "runs",
    id: safeId,
    ext: ".json",
  });
}
