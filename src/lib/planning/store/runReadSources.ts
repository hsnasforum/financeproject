import { type Dirent } from "node:fs";
import fs from "node:fs/promises";
import {
  resolveProfilePartitionsDir,
  resolveProfileRunBlobsDir,
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  resolveRunDir,
  resolveRunMetaPath,
  resolveRunPath,
  sanitizeRecordId,
} from "./paths";

export type RunPaths = {
  runId: string;
  profileId?: string;
  partitionMetaPath?: string;
  partitionRunDir?: string;
  partitionBlobDir?: string;
  legacyMetaPath: string;
  legacyFilePath: string;
  legacyRunDir: string;
};

export type RunReadSourceKind = "partition-hint" | "partition-scan" | "legacy-meta" | "legacy-file";

export type RunReadSource = {
  source: RunReadSourceKind;
  filePath: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getRunPaths(runId: string, profileId?: string): RunPaths {
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

export async function findPartitionMetaPathByRunId(runId: string): Promise<string | null> {
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

export async function resolveRunReadSources(runId: string, profileIdHint?: string): Promise<{
  paths: RunPaths;
  sources: RunReadSource[];
}> {
  const paths = getRunPaths(runId, profileIdHint);
  const sources: RunReadSource[] = [];

  if (paths.partitionMetaPath) {
    sources.push({
      source: "partition-hint",
      filePath: paths.partitionMetaPath,
    });
  } else {
    const partitionMetaPath = await findPartitionMetaPathByRunId(paths.runId);
    if (partitionMetaPath) {
      sources.push({
        source: "partition-scan",
        filePath: partitionMetaPath,
      });
    }
  }

  sources.push(
    {
      source: "legacy-meta",
      filePath: paths.legacyMetaPath,
    },
    {
      source: "legacy-file",
      filePath: paths.legacyFilePath,
    },
  );

  return { paths, sources };
}
