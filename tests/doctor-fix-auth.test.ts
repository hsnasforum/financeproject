import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runAllowedFixMock } = vi.hoisted(() => ({
  runAllowedFixMock: vi.fn(),
}));

vi.mock("../src/lib/dev/runScript", async () => {
  const actual = await vi.importActual("../src/lib/dev/runScript");
  return {
    ...(actual as object),
    runAllowedFix: (...args: unknown[]) => runAllowedFixMock(...args),
  };
});

import { POST as doctorFixPOST } from "../src/app/api/dev/doctor/fix/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalFixHistoryPath = process.env.FIX_HISTORY_PATH;
let tmpDir = "";

function buildRequest(body: Record<string, unknown>, withAuth = true): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: `${origin}/settings/recovery`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${origin}/api/dev/doctor/fix`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("doctor fix api auth", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-doctor-fix-auth-"));
    env.NODE_ENV = "test";
    env.FIX_HISTORY_PATH = path.join(tmpDir, "fix_history.json");
    runAllowedFixMock.mockReset();
    runAllowedFixMock.mockResolvedValue({
      ok: true,
      tookMs: 25,
      stdoutTail: "ok",
      stderrTail: "",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalFixHistoryPath === "string") env.FIX_HISTORY_PATH = originalFixHistoryPath;
    else delete env.FIX_HISTORY_PATH;
  });

  it("returns 403 without unlock/csrf context", async () => {
    const response = await doctorFixPOST(buildRequest({ fixId: "SEED_DEBUG", csrf: "csrf-token" }, false));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    expect(runAllowedFixMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid fixId", async () => {
    const response = await doctorFixPOST(buildRequest({ fixId: "NOT_ALLOWED_FIX", csrf: "csrf-token" }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INVALID_FIX_ID");
    expect(runAllowedFixMock).not.toHaveBeenCalled();
  });

  it("executes only allowed fixId", async () => {
    const response = await doctorFixPOST(buildRequest({ fixId: "SEED_DEBUG", csrf: "csrf-token" }));
    const payload = (await response.json()) as { ok?: boolean; fixId?: string };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.fixId).toBe("SEED_DEBUG");
    expect(runAllowedFixMock).toHaveBeenCalledTimes(1);
    expect(runAllowedFixMock).toHaveBeenCalledWith("SEED_DEBUG");
  });
});
