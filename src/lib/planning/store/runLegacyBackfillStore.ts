import {
  backfillLegacyRunsWith,
  listLegacyRunBackfillCandidatesWith,
  summarizeLegacyRunBackfillWith,
  type LegacyRunBackfillAnomalyRecorder,
  type LegacyRunBackfillCandidate,
  type LegacyRunBackfillResult,
  type LegacyRunBackfillSummary,
} from "./runLegacyBackfillService";
import { type RunIndexEntry } from "./runIndex";
import {
  createRunLegacyBackfillReadStore,
  type RunLegacyBackfillDetailedReadResult,
} from "./runLegacyBackfillReadStore";
import { type JsonFileDetailedReadResult } from "./runRecordCodec";
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
  readJsonFileDetailed?: (filePath: string) => Promise<JsonFileDetailedReadResult>;
  decodeStoredPayload: (loaded: unknown) => Promise<{ payload: unknown }>;
  normalizeRawRun: (value: unknown) => PlanningRunRecord | null;
};

type LegacyBackfillOptions = {
  limit?: number;
  includeOpsDoctor?: boolean;
  recordBackfillAnomaly?: LegacyRunBackfillAnomalyRecorder;
};

type RunLegacyBackfillStore = {
  summarize: () => Promise<LegacyRunBackfillSummary>;
  listCandidates: (options?: LegacyBackfillOptions) => Promise<LegacyRunBackfillCandidate[]>;
  backfill: (options?: LegacyBackfillOptions) => Promise<LegacyRunBackfillResult>;
  readRawRunForIndexEntry: (row: Pick<RunIndexEntry, "id" | "profileId">) => Promise<PlanningRunRecord | null>;
  readRawRunForIndexEntryDetailed: (
    row: Pick<RunIndexEntry, "id" | "profileId">,
  ) => Promise<RunLegacyBackfillDetailedReadResult>;
};

export function createRunLegacyBackfillStore(input: CreateRunLegacyBackfillStoreInput): RunLegacyBackfillStore {
  const rawReadStore = createRunLegacyBackfillReadStore({
    readJsonFile: input.readJsonFile,
    ...(input.readJsonFileDetailed ? { readJsonFileDetailed: input.readJsonFileDetailed } : {}),
    decodeStoredPayload: input.decodeStoredPayload,
    normalizeRawRun: input.normalizeRawRun,
  });

  function toServiceDeps(recordBackfillAnomaly?: LegacyRunBackfillAnomalyRecorder) {
    return {
      listIndexEntries: input.listIndexEntries,
      readRawRunForIndexEntry: rawReadStore.readRawRunForIndexEntry,
      readRawRunForIndexEntryDetailed: rawReadStore.readRawRunForIndexEntryDetailed,
      readRunForCandidate: input.readRunForCandidate,
      ensureStartupMigrations: input.ensureStartupMigrations,
      isEngineEnvelopeLike: input.isEngineEnvelopeLike,
      ...(recordBackfillAnomaly ? { recordBackfillAnomaly } : {}),
    };
  }

  return {
    summarize: () => summarizeLegacyRunBackfillWith(toServiceDeps()),
    listCandidates: (options) => listLegacyRunBackfillCandidatesWith(toServiceDeps(), options),
    backfill: (options) => backfillLegacyRunsWith(
      toServiceDeps(options?.recordBackfillAnomaly),
      options,
    ),
    readRawRunForIndexEntry: rawReadStore.readRawRunForIndexEntry,
    readRawRunForIndexEntryDetailed: rawReadStore.readRawRunForIndexEntryDetailed,
  };
}
