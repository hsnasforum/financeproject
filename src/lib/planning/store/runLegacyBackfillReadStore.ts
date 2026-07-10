import { type RunIndexEntry } from "./runIndex";
import {
  getRunPaths,
  type RunPaths,
} from "./runReadSources";
import { type JsonFileDetailedReadResult } from "./runRecordCodec";
import { type PlanningRunRecord } from "./types";

type GetRunPaths = (runId: string, profileId?: string) => RunPaths;
type ReadJsonFile = (filePath: string) => Promise<unknown | null>;
type ReadJsonFileDetailed = (filePath: string) => Promise<JsonFileDetailedReadResult>;
type DecodeStoredPayload = (loaded: unknown) => Promise<{ payload: unknown }>;
type NormalizeRawRun = (value: unknown) => PlanningRunRecord | null;

export type RunLegacyBackfillReadSource =
  | "partition-meta"
  | "legacy-meta"
  | "legacy-file";

export type RunLegacyBackfillReadFallbackReason =
  | "missing-file"
  | "invalid-json"
  | "invalid-run-record";

export type RunLegacyBackfillReadFallback = {
  source: RunLegacyBackfillReadSource;
  reason: RunLegacyBackfillReadFallbackReason;
};

export type RunLegacyBackfillDetailedReadResult = {
  run: PlanningRunRecord | null;
  fallbacks: RunLegacyBackfillReadFallback[];
};

export type RunLegacyBackfillReadStoreDependencies = {
  getPaths?: GetRunPaths;
  readJsonFile: ReadJsonFile;
  readJsonFileDetailed?: ReadJsonFileDetailed;
  decodeStoredPayload: DecodeStoredPayload;
  normalizeRawRun: NormalizeRawRun;
};

export type RunLegacyBackfillReadStore = {
  readRawRunMetaByPath: (filePath: string) => Promise<PlanningRunRecord | null>;
  readRawRunForIndexEntry: (row: Pick<RunIndexEntry, "id" | "profileId">) => Promise<PlanningRunRecord | null>;
  readRawRunForIndexEntryDetailed: (
    row: Pick<RunIndexEntry, "id" | "profileId">,
  ) => Promise<RunLegacyBackfillDetailedReadResult>;
};

export function createRunLegacyBackfillReadStore(
  dependencies: RunLegacyBackfillReadStoreDependencies,
): RunLegacyBackfillReadStore {
  const resolvePaths = dependencies.getPaths ?? getRunPaths;

  async function readJsonFileDetailed(filePath: string): Promise<JsonFileDetailedReadResult> {
    if (dependencies.readJsonFileDetailed) {
      return dependencies.readJsonFileDetailed(filePath);
    }
    const loaded = await dependencies.readJsonFile(filePath);
    return loaded
      ? { status: "found", value: loaded }
      : { status: "missing" };
  }

  async function readRawRunMetaByPathDetailed(filePath: string): Promise<
    | { status: "found"; run: PlanningRunRecord }
    | { status: "fallback"; reason: RunLegacyBackfillReadFallbackReason }
  > {
    const loaded = await readJsonFileDetailed(filePath);
    if (loaded.status === "missing") {
      return { status: "fallback", reason: "missing-file" };
    }
    if (loaded.status === "invalid-json") {
      return { status: "fallback", reason: "invalid-json" };
    }
    if (!loaded.value) {
      return { status: "fallback", reason: "invalid-run-record" };
    }

    const decoded = await dependencies.decodeStoredPayload(loaded.value);
    const run = dependencies.normalizeRawRun(decoded.payload);
    return run
      ? { status: "found", run }
      : { status: "fallback", reason: "invalid-run-record" };
  }

  async function readRawRunMetaByPath(filePath: string): Promise<PlanningRunRecord | null> {
    const result = await readRawRunMetaByPathDetailed(filePath);
    return result.status === "found" ? result.run : null;
  }

  async function readRawRunForIndexEntryDetailed(
    row: Pick<RunIndexEntry, "id" | "profileId">,
  ): Promise<RunLegacyBackfillDetailedReadResult> {
    const paths = resolvePaths(row.id, row.profileId);
    const candidates: Array<{ source: RunLegacyBackfillReadSource; filePath: string }> = [
      {
        source: paths.partitionMetaPath ? "partition-meta" : "legacy-meta",
        filePath: paths.partitionMetaPath ?? paths.legacyMetaPath,
      },
      { source: "legacy-meta", filePath: paths.legacyMetaPath },
      { source: "legacy-file", filePath: paths.legacyFilePath },
    ];
    const fallbacks: RunLegacyBackfillReadFallback[] = [];

    for (const candidate of candidates) {
      const result = await readRawRunMetaByPathDetailed(candidate.filePath);
      if (result.status === "found") {
        return { run: result.run, fallbacks };
      }
      fallbacks.push({
        source: candidate.source,
        reason: result.reason,
      });
    }

    return { run: null, fallbacks };
  }

  return {
    readRawRunMetaByPath,
    async readRawRunForIndexEntry(row) {
      const result = await readRawRunForIndexEntryDetailed(row);
      return result.run;
    },
    readRawRunForIndexEntryDetailed,
  };
}
