import fs from "node:fs/promises";
import path from "node:path";

import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
} from "../storage/journal";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "./paths";
import {
  createRunBlobWriteStore,
  type WriteRunStageBlobs,
} from "./runBlobWriteStore";
import {
  toRunIndexEntry,
  type RunIndexEntry,
} from "./runIndex";
import {
  buildCreateRunRecord,
} from "./runMetaRecord";
import { writeRunMetaRecord } from "./runMetaWriter";
import { type PlanningRunRecord } from "./types";

export type RunCreateStoreOptions = {
  enforceRetention?: boolean;
  maxPerProfile?: number;
  storeRawOutputs?: boolean;
  timelineSampleStepMonths?: number;
};

export type RunCreateStoreSource = Omit<PlanningRunRecord, "version" | "schemaVersion" | "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export type CreateRunInFileStoreInput = {
  applyRetention: (record: PlanningRunRecord, options?: RunCreateStoreOptions) => Promise<void>;
  createdAt: string;
  options?: RunCreateStoreOptions;
  profileId: string;
  removeIndexEntry: (runId: string) => Promise<void>;
  runId: string;
  source: RunCreateStoreSource;
  upsertIndexEntry: (entry: RunIndexEntry) => Promise<void>;
  writeRunStageBlobs?: WriteRunStageBlobs;
};

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

const defaultRunBlobWriteStore = createRunBlobWriteStore();

export async function createRunInFileStore(input: CreateRunInFileStoreInput): Promise<PlanningRunRecord> {
  const tx = await beginStorageTransaction("RUN_CREATE", {
    runId: input.runId,
    profileId: input.profileId,
    runDir: normalizeRelativePath(resolveProfileRunDir(input.profileId, input.runId)),
    runMetaPath: normalizeRelativePath(resolveProfileRunMetaPath(input.profileId, input.runId)),
  });

  let createdRecord: PlanningRunRecord | null = null;
  const writeRunStageBlobs = input.writeRunStageBlobs ?? defaultRunBlobWriteStore.writeRunStageBlobs;

  try {
    const blobRefs = await writeRunStageBlobs({
      profileId: input.profileId,
      runId: input.runId,
      outputs: input.source.outputs,
      options: input.options,
      tx,
    });

    const record = buildCreateRunRecord({
      source: input.source,
      runId: input.runId,
      profileId: input.profileId,
      createdAt: input.createdAt,
      blobRefs,
      options: input.options,
    });

    const { metaPath } = await writeRunMetaRecord(record);
    await appendStorageTransactionStep(tx, "WRITE_META", {
      path: normalizeRelativePath(metaPath),
    });

    await input.upsertIndexEntry(toRunIndexEntry(record));
    await appendStorageTransactionStep(tx, "UPSERT_INDEX", {
      runId: record.id,
    });

    if (input.options?.enforceRetention !== false) {
      await input.applyRetention(record, input.options);
      await appendStorageTransactionStep(tx, "APPLY_RETENTION", {
        profileId: record.profileId,
      });
    }

    createdRecord = record;
    await endStorageTransaction(tx, "COMMIT");
    return record;
  } catch (error) {
    await endStorageTransaction(
      tx,
      "ROLLBACK",
      error instanceof Error ? error.message : "create run failed",
    ).catch(() => undefined);
    await fs.rm(resolveProfileRunDir(input.profileId, input.runId), { recursive: true, force: true }).catch(() => undefined);
    await input.removeIndexEntry(input.runId).catch(() => undefined);
    if (createdRecord) {
      await fs.rm(resolveProfileRunDir(createdRecord.profileId, createdRecord.id), { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }
}
