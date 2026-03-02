import { type PlanningMigrationReport, type PlanningMigrationRunResult } from "./manager";

type MigrationSummary = {
  pending?: number;
  failed?: number;
};

function toCount(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function isMigrationRequired(
  input:
    | Pick<PlanningMigrationRunResult, "summary">
    | Pick<PlanningMigrationReport, "summary">
    | { summary?: MigrationSummary }
    | null
    | undefined,
): boolean {
  const summary = input?.summary;
  if (!summary) return false;
  const pending = toCount(summary.pending);
  const failed = toCount(summary.failed);
  return pending > 0 || failed > 0;
}

