import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runScriptMock } = vi.hoisted(() => ({
  runScriptMock: vi.fn(),
}));

vi.mock("@/lib/dev/runScript", () => ({
  runScript: (...args: unknown[]) => runScriptMock(...args),
}));

import { POST as unlockPOST } from "../src/app/api/dev/unlock/route";
import { POST as watchPOST } from "../src/app/api/dev/dart/watch/route";

const originalNodeEnv = process.env.NODE_ENV;
const originalDevToken = process.env.DEV_ACTION_TOKEN;
const env = process.env as Record<string, string | undefined>;

describe("dev unlock + dart watch auth", () => {
  const host = "localhost:3000";
  const origin = `http://${host}`;

  beforeEach(() => {
    env.NODE_ENV = "test";
    env.DEV_ACTION_TOKEN = "unit-test-token";
    runScriptMock.mockReset();
    runScriptMock.mockResolvedValue({
      ok: true,
      tookMs: 25,
      stdoutTail: "watch ok",
      stderrTail: "",
    });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalDevToken === "string") env.DEV_ACTION_TOKEN = originalDevToken;
    else delete env.DEV_ACTION_TOKEN;
  });

  it("returns 403 when watch is called before unlock", async () => {
    const response = await watchPOST(new Request(`${origin}/api/dev/dart/watch`, {
      method: "POST",
      headers: {
        host,
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ csrf: "unused" }),
    }));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("UNAUTHORIZED");
    expect(runScriptMock).not.toHaveBeenCalled();
  });

  it("allows watch when unlock token is valid and cookie is provided", async () => {
    const unlockResponse = await unlockPOST(new Request(`${origin}/api/dev/unlock`, {
      method: "POST",
      headers: {
        host,
        origin,
        referer: `${origin}/dashboard`,
        "x-dev-token": "unit-test-token",
      },
    }));
    const unlockJson = (await unlockResponse.json()) as { ok?: boolean; csrf?: string };
    expect(unlockResponse.status).toBe(200);
    expect(unlockJson.ok).toBe(true);
    expect(typeof unlockJson.csrf).toBe("string");
    expect((unlockJson.csrf ?? "").length).toBeGreaterThan(8);

    const setCookie = unlockResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("dev_action=1");
    expect(setCookie).toContain("dev_csrf=");

    const csrf = unlockJson.csrf as string;
    const watchResponse = await watchPOST(new Request(`${origin}/api/dev/dart/watch`, {
      method: "POST",
      headers: {
        host,
        origin,
        "content-type": "application/json",
        cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
      },
      body: JSON.stringify({ csrf }),
    }));
    const watchJson = (await watchResponse.json()) as { ok?: boolean; tookMs?: number };

    expect(watchResponse.status).toBe(200);
    expect(watchJson.ok).toBe(true);
    expect(watchJson.tookMs).toBe(25);
    expect(runScriptMock).toHaveBeenCalledTimes(1);
    expect(runScriptMock).toHaveBeenCalledWith({ command: "pnpm", args: ["dart:watch"] });
  });

  it("hides unlock/watch routes in production", async () => {
    env.NODE_ENV = "production";

    const unlockResponse = await unlockPOST(new Request(`${origin}/api/dev/unlock`, { method: "POST" }));
    const watchResponse = await watchPOST(new Request(`${origin}/api/dev/dart/watch`, { method: "POST" }));

    expect(unlockResponse.status).toBe(404);
    expect(watchResponse.status).toBe(404);
    expect(runScriptMock).not.toHaveBeenCalled();
  });
});
