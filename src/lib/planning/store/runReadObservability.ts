import { recordPlanningFallbackUsage } from "../engine";
import { type PlanningRunRecord } from "./types";

export type RunReadDiagnosticAttempt = {
  source: "partition-hint" | "partition-scan" | "legacy-meta" | "legacy-file";
  path: string;
  status: "found" | "missing" | "unreadable";
  reason?: string;
};

export type RunReadDiagnostic = {
  id: string;
  profileIdHint?: string;
  status: "found" | "missing" | "unreadable";
  attempts: RunReadDiagnosticAttempt[];
  run?: PlanningRunRecord;
};

export type ReadRunMetaByPathDetailedResult =
  | { status: "found"; run: PlanningRunRecord }
  | { status: "missing"; reason: string }
  | { status: "unreadable"; reason: string };

type RunReadFallbackRecorder = typeof recordPlanningFallbackUsage;

export function recordRunReadFallbackUsage(input: {
  canonicalMeta: {
    migrated: boolean;
    source: string;
  };
  migration: {
    migrated: boolean;
    source?: string;
    run: Pick<PlanningRunRecord, "id">;
  };
  recordFallbackUsage?: RunReadFallbackRecorder;
}): void {
  const recordFallbackUsage = input.recordFallbackUsage ?? recordPlanningFallbackUsage;
  if (input.canonicalMeta.migrated) {
    recordFallbackUsage("legacyReportContractFallbackCount", {
      source: input.canonicalMeta.source,
      sourceKey: "compatRebuild",
      runId: input.migration.run.id,
    });
  }
  if (input.migration.migrated) {
    recordFallbackUsage("legacyRunEngineMigrationCount", {
      source: `runStore/readRunMetaByPath/${input.migration.source ?? "unknown"}`,
      sourceKey: "legacyEngineFallback",
      runId: input.migration.run.id,
    });
  }
}

export function createRunReadDiagnosticRecorder(input: {
  id: string;
  profileIdHint?: string;
  normalizePath: (filePath: string) => string;
}): {
  attempts: RunReadDiagnosticAttempt[];
  recordAttempt: (
    source: RunReadDiagnosticAttempt["source"],
    filePath: string,
    result: ReadRunMetaByPathDetailedResult,
  ) => void;
  found: (run: PlanningRunRecord) => RunReadDiagnostic;
  final: () => RunReadDiagnostic;
} {
  const attempts: RunReadDiagnosticAttempt[] = [];
  const base = {
    id: input.id,
    ...(input.profileIdHint ? { profileIdHint: input.profileIdHint } : {}),
  };

  return {
    attempts,
    recordAttempt(source, filePath, result) {
      attempts.push({
        source,
        path: input.normalizePath(filePath),
        status: result.status,
        ...(result.status === "found" ? {} : { reason: result.reason }),
      });
    },
    found(run) {
      return {
        ...base,
        status: "found",
        attempts,
        run,
      };
    },
    final() {
      return {
        ...base,
        status: attempts.some((row) => row.status === "unreadable") ? "unreadable" : "missing",
        attempts,
      };
    },
  };
}
