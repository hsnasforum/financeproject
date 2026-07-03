import fs from "node:fs/promises";

import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "./paths";
import {
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import { type PlanningRunRecord } from "./types";

export type WrittenRunMetaRecord = {
  metaPath: string;
  runDir: string;
};

export async function writeRunMetaRecord(record: PlanningRunRecord): Promise<WrittenRunMetaRecord> {
  const runDir = resolveProfileRunDir(record.profileId, record.id);
  const metaPath = resolveProfileRunMetaPath(record.profileId, record.id);
  await fs.mkdir(runDir, { recursive: true });
  await writeJsonAtomic(metaPath, await toStoredPayload(record));
  return { metaPath, runDir };
}
