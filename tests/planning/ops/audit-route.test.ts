import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as auditGET } from "../../../src/app/api/ops/audit/route";
import { appendOpsAuditEvent } from "../../../src/lib/ops/securityAuditLog";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;

const LOCAL_HOST = "localhost:3000";

function buildRequest(urlPath: string, host = LOCAL_HOST, csrf = "csrf-token"): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/audit`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    },
  });
}

describe("ops audit route", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-audit-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");

    await appendOpsAuditEvent({
      eventType: "SCHEDULED_TASK",
      meta: {
        taskName: "OPS_SCHEDULER_HEALTH",
        status: "FAILED",
        code: "RISK_STREAK",
      },
    });
    await appendOpsAuditEvent({
      eventType: "SCHEDULED_TASK",
      meta: {
        taskName: "OPS_REFRESH_ASSUMPTIONS",
        status: "SUCCESS",
        code: "OK",
      },
    });
    await appendOpsAuditEvent({
      eventType: "VAULT_UNLOCK",
      meta: {
        status: "SUCCESS",
      },
    });
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("filters by eventType + taskName", async () => {
    const response = await auditGET(buildRequest("/api/ops/audit?csrf=csrf-token&eventType=SCHEDULED_TASK&taskName=OPS_SCHEDULER_HEALTH"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ eventType?: string; meta?: { taskName?: string } }>;
      meta?: { taskName?: string; taskNames?: string[] };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.length).toBe(1);
    expect(payload.data?.[0]?.eventType).toBe("SCHEDULED_TASK");
    expect(payload.data?.[0]?.meta?.taskName).toBe("OPS_SCHEDULER_HEALTH");
    expect(payload.meta?.taskName).toBe("OPS_SCHEDULER_HEALTH");
    expect(payload.meta?.taskNames).toContain("OPS_SCHEDULER_HEALTH");
    expect(payload.meta?.taskNames).toContain("OPS_REFRESH_ASSUMPTIONS");
  });

  it("blocks non-local requests", async () => {
    const response = await auditGET(buildRequest("/api/ops/audit?csrf=csrf-token", "example.com"));
    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
