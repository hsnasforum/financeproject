import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as actionRunPOST } from "../../../src/app/api/ops/actions/run/route";
import { POST as actionPreviewPOST } from "../../../src/app/api/ops/actions/preview/route";
import { clearOpsActionPreviewTokensForTests } from "../../../src/lib/ops/actions/previewToken";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalOpsAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;
const originalOpsMetricsPath = process.env.PLANNING_OPS_METRICS_PATH;
const originalActionLogPath = process.env.PLANNING_OPS_ACTION_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

function localHeaders(host = LOCAL_HOST, csrf = "csrf-token"): HeadersInit {
  const origin = `http://${host}`;
  return {
    host,
    origin,
    referer: `${origin}/ops`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
  };
}

describe.sequential("ops actions run route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-actions-run-"));
    env.NODE_ENV = "test";
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");
    env.PLANNING_OPS_METRICS_PATH = path.join(root, "ops", "metrics", "events.ndjson");
    env.PLANNING_OPS_ACTION_LOG_PATH = path.join(root, "ops", "actions", "events.ndjson");
    clearOpsActionPreviewTokensForTests();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalOpsAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalOpsAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    if (typeof originalOpsMetricsPath === "string") env.PLANNING_OPS_METRICS_PATH = originalOpsMetricsPath;
    else delete env.PLANNING_OPS_METRICS_PATH;
    if (typeof originalActionLogPath === "string") env.PLANNING_OPS_ACTION_LOG_PATH = originalActionLogPath;
    else delete env.PLANNING_OPS_ACTION_LOG_PATH;
    clearOpsActionPreviewTokensForTests();

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks action runner without csrf", async () => {
    const response = await actionRunPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/run`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        actionId: "REPAIR_INDEX",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("blocks action runner from non-local host", async () => {
    const response = await actionRunPOST(new Request(`${REMOTE_ORIGIN}/api/ops/actions/run`, {
      method: "POST",
      headers: localHeaders(REMOTE_HOST),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "REPAIR_INDEX",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("requires preview token for destructive actions", async () => {
    const response = await actionRunPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/run`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "REPAIR_INDEX",
        params: {
          confirmText: "RUN OPS_REPAIR_INDEX",
        },
      }),
    }));

    const payload = await response.json() as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(409);
    expect(payload.error?.code).toBe("PREVIEW_REQUIRED");
    expect(payload.error?.message).toContain("미리보기");
  });

  it("rejects unknown actionId with NOT_IMPLEMENTED", async () => {
    const response = await actionRunPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/run`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "UNKNOWN_ACTION",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(501);
    expect(payload.error?.code).toBe("NOT_IMPLEMENTED");
  });

  it("preview returns redacted metadata and run logs audit/metrics/action-log", async () => {
    const previewRes = await actionPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "RUNS_CLEANUP",
        params: {
          profileId: "GITHUB_TOKEN=SHOULD_NOT_LEAK",
        },
      }),
    }));

    const previewPayload = await previewRes.json() as {
      ok?: boolean;
      data?: {
        previewToken?: string;
        requirePreview?: boolean;
        summary?: { ids?: string[]; text?: string };
        confirmText?: string;
      };
    };
    expect(previewRes.status).toBe(200);
    expect(previewPayload.ok).toBe(true);
    expect(previewPayload.data?.requirePreview).toBe(true);
    expect(typeof previewPayload.data?.previewToken).toBe("string");
    expect((previewPayload.data?.summary?.ids ?? []).join(",")).not.toContain("GITHUB_TOKEN=");
    expect(previewPayload.data?.summary?.text).not.toContain("GITHUB_TOKEN=");

    const runRes = await actionRunPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/run`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "RUNS_CLEANUP",
        previewToken: previewPayload.data?.previewToken,
        params: {
          profileId: "GITHUB_TOKEN=SHOULD_NOT_LEAK",
          confirmText: previewPayload.data?.confirmText,
        },
      }),
    }));

    const runPayload = await runRes.json() as { ok?: boolean; message?: string };
    expect(runRes.status).toBe(200);
    expect(runPayload.ok).toBe(true);

    const auditPath = env.PLANNING_OPS_AUDIT_PATH as string;
    const metricsPath = env.PLANNING_OPS_METRICS_PATH as string;
    const actionLogPath = env.PLANNING_OPS_ACTION_LOG_PATH as string;

    const auditRaw = fs.readFileSync(auditPath, "utf-8");
    const metricsRaw = fs.readFileSync(metricsPath, "utf-8");
    const actionLogRaw = fs.readFileSync(actionLogPath, "utf-8");

    expect(auditRaw).toContain("OPS_ACTION_RUN_SUCCESS");
    expect(metricsRaw).toContain("MIGRATION_ACTION");
    expect(metricsRaw).toContain("RUNS_CLEANUP");
    expect(actionLogRaw).toContain("RUNS_CLEANUP");

    expect(auditRaw).not.toContain("GITHUB_TOKEN=");
    expect(metricsRaw).not.toContain("GITHUB_TOKEN=");
    expect(actionLogRaw).not.toContain("GITHUB_TOKEN=");
    expect(actionLogRaw).not.toContain("Bearer ");
  });
});
