import {
  normalizeRunBlobName,
  readRunBlobPayload,
  type RunBlobName,
} from "./runBlobStore";
import { type PlanningRunRecord } from "./types";

type RunForBlobRead = Pick<PlanningRunRecord, "id" | "profileId" | "outputs">;
type GetRun = (id: string) => Promise<PlanningRunRecord | null>;
type NormalizeBlobName = (name: unknown) => RunBlobName | null;
type ReadBlobPayload = typeof readRunBlobPayload;

export type RunBlobReadStoreDependencies = {
  getRun: GetRun;
  normalizeBlobName?: NormalizeBlobName;
  readBlobPayload?: ReadBlobPayload;
};

const STAGE_BLOB_NAMES: Array<Exclude<RunBlobName, "raw">> = [
  "simulate",
  "scenarios",
  "monteCarlo",
  "actions",
  "debtStrategy",
];

export function createRunBlobReadStore(dependencies: RunBlobReadStoreDependencies): {
  getRunBlob: (id: string, name: string) => Promise<unknown | null>;
} {
  const normalizeBlobName = dependencies.normalizeBlobName ?? normalizeRunBlobName;
  const readBlobPayload = dependencies.readBlobPayload ?? readRunBlobPayload;

  async function readStageBlob(runId: string, blobName: Exclude<RunBlobName, "raw">, run: RunForBlobRead): Promise<unknown | null> {
    return readBlobPayload({ runId, blobName, run, fallbackRun: run });
  }

  return {
    async getRunBlob(id, name) {
      const blobName = normalizeBlobName(name);
      if (!blobName) return null;

      if (blobName === "raw") {
        const run = await dependencies.getRun(id);
        if (!run) return null;
        const outputs: Record<Exclude<RunBlobName, "raw">, unknown | null> = {
          simulate: null,
          scenarios: null,
          monteCarlo: null,
          actions: null,
          debtStrategy: null,
        };
        for (const stageBlobName of STAGE_BLOB_NAMES) {
          outputs[stageBlobName] = await readStageBlob(id, stageBlobName, run);
        }
        return { run, outputs };
      }

      const run = await dependencies.getRun(id);
      return readBlobPayload({ runId: id, blobName, run, fallbackRun: run });
    },
  };
}
