import fs from "node:fs/promises";
import {
  readJsonFile,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import { type RunPaths } from "./runReadSources";
import { type PlanningRunRecord } from "./types";

// Skip reasons describe migration control flow, not partition record validity.
export type LegacyRunPartitionMigrationSkipReason =
  | "missing-partition-target"
  | "partition-meta-readable";

export type LegacyRunPartitionMigrationResult =
  | {
      migrated: true;
    }
  | {
      migrated: false;
      reason: LegacyRunPartitionMigrationSkipReason;
    };

export async function migrateLegacyRunToPartitionDetailed(input: {
  record: PlanningRunRecord;
  paths: RunPaths;
}): Promise<LegacyRunPartitionMigrationResult> {
  const { record, paths } = input;
  if (!paths.profileId || !paths.partitionMetaPath || !paths.partitionRunDir) {
    return {
      migrated: false,
      reason: "missing-partition-target",
    };
  }

  const existing = await readJsonFile(paths.partitionMetaPath);
  if (existing !== null) {
    return {
      migrated: false,
      reason: "partition-meta-readable",
    };
  }

  await fs.mkdir(paths.partitionRunDir, { recursive: true });
  await writeJsonAtomic(paths.partitionMetaPath, await toStoredPayload(record));
  await fs.unlink(paths.legacyMetaPath).catch(() => undefined);
  await fs.unlink(paths.legacyFilePath).catch(() => undefined);
  return { migrated: true };
}

export async function migrateLegacyRunToPartition(input: {
  record: PlanningRunRecord;
  paths: RunPaths;
}): Promise<boolean> {
  const result = await migrateLegacyRunToPartitionDetailed(input);
  return result.migrated;
}
