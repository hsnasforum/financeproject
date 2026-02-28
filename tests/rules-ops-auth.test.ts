import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runAllowedRuleActionMock } = vi.hoisted(() => ({
  runAllowedRuleActionMock: vi.fn(),
}));

vi.mock("../src/lib/dev/runScript", async () => {
  const actual = await vi.importActual("../src/lib/dev/runScript");
  return {
    ...(actual as object),
    runAllowedRuleAction: (...args: unknown[]) => runAllowedRuleActionMock(...args),
  };
});

import { POST as rulesRunPost } from "../src/app/api/dev/dart/rules/run/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

function buildRequest(body: Record<string, unknown>, withAuth = true): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: `${origin}/ops/rules`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${origin}/api/dev/dart/rules/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("rules ops api auth", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    runAllowedRuleActionMock.mockReset();
    runAllowedRuleActionMock.mockResolvedValue({
      ok: true,
      tookMs: 12,
      stdoutTail: "ok",
      stderrTail: "",
    });
  });

  it("returns 403 without dev guard context", async () => {
    const response = await rulesRunPost(buildRequest({ action: "EVAL_ALL", csrf: "csrf-token" }, false));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    expect(runAllowedRuleActionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for disallowed action", async () => {
    const response = await rulesRunPost(buildRequest({ action: "NOT_ALLOWED_ACTION", csrf: "csrf-token" }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INVALID_ACTION");
    expect(runAllowedRuleActionMock).not.toHaveBeenCalled();
  });

  it("executes allowed action", async () => {
    const response = await rulesRunPost(buildRequest({ action: "GATE", csrf: "csrf-token" }));
    const payload = (await response.json()) as { ok?: boolean; tookMs?: number };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(typeof payload.tookMs).toBe("number");
    expect(runAllowedRuleActionMock).toHaveBeenCalledTimes(1);
    expect(runAllowedRuleActionMock).toHaveBeenCalledWith("GATE", { timeoutMs: 600000 });
  });
});

afterEach(() => {
  if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
  else delete env.NODE_ENV;
});
