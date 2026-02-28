import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  headerStore: new Headers(),
  cookieRows: [] as Array<{ name: string; value: string }>,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => nextHeadersMock.headerStore),
  cookies: vi.fn(async () => ({
    getAll: () => nextHeadersMock.cookieRows,
    get: (name: string) => nextHeadersMock.cookieRows.find((item) => item.name === name),
  })),
}));

import { applyCleanupAction, dryRunCleanupAction } from "../../../src/app/ops/planning-cleanup/actions";
import { buildConfirmString } from "../../../src/lib/ops/confirm";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalRunsDir = env.PLANNING_RUNS_DIR;
const originalCacheDir = env.PLANNING_CACHE_DIR;
const originalReportsDir = env.PLANNING_OPS_REPORTS_DIR;
const originalHistoryDir = env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalOpsKeep = env.PLANNING_RETENTION_OPS_REPORTS_KEEP_COUNT;
const originalAuditPath = env.AUDIT_LOG_PATH;

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function setupGuardContext(csrf = "csrf-token"): void {
  nextHeadersMock.headerStore = new Headers({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    referer: "http://localhost:3000/ops/planning-cleanup",
  });
  nextHeadersMock.cookieRows = [
    { name: "dev_action", value: "1" },
    { name: "dev_csrf", value: csrf },
  ];
}

describe("planning cleanup actions confirm", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-cleanup-actions-"));
    env.NODE_ENV = "test";
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_CACHE_DIR = path.join(root, "cache");
    env.PLANNING_OPS_REPORTS_DIR = path.join(root, "reports");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "history");
    env.PLANNING_RETENTION_OPS_REPORTS_KEEP_COUNT = "1";
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    setupGuardContext();

    writeJson(path.join(env.PLANNING_OPS_REPORTS_DIR as string, "20260228-000001.json"), { id: 1 });
    writeJson(path.join(env.PLANNING_OPS_REPORTS_DIR as string, "20260228-000002.json"), { id: 2 });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalCacheDir === "string") env.PLANNING_CACHE_DIR = originalCacheDir;
    else delete env.PLANNING_CACHE_DIR;
    if (typeof originalReportsDir === "string") env.PLANNING_OPS_REPORTS_DIR = originalReportsDir;
    else delete env.PLANNING_OPS_REPORTS_DIR;
    if (typeof originalHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
    if (typeof originalOpsKeep === "string") env.PLANNING_RETENTION_OPS_REPORTS_KEEP_COUNT = originalOpsKeep;
    else delete env.PLANNING_RETENTION_OPS_REPORTS_KEEP_COUNT;
    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("rejects apply when confirm text mismatches", async () => {
    const dryRun = await dryRunCleanupAction({ target: "opsReports", csrf: "csrf-token" });
    expect(dryRun.ok).toBe(true);
    expect(dryRun.data?.summary.deleteCount).toBe(1);

    const apply = await applyCleanupAction({
      target: "opsReports",
      csrf: "csrf-token",
      confirmText: buildConfirmString("CLEANUP opsReports", "999"),
    });

    expect(apply.ok).toBe(false);
    expect(apply.error?.code).toBe("CONFIRM_MISMATCH");
    expect(fs.readdirSync(env.PLANNING_OPS_REPORTS_DIR as string).filter((name) => name.endsWith(".json")).length).toBe(2);
  });

  it("applies cleanup when confirm text matches", async () => {
    const apply = await applyCleanupAction({
      target: "opsReports",
      csrf: "csrf-token",
      confirmText: buildConfirmString("CLEANUP opsReports", "1"),
    });

    expect(apply.ok).toBe(true);
    expect(apply.data?.applied?.deleted).toBe(1);
    expect(fs.readdirSync(env.PLANNING_OPS_REPORTS_DIR as string).filter((name) => name.endsWith(".json")).length).toBe(1);
  });
});
