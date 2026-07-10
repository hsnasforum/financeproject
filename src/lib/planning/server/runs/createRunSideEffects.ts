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

export function recordCreateRunFailureAudit(input: {
  recordAudit: RecordCreateRunAudit;
  recordId?: string | null;
  message: string;
  logger?: CreateRunSideEffectLogger;
}): void {
  recordCreateRunAuditSafely(input.recordAudit, {
    result: "ERROR",
    ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
    message: input.message,
  }, input.logger);
}

export async function recordCreateRunFailureSideEffects(input: {
  recordAudit: RecordCreateRunAudit;
  recordStageMetrics: RecordCreateRunStageMetrics;
  auditMessage: string;
  recordId?: string | null;
  stageMetrics?: Parameters<RecordCreateRunStageMetrics>[0];
  logger?: CreateRunSideEffectLogger;
}): Promise<void> {
  if (input.stageMetrics) {
    await recordCreateRunStageMetricsSafely(
      input.recordStageMetrics,
      input.stageMetrics,
      input.logger,
    );
  }
  recordCreateRunFailureAudit({
    recordAudit: input.recordAudit,
    ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
    message: input.auditMessage,
    ...(input.logger ? { logger: input.logger } : {}),
  });
}

export async function recordCreateRunSuccessSideEffects(input: {
  recordAudit: RecordCreateRunAudit;
  recordStageMetrics: RecordCreateRunStageMetrics;
  stageMetrics: Parameters<RecordCreateRunStageMetrics>[0];
  recordId: string;
  auditMessage?: string;
  logger?: CreateRunSideEffectLogger;
}): Promise<void> {
  await recordCreateRunStageMetricsSafely(
    input.recordStageMetrics,
    input.stageMetrics,
    input.logger,
  );
  recordCreateRunAuditSafely(input.recordAudit, {
    result: "SUCCESS",
    recordId: input.recordId,
    message: input.auditMessage ?? "planning run created",
  }, input.logger);
}
