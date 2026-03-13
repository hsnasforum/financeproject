import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as schedulerGET, POST as schedulerPOST } from "../../../src/app/api/ops/scheduler/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalSchedulerPath = process.env.PLANNING_OPS_SCHEDULER_LOG_PATH;
const originalSchedulerPolicyPath = process.env.PLANNING_OPS_SCHEDULER_POLICY_PATH;
const originalAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;
const originalWarnConsecutive = process.env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE;
const originalRiskConsecutive = process.env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE;

function buildRequest(
  urlPath: string,
  options?: {
    host?: string;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
  },
): Request {
  const host = options?.host ?? "localhost:3000";
  const origin = `http://${host}`;
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    host,
    origin,
    referer: `${origin}/ops`,
    ...(options?.headers ?? {}),
  };
  return new Request(`${origin}${urlPath}`, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(options?.body ?? {}) } : {}),
  });
}

describe("ops scheduler route", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-scheduler-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_OPS_SCHEDULER_LOG_PATH = path.join(root, "logs", "scheduler.ndjson");
    env.PLANNING_OPS_SCHEDULER_POLICY_PATH = path.join(root, "scheduler-policy.json");
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "audit", "events.ndjson");

    await fs.mkdir(path.dirname(env.PLANNING_OPS_SCHEDULER_LOG_PATH), { recursive: true });
    await fs.writeFile(env.PLANNING_OPS_SCHEDULER_LOG_PATH, [
      "{\"ts\":\"2026-03-08T09:10:00Z\",\"mode\":\"weekly\",\"ok\":true,\"exitCode\":0,\"startedAt\":\"2026-03-08T09:09:58Z\",\"endedAt\":\"2026-03-08T09:10:00Z\",\"host\":\"HOST-A\",\"message\":\"completed\"}",
      "invalid-json-line",
      "{\"ts\":\"2026-03-08T09:20:00Z\",\"mode\":\"unknown_mode\",\"ok\":false,\"exitCode\":2,\"startedAt\":\"2026-03-08T09:19:00Z\",\"endedAt\":\"2026-03-08T09:20:00Z\",\"host\":\"HOST-B\",\"message\":\"failed\"}",
    ].join("\n"), "utf-8");
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalSchedulerPath === "string") env.PLANNING_OPS_SCHEDULER_LOG_PATH = originalSchedulerPath;
    else delete env.PLANNING_OPS_SCHEDULER_LOG_PATH;
    if (typeof originalSchedulerPolicyPath === "string") env.PLANNING_OPS_SCHEDULER_POLICY_PATH = originalSchedulerPolicyPath;
    else delete env.PLANNING_OPS_SCHEDULER_POLICY_PATH;
    if (typeof originalAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    if (typeof originalWarnConsecutive === "string") env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE = originalWarnConsecutive;
    else delete env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE;
    if (typeof originalRiskConsecutive === "string") env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE = originalRiskConsecutive;
    else delete env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns parsed scheduler events in reverse chronological order", async () => {
    const response = await schedulerGET(buildRequest("/api/ops/scheduler?limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ ts?: string; mode?: string; ok?: boolean; exitCode?: number }>;
      meta?: {
        summary?: {
          total?: number;
          success?: number;
          failed?: number;
          latestAt?: string;
          lastSuccessAt?: string;
          lastFailedAt?: string;
          latestFailed?: boolean;
          consecutiveFailures?: number;
          level?: string;
          thresholds?: {
            warnConsecutiveFailures?: number;
            riskConsecutiveFailures?: number;
          };
        };
        policy?: {
          warnConsecutiveFailures?: number;
          riskConsecutiveFailures?: number;
        };
        policySource?: "file" | "default";
        policyValid?: boolean;
        policyErrors?: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.length).toBe(2);
    expect(payload.data?.[0]?.ts).toBe("2026-03-08T09:20:00.000Z");
    expect(payload.data?.[0]?.mode).toBe("unknown");
    expect(payload.data?.[0]?.ok).toBe(false);
    expect(payload.meta?.summary?.total).toBe(2);
    expect(payload.meta?.summary?.success).toBe(1);
    expect(payload.meta?.summary?.failed).toBe(1);
    expect(payload.meta?.summary?.latestAt).toBe("2026-03-08T09:20:00.000Z");
    expect(payload.meta?.summary?.lastSuccessAt).toBe("2026-03-08T09:10:00.000Z");
    expect(payload.meta?.summary?.lastFailedAt).toBe("2026-03-08T09:20:00.000Z");
    expect(payload.meta?.summary?.latestFailed).toBe(true);
    expect(payload.meta?.summary?.consecutiveFailures).toBe(1);
    expect(payload.meta?.summary?.level).toBe("WARN");
    expect(payload.meta?.summary?.thresholds?.warnConsecutiveFailures).toBe(1);
    expect(payload.meta?.summary?.thresholds?.riskConsecutiveFailures).toBe(3);
    expect(payload.meta?.policy?.warnConsecutiveFailures).toBe(1);
    expect(payload.meta?.policy?.riskConsecutiveFailures).toBe(3);
    expect(payload.meta?.policySource).toBe("default");
    expect(payload.meta?.policyValid).toBe(true);
  });

  it("blocks non-local requests", async () => {
    const response = await schedulerGET(buildRequest("/api/ops/scheduler?limit=5", { host: "example.com" }));
    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("applies threshold overrides from env", async () => {
    env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE = "2";
    env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE = "2";

    const response = await schedulerGET(buildRequest("/api/ops/scheduler?limit=10"));
    const payload = await response.json() as {
      meta?: {
        summary?: {
          level?: string;
          thresholds?: {
            warnConsecutiveFailures?: number;
            riskConsecutiveFailures?: number;
          };
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.meta?.summary?.level).toBe("OK");
    expect(payload.meta?.summary?.thresholds?.warnConsecutiveFailures).toBe(2);
    expect(payload.meta?.summary?.thresholds?.riskConsecutiveFailures).toBe(2);
  });

  it("uses saved threshold policy over env defaults", async () => {
    env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE = "5";
    env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE = "5";
    await fs.writeFile(path.join(root, "scheduler-policy.json"), JSON.stringify({
      version: 1,
      warnConsecutiveFailures: 2,
      riskConsecutiveFailures: 4,
      updatedAt: "2026-03-08T11:00:00.000Z",
    }), "utf-8");

    const response = await schedulerGET(buildRequest("/api/ops/scheduler?limit=10"));
    const payload = await response.json() as {
      meta?: {
        summary?: {
          level?: string;
          thresholds?: {
            warnConsecutiveFailures?: number;
            riskConsecutiveFailures?: number;
          };
        };
        policy?: {
          warnConsecutiveFailures?: number;
          riskConsecutiveFailures?: number;
        };
        policySource?: "file" | "default";
        policyValid?: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.meta?.summary?.level).toBe("OK");
    expect(payload.meta?.summary?.thresholds?.warnConsecutiveFailures).toBe(2);
    expect(payload.meta?.summary?.thresholds?.riskConsecutiveFailures).toBe(4);
    expect(payload.meta?.policy?.warnConsecutiveFailures).toBe(2);
    expect(payload.meta?.policy?.riskConsecutiveFailures).toBe(4);
    expect(payload.meta?.policySource).toBe("file");
    expect(payload.meta?.policyValid).toBe(true);
  });

  it("saves threshold policy through POST", async () => {
    const csrf = "scheduler-csrf-token";
    const response = await schedulerPOST(buildRequest("/api/ops/scheduler", {
      method: "POST",
      body: {
        csrf,
        warnConsecutiveFailures: 2,
        riskConsecutiveFailures: 2,
      },
      headers: {
        "content-type": "application/json",
        cookie: `dev_action=1; dev_csrf=${csrf}`,
      },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        warnConsecutiveFailures?: number;
        riskConsecutiveFailures?: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.warnConsecutiveFailures).toBe(2);
    expect(payload.data?.riskConsecutiveFailures).toBe(2);

    const policyRaw = await fs.readFile(path.join(root, "scheduler-policy.json"), "utf-8");
    const policy = JSON.parse(policyRaw) as {
      warnConsecutiveFailures?: number;
      riskConsecutiveFailures?: number;
    };
    expect(policy.warnConsecutiveFailures).toBe(2);
    expect(policy.riskConsecutiveFailures).toBe(2);

    const auditRaw = await fs.readFile(path.join(root, "audit", "events.ndjson"), "utf-8");
    const auditRows = auditRaw.trim().split("\n").map((line) => JSON.parse(line) as {
      eventType?: string;
      meta?: {
        reset?: boolean;
        before?: { warnConsecutiveFailures?: number; riskConsecutiveFailures?: number };
        after?: { warnConsecutiveFailures?: number; riskConsecutiveFailures?: number };
      };
    });
    const latest = auditRows.at(-1);
    expect(latest?.eventType).toBe("OPS_SCHEDULER_POLICY_UPDATE");
    expect(latest?.meta?.reset).toBe(false);
    expect(latest?.meta?.before?.warnConsecutiveFailures).toBe(1);
    expect(latest?.meta?.before?.riskConsecutiveFailures).toBe(3);
    expect(latest?.meta?.after?.warnConsecutiveFailures).toBe(2);
    expect(latest?.meta?.after?.riskConsecutiveFailures).toBe(2);
  });

  it("rejects invalid threshold policy payload", async () => {
    const csrf = "scheduler-csrf-token";
    const response = await schedulerPOST(buildRequest("/api/ops/scheduler", {
      method: "POST",
      body: {
        csrf,
        warnConsecutiveFailures: 4,
        riskConsecutiveFailures: 2,
      },
      headers: {
        "content-type": "application/json",
        cookie: `dev_action=1; dev_csrf=${csrf}`,
      },
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe("VALIDATION");
  });

  it("falls back to default policy when policy file is corrupted", async () => {
    await fs.writeFile(path.join(root, "scheduler-policy.json"), "{ this is not json", "utf-8");

    const response = await schedulerGET(buildRequest("/api/ops/scheduler?limit=10"));
    const payload = await response.json() as {
      meta?: {
        policy?: {
          warnConsecutiveFailures?: number;
          riskConsecutiveFailures?: number;
        };
        policySource?: "file" | "default";
        policyValid?: boolean;
        policyErrors?: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.meta?.policy?.warnConsecutiveFailures).toBe(1);
    expect(payload.meta?.policy?.riskConsecutiveFailures).toBe(3);
    expect(payload.meta?.policySource).toBe("default");
    expect(payload.meta?.policyValid).toBe(false);
    expect(payload.meta?.policyErrors?.[0]).toContain("invalid JSON");
  });

  it("resets threshold policy to env defaults through POST", async () => {
    env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE = "2";
    env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE = "4";
    await fs.writeFile(path.join(root, "scheduler-policy.json"), JSON.stringify({
      version: 1,
      warnConsecutiveFailures: 5,
      riskConsecutiveFailures: 6,
      updatedAt: "2026-03-08T11:00:00.000Z",
    }), "utf-8");

    const csrf = "scheduler-csrf-token";
    const response = await schedulerPOST(buildRequest("/api/ops/scheduler", {
      method: "POST",
      body: {
        csrf,
        resetToEnvDefaults: true,
      },
      headers: {
        "content-type": "application/json",
        cookie: `dev_action=1; dev_csrf=${csrf}`,
      },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        warnConsecutiveFailures?: number;
        riskConsecutiveFailures?: number;
      };
      meta?: {
        source?: "file" | "default";
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.warnConsecutiveFailures).toBe(2);
    expect(payload.data?.riskConsecutiveFailures).toBe(4);
    expect(payload.meta?.source).toBe("default");
    await expect(fs.stat(path.join(root, "scheduler-policy.json"))).rejects.toMatchObject({ code: "ENOENT" });

    const auditRaw = await fs.readFile(path.join(root, "audit", "events.ndjson"), "utf-8");
    const auditRows = auditRaw.trim().split("\n").map((line) => JSON.parse(line) as {
      eventType?: string;
      meta?: {
        reset?: boolean;
        before?: { warnConsecutiveFailures?: number; riskConsecutiveFailures?: number };
        after?: { warnConsecutiveFailures?: number; riskConsecutiveFailures?: number };
      };
    });
    const latest = auditRows.at(-1);
    expect(latest?.eventType).toBe("OPS_SCHEDULER_POLICY_UPDATE");
    expect(latest?.meta?.reset).toBe(true);
    expect(latest?.meta?.before?.warnConsecutiveFailures).toBe(5);
    expect(latest?.meta?.before?.riskConsecutiveFailures).toBe(6);
    expect(latest?.meta?.after?.warnConsecutiveFailures).toBe(2);
    expect(latest?.meta?.after?.riskConsecutiveFailures).toBe(4);
  });
});
