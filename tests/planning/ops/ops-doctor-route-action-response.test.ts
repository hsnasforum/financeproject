import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as doctorPOST } from "../../../src/app/api/ops/doctor/route";
import { appendOpsMetricEvent } from "../../../src/lib/ops/metricsLog";
import { runPlanningMaintenanceMigrationsAction } from "../../../src/lib/planning/server/ops/planningMaintenanceActions";

vi.mock("@/lib/ops/metricsLog", () => ({
  appendOpsMetricEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/planning/server/ops/planningMaintenanceActions", () => ({
  runPlanningMaintenanceMigrationsAction: vi.fn(),
  runPlanningOrphanBlobCleanupAction: vi.fn(),
  runPlanningRepairIndexAction: vi.fn(),
}));

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function localHeaders(csrf = "csrf-token"): HeadersInit {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/ops/doctor`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
  };
}

describe("ops doctor action route response", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "false";
    vi.mocked(appendOpsMetricEvent).mockClear();
    vi.mocked(runPlanningMaintenanceMigrationsAction).mockReset();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
  });

  it("exposes partial migration status in the POST body", async () => {
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

    const response = await doctorPOST(new Request(`${LOCAL_ORIGIN}/api/ops/doctor`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        action: "RUN_MIGRATIONS",
      }),
    }));

    const payload = await response.json() as {
      ok?: boolean;
      status?: string;
      message?: string;
      data?: {
        result?: string;
        summary?: {
          pending?: number;
        };
      };
      meta?: {
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe("PARTIAL_SUCCESS");
    expect(payload.message).toContain("migrations 실행 결과: partial");
    expect(payload.data?.result).toBe("partial");
    expect(payload.data?.summary?.pending).toBe(1);
    expect(payload.meta?.authSource).toBe("local-namespace");
  });
});
