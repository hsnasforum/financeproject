import { describe, expect, it } from "vitest";
import {
  DevGuardError,
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertNotProduction,
  assertSameOrigin,
  guardDevMutationRequest,
  guardDevReadRequest,
} from "../src/lib/dev/devGuards";

function buildRequest(input?: {
  host?: string;
  origin?: string;
  referer?: string;
  cookie?: string;
  fetchSite?: string;
}): Request {
  const host = input?.host ?? "localhost:3000";
  const headers = new Headers();
  headers.set("host", host);
  if (input?.origin) headers.set("origin", input.origin);
  if (input?.referer) headers.set("referer", input.referer);
  if (input?.cookie) headers.set("cookie", input.cookie);
  if (input?.fetchSite) headers.set("sec-fetch-site", input.fetchSite);
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

  it("accepts localhost/127.0.0.1 alias as same-origin in local mode", () => {
    const request = buildRequest({
      host: "127.0.0.1:3000",
      origin: "http://localhost:3000",
    });
    assertSameOrigin(request);
  });

  it("accepts 0.0.0.0 as local same-origin alias", () => {
    const request = buildRequest({
      host: "0.0.0.0:3000",
      origin: "http://localhost:3000",
    });
    assertLocalHost(request);
    assertSameOrigin(request);
  });

  it("accepts same-origin fetch-site when origin headers are missing", () => {
    const request = buildRequest({
      host: "localhost:3000",
      fetchSite: "same-origin",
    });
    assertSameOrigin(request);
  });

  it("guardDevReadRequest returns 404 response in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      const response = guardDevReadRequest(
        buildRequest({ host: "localhost:3000" }),
        {
          onBlocked: () => new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404 }),
        },
      );
      expect(response?.status).toBe(404);
      const json = response ? await response.json() as { ok?: boolean; error?: string } : null;
      expect(json?.ok).toBe(false);
      expect(json?.error).toBe("NOT_FOUND");
    } finally {
      if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
      else delete env.NODE_ENV;
    }
  });

  it("guardDevReadRequest blocks remote host with LOCAL_ONLY", async () => {
    const response = guardDevReadRequest(buildRequest({ host: "evil.com" }));
    expect(response?.status).toBe(403);
    const json = response ? await response.json() as { ok?: boolean; error?: { code?: string } } : null;
    expect(json?.ok).toBe(false);
    expect(json?.error?.code).toBe("LOCAL_ONLY");
  });

  it("guardDevMutationRequest enforces same-origin and optional csrf", async () => {
    const remote = guardDevMutationRequest(buildRequest({ host: "localhost:3000", origin: "http://evil.com" }));
    expect(remote?.status).toBe(403);
    const remoteJson = remote ? await remote.json() as { error?: { code?: string } } : null;
    expect(remoteJson?.error?.code).toBe("ORIGIN_MISMATCH");

    const csrfRequest = buildRequest({
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "dev_csrf=token-ok",
    });
    const csrfFail = guardDevMutationRequest(csrfRequest, {
      body: { csrf: "mismatch" },
      requireCsrf: true,
    });
    expect(csrfFail?.status).toBe(403);
    const csrfJson = csrfFail ? await csrfFail.json() as { error?: { code?: string } } : null;
    expect(csrfJson?.error?.code).toBe("CSRF_MISMATCH");
  });
});
