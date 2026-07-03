import fs from "node:fs/promises";
import {
  readJsonFile,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import { type RunPaths } from "./runReadSources";
import { type PlanningRunRecord } from "./types";

export async function migrateLegacyRunToPartition(input: {
  record: PlanningRunRecord;
  paths: RunPaths;
}): Promise<boolean> {
  const { record, paths } = input;
  if (!paths.profileId || !paths.partitionMetaPath || !paths.partitionRunDir) return false;
  const existing = await readJsonFile(paths.partitionMetaPath);
  if (existing !== null) return false;

  await fs.mkdir(paths.partitionRunDir, { recursive: true });
  await writeJsonAtomic(paths.partitionMetaPath, await toStoredPayload(record));
  await fs.unlink(paths.legacyMetaPath).catch(() => undefined);
  await fs.unlink(paths.legacyFilePath).catch(() => undefined);
  return true;
}
