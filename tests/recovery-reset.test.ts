import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as resetPOST } from "../src/app/api/dev/recovery/reset/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalRecoveryTmpDir = process.env.RECOVERY_TMP_DIR;

let tmpRoot = "";

function writeJson(relativePath: string, value: unknown): void {
  const absolutePath = path.join(tmpRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(value, null, 2), "utf-8");
}

function readJson(relativePath: string): unknown {
  const absolutePath = path.join(tmpRoot, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf-8")) as unknown;
}

function buildRequest(body: Record<string, unknown>) {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const csrf = "csrf-token";
  return new Request(`${origin}/api/dev/recovery/reset`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${origin}/settings/recovery`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      csrf,
    }),
  });
}

describe("recovery reset api", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-recovery-reset-"));
    env.NODE_ENV = "test";
    env.RECOVERY_TMP_DIR = tmpRoot;
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalRecoveryTmpDir === "string") env.RECOVERY_TMP_DIR = originalRecoveryTmpDir;
    else delete env.RECOVERY_TMP_DIR;
  });

  it("returns 400 when confirm is missing", async () => {
    const response = await resetPOST(buildRequest({ targets: ["feedback"] }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INVALID_CONFIRM");
  });

  it("rejects targets outside whitelist", async () => {
    const response = await resetPOST(buildRequest({ targets: ["feedback", "not-allowed"], confirm: "RESET" }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INVALID_TARGETS");
  });

  it("resets only selected targets", async () => {
    writeJson("user_feedback.json", [{ id: "old" }]);
    writeJson("daily_refresh_result.json", { generatedAt: "2026-01-01", steps: [{ name: "x" }] });
    writeJson("dart/disclosure_alerts.json", { keep: true });

    const response = await resetPOST(buildRequest({ targets: ["feedback", "refresh"], confirm: "RESET" }));
    const payload = (await response.json()) as {
      ok?: boolean;
      removed?: string[];
      recreated?: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.removed).toContain("tmp/user_feedback.json");
    expect(payload.removed).toContain("tmp/daily_refresh_result.json");
    expect(payload.recreated).toContain("tmp/user_feedback.json");
    expect(payload.recreated).toContain("tmp/daily_refresh_result.json");

    const feedback = readJson("user_feedback.json");
    const refresh = readJson("daily_refresh_result.json") as { steps?: unknown[] };
    const dartAlerts = readJson("dart/disclosure_alerts.json") as { keep?: boolean };
    expect(Array.isArray(feedback)).toBe(true);
    expect(Array.isArray(refresh.steps)).toBe(true);
    expect(dartAlerts.keep).toBe(true);
  });

  it("returns 404 in production", async () => {
    env.NODE_ENV = "production";
    const response = await resetPOST(new Request("http://localhost:3000/api/dev/recovery/reset", { method: "POST" }));
    expect(response.status).toBe(404);
  });
});
