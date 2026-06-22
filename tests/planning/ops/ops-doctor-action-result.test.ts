import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOpsDoctorAction } from "../../../src/lib/planning/server/ops/doctorRouteService";
import { appendOpsMetricEvent } from "../../../src/lib/ops/metricsLog";
import { runPlanningMaintenanceMigrationsAction } from "../../../src/lib/planning/server/ops/planningMaintenanceActions";
import { type PlanningRouteUser } from "../../../src/lib/planning/api/routeAuth";

vi.mock("@/lib/ops/metricsLog", () => ({
  appendOpsMetricEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/planning/server/ops/planningMaintenanceActions", () => ({
  runPlanningMaintenanceMigrationsAction: vi.fn(),
  runPlanningOrphanBlobCleanupAction: vi.fn(),
  runPlanningRepairIndexAction: vi.fn(),
}));

const routeUser: PlanningRouteUser = {
  id: "ops-user",
  source: "trusted-header",
  authRequired: true,
};

describe("ops doctor action result contract", () => {
  beforeEach(() => {
    vi.mocked(appendOpsMetricEvent).mockClear();
    vi.mocked(runPlanningMaintenanceMigrationsAction).mockReset();
  });

  it("does not report failed migration runs as a successful doctor action", async () => {
    vi.mocked(runPlanningMaintenanceMigrationsAction).mockResolvedValue({
      generatedAt: "2026-06-22T00:00:00.000Z",
      statePath: "/tmp/planning-migrations.json",
      trigger: "ops",
      result: "failed",
      summary: {
        applied: 0,
        pending: 0,
        deferred: 0,
        failed: 1,
      },
      items: [],
    });

    const result = await runOpsDoctorAction("RUN_MIGRATIONS", routeUser);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("FAILED");
      expect(result.message).toContain("migrations 실행 결과: failed");
      expect(result.message).toContain("failed=1");
    }
    expect(appendOpsMetricEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "MIGRATION_ACTION",
      meta: expect.objectContaining({
        action: "RUN_MIGRATIONS",
        status: "FAILED",
        failed: 1,
        planningUserId: "ops-user",
        authSource: "trusted-header",
      }),
    }));
  });

  it("records partial migration runs with a partial operator status", async () => {
    vi.mocked(runPlanningMaintenanceMigrationsAction).mockResolvedValue({
      generatedAt: "2026-06-22T00:00:00.000Z",
      statePath: "/tmp/planning-migrations.json",
      trigger: "ops",
      result: "partial",
      summary: {
        applied: 1,
        pending: 1,
        deferred: 0,
        failed: 0,
      },
      items: [],
    });

    const result = await runOpsDoctorAction("RUN_MIGRATIONS", routeUser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("PARTIAL_SUCCESS");
      expect(result.message).toContain("migrations 실행 결과: partial");
      expect(result.data.result).toBe("partial");
    }
    expect(appendOpsMetricEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "MIGRATION_ACTION",
      meta: expect.objectContaining({
        action: "RUN_MIGRATIONS",
        status: "PARTIAL_SUCCESS",
        pending: 1,
        planningUserId: "ops-user",
        authSource: "trusted-header",
      }),
    }));
  });
});
