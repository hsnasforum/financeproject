import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPlanningMigrationsOnStartup: vi.fn(),
}));

vi.mock("../../src/lib/planning/migrations/manager", () => ({
  runPlanningMigrationsOnStartup: mocks.runPlanningMigrationsOnStartup,
}));

import { ensurePlanningStartupMigrations } from "../../src/lib/planning/store/startupMigrationGate";

describe("planning startup migration gate", () => {
  beforeEach(() => {
    mocks.runPlanningMigrationsOnStartup.mockReset();
  });

  it("returns the startup migration result in strict mode", async () => {
    const result = { result: "ok" };
    mocks.runPlanningMigrationsOnStartup.mockResolvedValue(result);

    await expect(ensurePlanningStartupMigrations()).resolves.toBe(result);
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
  });

  it("propagates startup migration exceptions in strict mode", async () => {
    const error = new Error("startup migration failed before result creation");
    mocks.runPlanningMigrationsOnStartup.mockRejectedValue(error);

    await expect(ensurePlanningStartupMigrations()).rejects.toThrow(error);
  });

  it("keeps best-effort profile reads available when startup migration throws", async () => {
    mocks.runPlanningMigrationsOnStartup.mockRejectedValue(new Error("state path failure"));

    await expect(ensurePlanningStartupMigrations({ mode: "best-effort" })).resolves.toBeNull();
  });
});
