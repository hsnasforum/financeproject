import {
  backfillLegacyRunsWith,
  listLegacyRunBackfillCandidatesWith,
  summarizeLegacyRunBackfillWith,
  type LegacyRunBackfillCandidate,
  type LegacyRunBackfillResult,
  type LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";
import { type RunIndexEntry } from "./runIndex";
import { getRunPaths } from "./runReadSources";
import { type PlanningRunRecord } from "./types";

type ReadRunOptions = {
  persistMigrations?: boolean;
};

type CreateRunLegacyBackfillStoreInput = {
  listIndexEntries: () => Promise<RunIndexEntry[]>;
  readRunForCandidate: (
    candidate: LegacyRunBackfillCandidate,
    options?: ReadRunOptions,
  ) => Promise<PlanningRunRecord | null>;
  ensureStartupMigrations: () => Promise<void>;
  isEngineEnvelopeLike: (value: unknown) => boolean;
  readJsonFile: (filePath: string) => Promise<unknown | null>;
  decodeStoredPayload: (loaded: unknown) => Promise<{ payload: unknown }>;
  normalizeRawRun: (value: unknown) => PlanningRunRecord | null;
};

type LegacyBackfillOptions = {
  limit?: number;
  includeOpsDoctor?: boolean;
};

type RunLegacyBackfillStore = {
  summarize: () => Promise<LegacyRunBackfillSummary>;
  listCandidates: (options?: LegacyBackfillOptions) => Promise<LegacyRunBackfillCandidate[]>;
  backfill: (options?: LegacyBackfillOptions) => Promise<LegacyRunBackfillResult>;
  readRawRunForIndexEntry: (row: Pick<RunIndexEntry, "id" | "profileId">) => Promise<PlanningRunRecord | null>;
};

export function createRunLegacyBackfillStore(input: CreateRunLegacyBackfillStoreInput): RunLegacyBackfillStore {
  async function readRawRunMetaByPath(filePath: string): Promise<PlanningRunRecord | null> {
    const loaded = await input.readJsonFile(filePath);
    if (!loaded) return null;
    const decoded = await input.decodeStoredPayload(loaded);
    return input.normalizeRawRun(decoded.payload);
  }

  async function readRawRunForIndexEntry(row: Pick<RunIndexEntry, "id" | "profileId">): Promise<PlanningRunRecord | null> {
    const paths = getRunPaths(row.id, row.profileId);
    return await readRawRunMetaByPath(paths.partitionMetaPath ?? paths.legacyMetaPath)
      ?? await readRawRunMetaByPath(paths.legacyMetaPath)
      ?? await readRawRunMetaByPath(paths.legacyFilePath);
  }

  function toServiceDeps() {
    return {
      listIndexEntries: input.listIndexEntries,
      readRawRunForIndexEntry,
      readRunForCandidate: input.readRunForCandidate,
      ensureStartupMigrations: input.ensureStartupMigrations,
      isEngineEnvelopeLike: input.isEngineEnvelopeLike,
    };
  }

  return {
    summarize: () => summarizeLegacyRunBackfillWith(toServiceDeps()),
    listCandidates: (options) => listLegacyRunBackfillCandidatesWith(toServiceDeps(), options),
    backfill: (options) => backfillLegacyRunsWith(toServiceDeps(), options),
    readRawRunForIndexEntry,
  };
}
