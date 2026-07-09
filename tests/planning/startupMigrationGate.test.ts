import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPlanningMigrationsOnStartup: vi.fn(),
}));

vi.mock("../../src/lib/planning/migrations/manager", () => ({
  runPlanningMigrationsOnStartup: mocks.runPlanningMigrationsOnStartup,
}));

import {
  ensurePlanningStartupMigrations,
  getPlanningStartupMigrationGateSnapshot,
  getPlanningStartupMigrationTelemetryContext,
  resetPlanningStartupMigrationGateSnapshotForTest,
} from "../../src/lib/planning/store/startupMigrationGate";

describe("planning startup migration gate", () => {
  beforeEach(() => {
    mocks.runPlanningMigrationsOnStartup.mockReset();
    resetPlanningStartupMigrationGateSnapshotForTest();
  });

  it("returns the startup migration result in strict mode", async () => {
    const result = {
      generatedAt: "2026-07-04T00:00:00.000Z",
      result: "ok",
    };
    mocks.runPlanningMigrationsOnStartup.mockResolvedValue(result);

    await expect(ensurePlanningStartupMigrations()).resolves.toBe(result);
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    expect(getPlanningStartupMigrationGateSnapshot()).toEqual(expect.objectContaining({
      generatedAt: "2026-07-04T00:00:00.000Z",
      mode: "strict",
      result: "ok",
      sequence: 1,
      status: "ok",
    }));
    expect(getPlanningStartupMigrationTelemetryContext()).toEqual({
      startupMigrationMode: "strict",
      startupMigrationResult: "ok",
      startupMigrationStatus: "ok",
    });
  });

  it("records partial startup migration results for slow-load telemetry", async () => {
    const result = { result: "partial" };
    mocks.runPlanningMigrationsOnStartup.mockResolvedValue(result);

    await expect(ensurePlanningStartupMigrations({ mode: "best-effort" })).resolves.toBe(result);

    expect(getPlanningStartupMigrationGateSnapshot()).toEqual(expect.objectContaining({
      mode: "best-effort",
      result: "partial",
      sequence: 1,
      status: "partial",
    }));
    expect(getPlanningStartupMigrationTelemetryContext({ sinceSequence: 1 })).toEqual({});
  });

  it("propagates startup migration exceptions in strict mode", async () => {
    const error = new Error("startup migration failed before result creation");
    mocks.runPlanningMigrationsOnStartup.mockRejectedValue(error);

    await expect(ensurePlanningStartupMigrations()).rejects.toThrow(error);
    expect(getPlanningStartupMigrationGateSnapshot()).toEqual(expect.objectContaining({
      errorName: "Error",
      mode: "strict",
      sequence: 1,
      status: "unavailable",
    }));
  });

  it("keeps best-effort profile reads available when startup migration throws", async () => {
    mocks.runPlanningMigrationsOnStartup.mockRejectedValue(new Error("state path failure"));

    await expect(ensurePlanningStartupMigrations({ mode: "best-effort" })).resolves.toBeNull();
    expect(getPlanningStartupMigrationTelemetryContext()).toEqual({
      startupMigrationErrorName: "Error",
      startupMigrationMode: "best-effort",
      startupMigrationStatus: "unavailable",
    });
  });
});
