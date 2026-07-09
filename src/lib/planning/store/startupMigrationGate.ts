import {
  runPlanningMigrationsOnStartup,
  type PlanningMigrationRunResult,
} from "../migrations/manager";

export type PlanningStartupMigrationMode = "strict" | "best-effort";
export type PlanningStartupMigrationGateStatus = PlanningMigrationRunResult["result"] | "unavailable";

export type EnsurePlanningStartupMigrationsOptions = {
  mode?: PlanningStartupMigrationMode;
};

export type PlanningStartupMigrationGateSnapshot = {
  errorName?: string;
  generatedAt?: string;
  mode: PlanningStartupMigrationMode;
  result?: PlanningMigrationRunResult["result"];
  sequence: number;
  status: PlanningStartupMigrationGateStatus;
  updatedAt: string;
};

export type PlanningStartupMigrationTelemetryContext = {
  startupMigrationErrorName?: string;
  startupMigrationMode?: PlanningStartupMigrationMode;
  startupMigrationResult?: PlanningMigrationRunResult["result"];
  startupMigrationStatus?: PlanningStartupMigrationGateStatus;
};

let startupMigrationGateSequence = 0;
let latestStartupMigrationGateSnapshot: PlanningStartupMigrationGateSnapshot | null = null;

function normalizeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "Error";
}

function recordStartupMigrationGateSnapshot(
  snapshot: Omit<PlanningStartupMigrationGateSnapshot, "sequence" | "updatedAt">,
): PlanningStartupMigrationGateSnapshot {
  startupMigrationGateSequence += 1;
  latestStartupMigrationGateSnapshot = {
    ...snapshot,
    sequence: startupMigrationGateSequence,
    updatedAt: new Date().toISOString(),
  };
  return latestStartupMigrationGateSnapshot;
}

export function getPlanningStartupMigrationGateSnapshot(): PlanningStartupMigrationGateSnapshot | null {
  return latestStartupMigrationGateSnapshot
    ? { ...latestStartupMigrationGateSnapshot }
    : null;
}

export function getPlanningStartupMigrationTelemetryContext(options?: {
  sinceSequence?: number;
}): PlanningStartupMigrationTelemetryContext {
  const snapshot = latestStartupMigrationGateSnapshot;
  if (!snapshot) return {};
  if (options?.sinceSequence !== undefined && snapshot.sequence <= options.sinceSequence) return {};

  return {
    startupMigrationMode: snapshot.mode,
    startupMigrationStatus: snapshot.status,
    ...(snapshot.result ? { startupMigrationResult: snapshot.result } : {}),
    ...(snapshot.errorName ? { startupMigrationErrorName: snapshot.errorName } : {}),
  };
}

export function resetPlanningStartupMigrationGateSnapshotForTest(): void {
  startupMigrationGateSequence = 0;
  latestStartupMigrationGateSnapshot = null;
}

export async function ensurePlanningStartupMigrations(
  options?: EnsurePlanningStartupMigrationsOptions,
): Promise<PlanningMigrationRunResult | null> {
  const mode = options?.mode ?? "strict";
  try {
    const result = await runPlanningMigrationsOnStartup();
    recordStartupMigrationGateSnapshot({
      ...(result.generatedAt ? { generatedAt: result.generatedAt } : {}),
      mode,
      result: result.result,
      status: result.result,
    });
    return result;
  } catch (error) {
    recordStartupMigrationGateSnapshot({
      errorName: normalizeErrorName(error),
      mode,
      status: "unavailable",
    });
    if (mode === "best-effort") return null;
    throw error;
  }
}
