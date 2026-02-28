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

import { POST as chainPost } from "../src/app/api/dev/doctor/fix/chain/route";

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
  return new Request(`${origin}/api/dev/doctor/fix/chain`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("doctor fix chain dryRun/confirm", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-fix-chain-dryrun-"));
    env.NODE_ENV = "test";
    env.FIX_HISTORY_PATH = path.join(tmpDir, "fix_history.json");
    runAllowedFixMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalFixHistoryPath === "string") env.FIX_HISTORY_PATH = originalFixHistoryPath;
    else delete env.FIX_HISTORY_PATH;
  });

  it("returns chain plan for dryRun without executing fixes", async () => {
    const response = await chainPost(buildRequest({ chainId: "DB_REPAIR", csrf: "csrf-token", dryRun: true }));
    const payload = (await response.json()) as {
      ok?: boolean;
      dryRun?: boolean;
      chain?: {
        chainId?: string;
        risk?: string;
        title?: string;
        steps?: string[];
        impact?: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.chain?.chainId).toBe("DB_REPAIR");
    expect(payload.chain?.risk).toBe("MEDIUM");
    expect(payload.chain?.title).toBe("DB 복구");
    expect(payload.chain?.steps).toEqual(["PRISMA_PUSH", "SEED_DEBUG"]);
    expect(Array.isArray(payload.chain?.impact)).toBe(true);
    expect(payload.chain?.impact?.length).toBeGreaterThan(0);
    expect(runAllowedFixMock).not.toHaveBeenCalled();
  });

  it("requires exact confirm text for HIGH risk chain execution", async () => {
    const withoutConfirm = await chainPost(buildRequest({ chainId: "FULL_REPAIR", csrf: "csrf-token", dryRun: false }));
    const withoutConfirmPayload = (await withoutConfirm.json()) as { ok?: boolean; error?: { code?: string } };
    expect(withoutConfirm.status).toBe(400);
    expect(withoutConfirmPayload.ok).toBe(false);
    expect(withoutConfirmPayload.error?.code).toBe("CONFIRM_REQUIRED");

    const wrongConfirm = await chainPost(buildRequest({
      chainId: "FULL_REPAIR",
      csrf: "csrf-token",
      dryRun: false,
      confirmText: "RUN FULL_REPAIR NOW",
    }));
    const wrongConfirmPayload = (await wrongConfirm.json()) as { ok?: boolean; error?: { code?: string } };
    expect(wrongConfirm.status).toBe(400);
    expect(wrongConfirmPayload.ok).toBe(false);
    expect(wrongConfirmPayload.error?.code).toBe("CONFIRM_REQUIRED");
    expect(runAllowedFixMock).not.toHaveBeenCalled();
  });

  it("executes HIGH risk chain when confirm text matches", async () => {
    runAllowedFixMock.mockImplementation(async (fixId: string) => ({
      ok: true,
      tookMs: 7,
      stdoutTail: `${fixId} ok`,
      stderrTail: "",
    }));

    const response = await chainPost(buildRequest({
      chainId: "FULL_REPAIR",
      csrf: "csrf-token",
      dryRun: false,
      confirmText: "RUN FULL_REPAIR",
    }));
    const payload = (await response.json()) as {
      ok?: boolean;
      chainId?: string;
      steps?: Array<{ fixId?: string; ok?: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.chainId).toBe("FULL_REPAIR");
    expect(payload.steps?.map((step) => step.fixId)).toEqual(["PRISMA_PUSH", "SEED_DEBUG", "DATA_DOCTOR", "DART_WATCH"]);
    expect(payload.steps?.every((step) => step.ok === true)).toBe(true);
    expect(runAllowedFixMock).toHaveBeenCalledTimes(4);
  });
});
