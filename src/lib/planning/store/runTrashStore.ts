import fs from "node:fs/promises";
import path from "node:path";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  resolveRunDir,
  resolveRunMetaPath,
  resolveRunPath,
  sanitizeRecordId,
} from "./paths";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  resolveTrashKindDir,
  restoreFileFromTrash,
} from "./trash";
import {
  fromStoredPayload,
  readJsonFile,
} from "./runRecordCodec";
import { type PlanningRunRecord } from "./types";

export type RunTrashExistingRun = Pick<PlanningRunRecord, "profileId"> | null | undefined;

type RunTrashPaths = {
  id: string;
  runDir: string;
  metaPath: string;
  legacyPath: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function resolveRunTrashPaths(id: string, existing?: RunTrashExistingRun): RunTrashPaths {
  const safeId = sanitizeRecordId(id);
  const profileId = asString(existing?.profileId);
  return {
    id: safeId,
    runDir: profileId ? resolveProfileRunDir(profileId, safeId) : resolveRunDir(safeId),
    metaPath: profileId ? resolveProfileRunMetaPath(profileId, safeId) : resolveRunMetaPath(safeId),
    legacyPath: resolveRunPath(safeId),
  };
}

async function removePathIfPresent(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

async function removeDirIfPresent(dirPath: string, force: boolean): Promise<boolean> {
  try {
    await fs.rm(dirPath, { recursive: true, force });
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

export async function hardDeleteRunFiles(input: {
  id: string;
  existing?: RunTrashExistingRun;
}): Promise<boolean> {
  const paths = resolveRunTrashPaths(input.id, input.existing);
  const deletedDir = await removeDirIfPresent(paths.runDir, false);
  const deletedLegacyFile = await removePathIfPresent(paths.legacyPath);
  return deletedDir || deletedLegacyFile;
}

async function readTrashedRunProfileId(id: string): Promise<string> {
  const safeId = sanitizeRecordId(id);
  const trashMetaPath = path.join(resolveTrashKindDir("runs"), `${safeId}.json`);
  const trashedPayload = await readJsonFile(trashMetaPath);
  const decoded = trashedPayload === null ? null : await fromStoredPayload(trashedPayload);
  const trashedRecord = decoded?.payload;
  return isRunRecord(trashedRecord) ? trashedRecord.profileId : "";
}

export async function restoreRunMetaFromTrash(id: string): Promise<boolean> {
  const safeId = sanitizeRecordId(id);
  const restoredProfileId = await readTrashedRunProfileId(safeId);
  const metaPath = restoredProfileId
    ? resolveProfileRunMetaPath(restoredProfileId, safeId)
    : resolveRunMetaPath(safeId);
  return restoreFileFromTrash(metaPath, {
    kind: "runs",
    id: safeId,
    ext: ".json",
  });
}

export async function deleteRunMetaFromTrash(id: string): Promise<boolean> {
  const safeId = sanitizeRecordId(id);
  return deleteFileFromTrash({
    kind: "runs",
    id: safeId,
    ext: ".json",
  });
}

export async function moveRunMetaToTrash(input: {
  id: string;
  existing?: RunTrashExistingRun;
}): Promise<boolean> {
  const paths = resolveRunTrashPaths(input.id, input.existing);
  let moved = await moveFileToTrash(paths.metaPath, {
    kind: "runs",
    id: paths.id,
    ext: ".json",
  });

  if (!moved) {
    moved = await moveFileToTrash(paths.legacyPath, {
      kind: "runs",
      id: paths.id,
      ext: ".json",
    });
  }

  if (!moved) return false;

  await removeDirIfPresent(paths.runDir, true).catch(() => undefined);
  return true;
}
