import {
  appendStorageTransactionStep,
  type StorageTransactionContext,
} from "../storage/journal";
import {
  writeStageBlobs,
  type RunBlobName,
  type RunBlobRef,
} from "./runBlobStore";
import { compactRawRunOutputs } from "./runMetaRecord";
import { type PlanningRunRecord } from "./types";

type RunBlobWriteOptions = {
  storeRawOutputs?: boolean;
  timelineSampleStepMonths?: number;
};

type CompactOutputs = typeof compactRawRunOutputs;
type WriteStageBlobs = typeof writeStageBlobs;
type AppendTransactionStep = typeof appendStorageTransactionStep;

export type WriteRunStageBlobsInput = {
  outputs: PlanningRunRecord["outputs"];
  options?: RunBlobWriteOptions;
  profileId: string;
  runId: string;
  tx?: StorageTransactionContext;
};

export type WriteRunStageBlobs = (
  input: WriteRunStageBlobsInput,
) => Promise<Partial<Record<RunBlobName, RunBlobRef>>>;

export type RunBlobWriteStoreDependencies = {
  appendTransactionStep?: AppendTransactionStep;
  compactOutputs?: CompactOutputs;
  writeStageBlobs?: WriteStageBlobs;
};

export function createRunBlobWriteStore(dependencies: RunBlobWriteStoreDependencies = {}): {
  writeRunStageBlobs: WriteRunStageBlobs;
} {
  const appendTransactionStep = dependencies.appendTransactionStep ?? appendStorageTransactionStep;
  const compactOutputs = dependencies.compactOutputs ?? compactRawRunOutputs;
  const writeBlobs = dependencies.writeStageBlobs ?? writeStageBlobs;

  return {
    async writeRunStageBlobs(input) {
      const sourceOutputs = compactOutputs(input.outputs, {
        ...input.options,
      });
      const blobRefs = await writeBlobs({
        profileId: input.profileId,
        runId: input.runId,
        outputs: sourceOutputs,
      });

      if (input.tx) {
        for (const [blob, ref] of Object.entries(blobRefs) as Array<[RunBlobName, RunBlobRef | undefined]>) {
          if (!ref) continue;
          await appendTransactionStep(input.tx, "WRITE_BLOB", {
            blob,
            path: ref.path,
            sizeBytes: ref.sizeBytes,
          });
        }
      }

      return blobRefs;
    },
  };
}
