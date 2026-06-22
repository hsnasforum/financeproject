import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendOpsActionLog, listOpsActionLogs } from "../../../src/lib/ops/actions/actionLog";
import { runOpsAction } from "../../../src/lib/ops/actions/registry";
import {
  opsActionAuditEventType,
  opsActionAuditResult,
  resolveOpsActionRunStatus,
} from "../../../src/lib/ops/actions/resultStatus";
import { runPlanningMaintenanceMigrationsAction } from "../../../src/lib/planning/server/ops/planningMaintenanceActions";

vi.mock("@/lib/planning/server/ops/planningMaintenanceActions", () => ({
  previewPlanningMigrationsAction: vi.fn(),
  previewPlanningRepairIndexAction: vi.fn(),
  runPlanningMaintenanceMigrationsAction: vi.fn(),
  runPlanningRepairIndexAction: vi.fn(),
}));

const env = process.env as Record<string, string | undefined>;
const originalActionLogPath = process.env.PLANNING_OPS_ACTION_LOG_PATH;

describe("ops action result status", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-action-status-"));
    env.PLANNING_OPS_ACTION_LOG_PATH = path.join(root, "ops", "actions", "events.ndjson");
    vi.mocked(runPlanningMaintenanceMigrationsAction).mockReset();
  });

  afterEach(() => {
    if (typeof originalActionLogPath === "string") env.PLANNING_OPS_ACTION_LOG_PATH = originalActionLogPath;
    else delete env.PLANNING_OPS_ACTION_LOG_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("maps partial action results to explicit partial operator status", () => {
    expect(resolveOpsActionRunStatus({ ok: true, message: "partial", status: "PARTIAL_SUCCESS" }))
      .toBe("PARTIAL_SUCCESS");
    expect(opsActionAuditResult("PARTIAL_SUCCESS")).toBe("PARTIAL_SUCCESS");
    expect(opsActionAuditEventType("PARTIAL_SUCCESS")).toBe("OPS_ACTION_RUN_PARTIAL_SUCCESS");
  });

  it("returns PARTIAL_SUCCESS for partial migration runs", async () => {
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

    const result = await runOpsAction("RUN_MIGRATIONS", {});

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.data?.result).toBe("partial");
  });

  it("preserves PARTIAL_SUCCESS in action logs", async () => {
    await appendOpsActionLog({
      actionId: "RUN_MIGRATIONS",
      at: "2026-06-22T00:00:00.000Z",
      status: "PARTIAL_SUCCESS",
      message: "migrations 실행 결과: partial",
      durationMs: 12,
      meta: {
        dangerous: true,
      },
    });

    const rows = await listOpsActionLogs({ actionId: "RUN_MIGRATIONS" });

    expect(rows[0]?.status).toBe("PARTIAL_SUCCESS");
  });
});
