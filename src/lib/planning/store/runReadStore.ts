import path from "node:path";

import {
  readRunMetaRecordByPath,
  readRunMetaRecordByPathDetailed,
  type ReadRunMetaRecordOptions,
} from "./runMetaReader";
import {
  createRunReadDiagnosticRecorder,
  type RunReadDiagnostic,
  type ReadRunMetaByPathDetailedResult,
} from "./runReadObservability";
import { migrateLegacyRunToPartition } from "./runReadMigration";
import {
  getRunPaths,
  resolveRunReadSources,
  type RunPaths,
  type RunReadSource,
  type RunReadSourceKind,
} from "./runReadSources";
import { type PlanningRunRecord } from "./types";

type ResolveRunReadSources = (
  runId: string,
  profileIdHint?: string,
) => Promise<{ sources: RunReadSource[] }>;

type ReadRunMetaByPath = (
  filePath: string,
  options?: ReadRunMetaRecordOptions,
) => Promise<PlanningRunRecord | null>;

type ReadRunMetaByPathDetailed = (
  filePath: string,
  options?: ReadRunMetaRecordOptions,
) => Promise<ReadRunMetaByPathDetailedResult>;

type GetRunPathsForMigration = (runId: string, profileId?: string) => RunPaths;

type MigrateLegacyRunToPartition = (input: {
  record: PlanningRunRecord;
  paths: RunPaths;
}) => Promise<boolean>;

type CreateDiagnosticRecorder = typeof createRunReadDiagnosticRecorder;

export type RunReadStore = {
  readRunMetaByPath: ReadRunMetaByPath;
  readRunMeta: (
    id: string,
    profileIdHint?: string,
    options?: ReadRunMetaRecordOptions,
  ) => Promise<PlanningRunRecord | null>;
  diagnoseRunRead: (id: string, profileIdHint?: string) => Promise<RunReadDiagnostic>;
};

export type RunReadStoreDependencies = {
  resolveSources?: ResolveRunReadSources;
  readMetaByPath?: ReadRunMetaByPath;
  readMetaByPathDetailed?: ReadRunMetaByPathDetailed;
  getPathsForMigration?: GetRunPathsForMigration;
  migrateLegacyRun?: MigrateLegacyRunToPartition;
  createDiagnosticRecorder?: CreateDiagnosticRecorder;
  normalizePath?: (filePath: string) => string;
};

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

function shouldMigrateLegacySource(
  source: RunReadSourceKind,
  options?: ReadRunMetaRecordOptions,
): boolean {
  return options?.persistMigrations === true && (source === "legacy-meta" || source === "legacy-file");
}

export function createRunReadStore(dependencies: RunReadStoreDependencies = {}): RunReadStore {
  const resolveSources = dependencies.resolveSources ?? resolveRunReadSources;
  const readMetaByPath = dependencies.readMetaByPath ?? readRunMetaRecordByPath;
  const readMetaByPathDetailed = dependencies.readMetaByPathDetailed ?? readRunMetaRecordByPathDetailed;
  const getPathsForMigration = dependencies.getPathsForMigration ?? getRunPaths;
  const migrateLegacyRun = dependencies.migrateLegacyRun ?? migrateLegacyRunToPartition;
  const createDiagnosticRecorder = dependencies.createDiagnosticRecorder ?? createRunReadDiagnosticRecorder;
  const normalizePath = dependencies.normalizePath ?? normalizeRelativePath;

  return {
    readRunMetaByPath: readMetaByPath,
    async readRunMeta(id, profileIdHint, options) {
      const { sources } = await resolveSources(id, profileIdHint);
      for (const candidate of sources) {
        const run = await readMetaByPath(candidate.filePath, options);
        if (!run) continue;
        if (shouldMigrateLegacySource(candidate.source, options)) {
          await migrateLegacyRun({
            record: run,
            paths: getPathsForMigration(id, run.profileId),
          });
        }
        return run;
      }

      return null;
    },
    async diagnoseRunRead(id, profileIdHint) {
      const diagnostics = createDiagnosticRecorder({
        id,
        ...(profileIdHint ? { profileIdHint } : {}),
        normalizePath,
      });

      const { sources } = await resolveSources(id, profileIdHint);
      for (const candidate of sources) {
        const result = await readMetaByPathDetailed(candidate.filePath);
        diagnostics.recordAttempt(candidate.source, candidate.filePath, result);
        if (result.status === "found") {
          return diagnostics.found(result.run);
        }
      }

      return diagnostics.final();
    },
  };
}
