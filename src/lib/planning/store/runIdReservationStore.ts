import { type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  resolveProfilePartitionsDir,
  resolveProfileRunDir,
  resolveRunDir,
  resolveRunPath,
  sanitizeRecordId,
} from "./paths";
import { resolveTrashKindDir } from "./trash";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }
}

async function hasPartitionRunTarget(runId: string): Promise<boolean> {
  let profileEntries: Dirent[];
  try {
    profileEntries = await fs.readdir(resolveProfilePartitionsDir(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }

  for (const profileEntry of profileEntries) {
    if (!profileEntry.isDirectory()) continue;
    let candidatePath: string;
    try {
      candidatePath = resolveProfileRunDir(profileEntry.name, runId);
    } catch {
      continue;
    }
    if (await pathExists(candidatePath)) return true;
  }
  return false;
}

export async function hasRunIdReservation(id: string): Promise<boolean> {
  const safeId = sanitizeRecordId(id);
  const [partitionTarget, legacyDir, legacyFile, trashedMeta] = await Promise.all([
    hasPartitionRunTarget(safeId),
    pathExists(resolveRunDir(safeId)),
    pathExists(resolveRunPath(safeId)),
    pathExists(path.join(resolveTrashKindDir("runs"), `${safeId}.json`)),
  ]);
  return partitionTarget || legacyDir || legacyFile || trashedMeta;
}
