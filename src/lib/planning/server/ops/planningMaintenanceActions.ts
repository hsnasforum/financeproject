import {
  inspectPlanningMigrations,
  type PlanningMigrationReport,
  type PlanningMigrationRunResult,
  runPlanningMigrations,
} from "@/lib/planning/migrations/manager";
import {
  checkPlanningStorageConsistency,
  cleanupOrphanRunBlobs,
  repairRunIndexConsistency,
  type StorageConsistencyReport,
} from "@/lib/planning/storage/consistency";

export type PlanningRepairIndexResult = Awaited<ReturnType<typeof repairRunIndexConsistency>>;
export type PlanningOrphanBlobCleanupResult = Awaited<ReturnType<typeof cleanupOrphanRunBlobs>>;

export async function previewPlanningRepairIndexAction(): Promise<StorageConsistencyReport> {
  return await checkPlanningStorageConsistency();
}

export async function runPlanningRepairIndexAction(): Promise<PlanningRepairIndexResult> {
  return await repairRunIndexConsistency();
}

export async function previewPlanningMigrationsAction(): Promise<PlanningMigrationReport> {
  return await inspectPlanningMigrations();
}

export async function runPlanningMaintenanceMigrationsAction(): Promise<PlanningMigrationRunResult> {
  return await runPlanningMigrations({ trigger: "ops" });
}

export async function runPlanningOrphanBlobCleanupAction(): Promise<PlanningOrphanBlobCleanupResult> {
  return await cleanupOrphanRunBlobs();
}
