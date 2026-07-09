import { type RunIndexEntry } from "./runIndex";
import {
  getRunPaths,
  type RunPaths,
} from "./runReadSources";
import { type PlanningRunRecord } from "./types";

type GetRunPaths = (runId: string, profileId?: string) => RunPaths;
type ReadJsonFile = (filePath: string) => Promise<unknown | null>;
type DecodeStoredPayload = (loaded: unknown) => Promise<{ payload: unknown }>;
type NormalizeRawRun = (value: unknown) => PlanningRunRecord | null;

export type RunLegacyBackfillReadStoreDependencies = {
  getPaths?: GetRunPaths;
  readJsonFile: ReadJsonFile;
  decodeStoredPayload: DecodeStoredPayload;
  normalizeRawRun: NormalizeRawRun;
};

export type RunLegacyBackfillReadStore = {
  readRawRunMetaByPath: (filePath: string) => Promise<PlanningRunRecord | null>;
  readRawRunForIndexEntry: (row: Pick<RunIndexEntry, "id" | "profileId">) => Promise<PlanningRunRecord | null>;
};

export function createRunLegacyBackfillReadStore(
  dependencies: RunLegacyBackfillReadStoreDependencies,
): RunLegacyBackfillReadStore {
  const resolvePaths = dependencies.getPaths ?? getRunPaths;

  async function readRawRunMetaByPath(filePath: string): Promise<PlanningRunRecord | null> {
    const loaded = await dependencies.readJsonFile(filePath);
    if (!loaded) return null;
    const decoded = await dependencies.decodeStoredPayload(loaded);
    return dependencies.normalizeRawRun(decoded.payload);
  }

  return {
    readRawRunMetaByPath,
    async readRawRunForIndexEntry(row) {
      const paths = resolvePaths(row.id, row.profileId);
      const candidates = [
        paths.partitionMetaPath ?? paths.legacyMetaPath,
        paths.legacyMetaPath,
        paths.legacyFilePath,
      ];

      for (const filePath of candidates) {
        const run = await readRawRunMetaByPath(filePath);
        if (run) return run;
      }

      return null;
    },
  };
}
