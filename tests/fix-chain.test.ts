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
import { FIX_CHAINS, FIX_CHAIN_DEFS } from "../src/lib/diagnostics/fixChains";

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

describe("doctor fix chain", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-fix-chain-"));
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

  it("exposes expected chain mapping", () => {
    expect(FIX_CHAINS.DB_REPAIR).toEqual(["PRISMA_PUSH", "SEED_DEBUG"]);
    expect(FIX_CHAINS.DART_SETUP).toEqual(["DATA_DOCTOR", "DART_WATCH"]);
    expect(FIX_CHAINS.FULL_REPAIR).toEqual(["PRISMA_PUSH", "SEED_DEBUG", "DATA_DOCTOR", "DART_WATCH"]);
    expect(FIX_CHAIN_DEFS.DB_REPAIR.risk).toBe("MEDIUM");
    expect(FIX_CHAIN_DEFS.FULL_REPAIR.risk).toBe("HIGH");
    expect(FIX_CHAIN_DEFS.FULL_REPAIR.impact.length).toBeGreaterThan(0);
  });

  it("runs chain sequentially on success", async () => {
    runAllowedFixMock.mockImplementation(async (fixId: string) => ({
      ok: true,
      tookMs: fixId === "PRISMA_PUSH" ? 10 : 20,
      stdoutTail: `${fixId} ok`,
      stderrTail: "",
    }));

    const response = await chainPost(buildRequest({ chainId: "DB_REPAIR", csrf: "csrf-token" }));
    const payload = (await response.json()) as {
      ok?: boolean;
      steps?: Array<{ fixId?: string; ok?: boolean }>;
      historyId?: string;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.steps?.map((step) => step.fixId)).toEqual(["PRISMA_PUSH", "SEED_DEBUG"]);
    expect(payload.steps?.every((step) => step.ok === true)).toBe(true);
    expect(typeof payload.historyId).toBe("string");
    expect(runAllowedFixMock).toHaveBeenCalledTimes(2);
    expect(runAllowedFixMock).toHaveBeenNthCalledWith(1, "PRISMA_PUSH");
    expect(runAllowedFixMock).toHaveBeenNthCalledWith(2, "SEED_DEBUG");
  });

  it("stops execution when a step fails", async () => {
    runAllowedFixMock.mockResolvedValueOnce({
      ok: true,
      tookMs: 11,
      stdoutTail: "step1 ok",
      stderrTail: "",
    });
    runAllowedFixMock.mockResolvedValueOnce({
      ok: false,
      tookMs: 22,
      stdoutTail: "",
      stderrTail: "db failed",
      error: { code: "EXIT_NON_ZERO", message: "exit 1" },
    });
    runAllowedFixMock.mockResolvedValueOnce({
      ok: true,
      tookMs: 33,
      stdoutTail: "should not run",
      stderrTail: "",
    });

    const response = await chainPost(buildRequest({ chainId: "FULL_REPAIR", csrf: "csrf-token", confirmText: "RUN FULL_REPAIR" }));
    const payload = (await response.json()) as {
      ok?: boolean;
      steps?: Array<{ fixId?: string; ok?: boolean }>;
      error?: { code?: string };
    };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("EXIT_NON_ZERO");
    expect(payload.steps?.map((step) => step.fixId)).toEqual(["PRISMA_PUSH", "SEED_DEBUG"]);
    expect(payload.steps?.map((step) => step.ok)).toEqual([true, false]);
    expect(runAllowedFixMock).toHaveBeenCalledTimes(2);
  });
});
