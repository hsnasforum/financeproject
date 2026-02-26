import { describe, expect, it } from "vitest";
import {
  DevGuardError,
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertNotProduction,
  assertSameOrigin,
} from "../src/lib/dev/devGuards";

function buildRequest(input?: {
  host?: string;
  origin?: string;
  referer?: string;
  cookie?: string;
}): Request {
  const host = input?.host ?? "localhost:3000";
  const headers = new Headers();
  headers.set("host", host);
  if (input?.origin) headers.set("origin", input.origin);
  if (input?.referer) headers.set("referer", input.referer);
  if (input?.cookie) headers.set("cookie", input.cookie);
  return new Request(`http://${host}/api/dev/test`, { method: "POST", headers });
}

function expectGuard403(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error("expected guard error");
  } catch (error) {
    expect(error).toBeInstanceOf(DevGuardError);
    const guard = error as DevGuardError;
    expect(guard.status).toBe(403);
    expect(guard.code).toBe(code);
  }
}

describe("dev guards", () => {
  it("blocks non-local host", () => {
    expectGuard403(() => assertLocalHost(buildRequest({ host: "evil.com" })), "LOCAL_ONLY");
  });

  it("blocks origin mismatch", () => {
    expectGuard403(
      () => assertSameOrigin(buildRequest({ host: "localhost:3000", origin: "http://evil.com" })),
      "ORIGIN_MISMATCH",
    );
  });

  it("blocks csrf mismatch", () => {
    const request = buildRequest({
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "dev_action=1; dev_csrf=abc123",
    });
    expectGuard403(() => assertCsrf(request, { csrf: "other" }), "CSRF_MISMATCH");
  });

  it("passes in valid local + same-origin + unlocked + csrf case", () => {
    assertNotProduction({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const request = buildRequest({
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/dashboard",
      cookie: "dev_action=1; dev_csrf=token-ok",
    });
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf: "token-ok" });
  });
});
