import {
  type recordCurrentUserRunCreateAudit,
  type recordCurrentUserRunStageMetrics,
} from "./routeService";

export type RecordCreateRunAudit = typeof recordCurrentUserRunCreateAudit;
export type RecordCreateRunStageMetrics = typeof recordCurrentUserRunStageMetrics;
export type CreateRunSideEffectLogger = Pick<Console, "error">;

export function recordCreateRunAuditSafely(
  recordAudit: RecordCreateRunAudit,
  input: Parameters<RecordCreateRunAudit>[0],
  logger: CreateRunSideEffectLogger = console,
): void {
  try {
    recordAudit(input);
  } catch (error) {
    logger.error("[planning/runs] failed to record create audit", error);
  }
}

export async function recordCreateRunStageMetricsSafely(
  recordStageMetrics: RecordCreateRunStageMetrics,
  input: Parameters<RecordCreateRunStageMetrics>[0],
  logger: CreateRunSideEffectLogger = console,
): Promise<void> {
  try {
    await recordStageMetrics(input);
  } catch (error) {
    logger.error("[planning/runs] failed to record stage metrics", error);
  }
}
