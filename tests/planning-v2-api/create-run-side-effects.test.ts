import { describe, expect, it, vi } from "vitest";
import {
  recordCreateRunFailureAudit,
  recordCreateRunFailureSideEffects,
  recordCreateRunAuditSafely,
  recordCreateRunSuccessSideEffects,
  recordCreateRunStageMetricsSafely,
  type RecordCreateRunAudit,
  type RecordCreateRunStageMetrics,
} from "../../src/lib/planning/server/runs/createRunSideEffects";
import { recordCreatePlanningRunParseFailure } from "../../src/lib/planning/server/runs/createRunService";

describe("planning run create side effects", () => {
  it("does not fail run creation when audit logging throws", () => {
    const recordAudit = vi.fn(() => {
      throw new Error("audit unavailable");
    }) as unknown as RecordCreateRunAudit;
    const logger = { error: vi.fn() };

    expect(() => recordCreateRunAuditSafely(recordAudit, {
      result: "ERROR",
      recordId: "run-1",
      message: "failed",
    }, logger)).not.toThrow();

    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      recordId: "run-1",
      message: "failed",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[planning/runs] failed to record create audit",
      expect.any(Error),
    );
  });

  it("does not fail run creation when stage metrics logging throws", async () => {
    const recordStageMetrics = vi.fn(async () => {
      throw new Error("metrics unavailable");
    }) as unknown as RecordCreateRunStageMetrics;
    const logger = { error: vi.fn() };

    await expect(recordCreateRunStageMetricsSafely(recordStageMetrics, {
      requestId: "request-1",
      profileId: "profile-1",
      overallStatus: "FAILED",
      stages: [],
    }, logger)).resolves.toBeUndefined();

    expect(recordStageMetrics).toHaveBeenCalledWith({
      requestId: "request-1",
      profileId: "profile-1",
      overallStatus: "FAILED",
      stages: [],
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[planning/runs] failed to record stage metrics",
      expect.any(Error),
    );
  });

  it("records failure audit through a request-free helper", () => {
    const recordAudit = vi.fn() as unknown as RecordCreateRunAudit;

    recordCreateRunFailureAudit({
      recordAudit,
      recordId: null,
      message: "parse failed",
    });

    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      recordId: null,
      message: "parse failed",
    });
  });

  it("keeps parse failure audit synchronous while preserving absent and null record ids", () => {
    const recordAudit = vi.fn() as unknown as RecordCreateRunAudit;

    const withoutRecordId = recordCreatePlanningRunParseFailure({
      ok: false,
      code: "INPUT",
      message: "Invalid request body",
      auditMessage: "invalid request body",
    }, { recordAudit });
    const withNullRecordId = recordCreatePlanningRunParseFailure({
      ok: false,
      code: "INPUT",
      message: "Invalid request body",
      auditMessage: "invalid request body",
      recordId: null,
    }, { recordAudit });

    expect(withoutRecordId).toBeUndefined();
    expect(withNullRecordId).toBeUndefined();
    expect(recordAudit).toHaveBeenNthCalledWith(1, {
      result: "ERROR",
      message: "invalid request body",
    });
    expect(recordAudit).toHaveBeenNthCalledWith(2, {
      result: "ERROR",
      recordId: null,
      message: "invalid request body",
    });
  });

  it("records audit only and omits recordId when failure stage metrics are absent", async () => {
    const recordStageMetrics = vi.fn() as unknown as RecordCreateRunStageMetrics;
    const recordAudit = vi.fn() as unknown as RecordCreateRunAudit;

    await recordCreateRunFailureSideEffects({
      recordAudit,
      recordStageMetrics,
      auditMessage: "feature disabled",
    });

    expect(recordStageMetrics).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      message: "feature disabled",
    });
  });

  it("records failure stage metrics before failure audit when stage metrics exist", async () => {
    const calls: string[] = [];
    const recordStageMetrics = vi.fn(async () => {
      calls.push("metrics");
    }) as unknown as RecordCreateRunStageMetrics;
    const recordAudit = vi.fn(() => {
      calls.push("audit");
    }) as unknown as RecordCreateRunAudit;

    await recordCreateRunFailureSideEffects({
      recordAudit,
      recordStageMetrics,
      recordId: "profile-1",
      auditMessage: "simulate stage failed",
      stageMetrics: {
        requestId: "request-1",
        profileId: "profile-1",
        overallStatus: "FAILED",
        stages: [],
        totalDurationMs: 12,
      },
    });

    expect(calls).toEqual(["metrics", "audit"]);
    expect(recordStageMetrics).toHaveBeenCalledWith({
      requestId: "request-1",
      profileId: "profile-1",
      overallStatus: "FAILED",
      stages: [],
      totalDurationMs: 12,
    });
    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      recordId: "profile-1",
      message: "simulate stage failed",
    });
  });

  it("keeps failure audit best-effort even when failure metrics recording throws", async () => {
    const recordStageMetrics = vi.fn(async () => {
      throw new Error("metrics unavailable");
    }) as unknown as RecordCreateRunStageMetrics;
    const recordAudit = vi.fn() as unknown as RecordCreateRunAudit;
    const logger = { error: vi.fn() };

    await expect(recordCreateRunFailureSideEffects({
      recordAudit,
      recordStageMetrics,
      recordId: "profile-1",
      auditMessage: "save failed",
      stageMetrics: {
        requestId: "request-1",
        profileId: "profile-1",
        overallStatus: "FAILED",
        stages: [],
      },
      logger,
    })).resolves.toBeUndefined();

    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      recordId: "profile-1",
      message: "save failed",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[planning/runs] failed to record stage metrics",
      expect.any(Error),
    );
  });

  it("records success stage metrics before success audit without leaking side-effect order into the service", async () => {
    const calls: string[] = [];
    const recordStageMetrics = vi.fn(async () => {
      calls.push("metrics");
    }) as unknown as RecordCreateRunStageMetrics;
    const recordAudit = vi.fn(() => {
      calls.push("audit");
    }) as unknown as RecordCreateRunAudit;

    await recordCreateRunSuccessSideEffects({
      recordAudit,
      recordStageMetrics,
      recordId: "run-1",
      stageMetrics: {
        requestId: "request-1",
        runId: "run-1",
        profileId: "profile-1",
        overallStatus: "SUCCESS",
        stages: [],
        totalDurationMs: 12,
      },
    });

    expect(calls).toEqual(["metrics", "audit"]);
    expect(recordStageMetrics).toHaveBeenCalledWith({
      requestId: "request-1",
      runId: "run-1",
      profileId: "profile-1",
      overallStatus: "SUCCESS",
      stages: [],
      totalDurationMs: 12,
    });
    expect(recordAudit).toHaveBeenCalledWith({
      result: "SUCCESS",
      recordId: "run-1",
      message: "planning run created",
    });
  });

  it("keeps success audit best-effort even when success metrics recording throws", async () => {
    const recordStageMetrics = vi.fn(async () => {
      throw new Error("metrics unavailable");
    }) as unknown as RecordCreateRunStageMetrics;
    const recordAudit = vi.fn() as unknown as RecordCreateRunAudit;
    const logger = { error: vi.fn() };

    await expect(recordCreateRunSuccessSideEffects({
      recordAudit,
      recordStageMetrics,
      recordId: "run-1",
      stageMetrics: {
        requestId: "request-1",
        runId: "run-1",
        profileId: "profile-1",
        overallStatus: "SUCCESS",
        stages: [],
      },
      logger,
    })).resolves.toBeUndefined();

    expect(recordAudit).toHaveBeenCalledWith({
      result: "SUCCESS",
      recordId: "run-1",
      message: "planning run created",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[planning/runs] failed to record stage metrics",
      expect.any(Error),
    );
  });
});
