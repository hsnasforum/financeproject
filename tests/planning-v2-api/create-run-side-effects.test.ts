import { describe, expect, it, vi } from "vitest";
import {
  recordCreateRunAuditSafely,
  recordCreateRunStageMetricsSafely,
  type RecordCreateRunAudit,
  type RecordCreateRunStageMetrics,
} from "../../src/lib/planning/server/runs/createRunSideEffects";

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
});
