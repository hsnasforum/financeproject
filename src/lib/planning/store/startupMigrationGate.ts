import {
  runPlanningMigrationsOnStartup,
  type PlanningMigrationRunResult,
} from "../migrations/manager";

export type PlanningStartupMigrationMode = "strict" | "best-effort";

export type EnsurePlanningStartupMigrationsOptions = {
  mode?: PlanningStartupMigrationMode;
};

export async function ensurePlanningStartupMigrations(
  options?: EnsurePlanningStartupMigrationsOptions,
): Promise<PlanningMigrationRunResult | null> {
  try {
    return await runPlanningMigrationsOnStartup();
  } catch (error) {
    if (options?.mode === "best-effort") return null;
    throw error;
  }
}
