import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, middleware } from "../src/middleware";
import { PLANNING_RUNTIME_ATTESTATION } from "../src/lib/planning/deployment/runtimePolicy.mjs";

const originalAllowRemote = process.env.ALLOW_REMOTE;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const mutableEnv = process.env as Record<string, string | undefined>;
const DESKTOP_ENV_KEYS = [
  "PLANNING_DEPLOYMENT_MODE",
  "PLANNING_RUNTIME_BIND_HOST",
  "PLANNING_PROXY_MODE",
  "PLANNING_FORWARDED_HEADERS_TRUSTED",
  "PLANNING_DESKTOP_IDENTITY_MODE",
  "PLANNING_DESKTOP_IDENTITY_PROVENANCE",
  "PLANNING_DESKTOP_IDENTITY_READY",
  "PLANNING_PROCESS_MODEL",
  "PLANNING_WRITER_EXCLUSIVITY",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_DATA_ROOT_KIND",
  "PLANNING_DATABASE_PROVIDER",
  "PLANNING_DATABASE_CONNECTION",
  "PLANNING_RUNTIME_ATTESTATION",
  "PLANNING_DESKTOP_SESSION_TOKEN",
] as const;
const originalDesktopEnv = Object.fromEntries(
  DESKTOP_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof DESKTOP_ENV_KEYS)[number], string | undefined>;
const DESKTOP_TOKEN = "m".repeat(43);

function setDesktopEnv(overrides: Record<string, string | undefined> = {}) {
  Object.assign(mutableEnv, {
    NODE_ENV: "production",
    PLANNING_DEPLOYMENT_MODE: "desktop-local",
    PLANNING_RUNTIME_BIND_HOST: "127.0.0.1",
    PLANNING_PROXY_MODE: "none",
    PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
    PLANNING_TRUST_AUTH_HEADERS: "false",
    PLANNING_DESKTOP_IDENTITY_MODE: "desktop-local-session",
    PLANNING_DESKTOP_IDENTITY_PROVENANCE: "launcher-process",
    PLANNING_DESKTOP_IDENTITY_READY: "true",
    PLANNING_PROCESS_MODEL: "single",
    PLANNING_WRITER_EXCLUSIVITY: "data-root-exclusive",
    PLANNING_SINGLE_USER_MODE: "true",
    PLANNING_NAMESPACE_ENABLED: "false",
    PLANNING_DATA_ROOT_KIND: "local",
    PLANNING_DATABASE_PROVIDER: "sqlite",
    PLANNING_DATABASE_CONNECTION: "file",
    PLANNING_RUNTIME_ATTESTATION,
    PLANNING_DESKTOP_SESSION_TOKEN: DESKTOP_TOKEN,
    ...overrides,
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "undefined") delete mutableEnv[key];
  }
}

function makeRequest(url: string, init?: { method?: string; headers?: Record<string, string> }) {
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: {
      host: new URL(url).host,
      ...(init?.headers ?? {}),
    },
  });
}

afterEach(() => {
  if (typeof originalAllowRemote === "string") mutableEnv.ALLOW_REMOTE = originalAllowRemote;
  else delete mutableEnv.ALLOW_REMOTE;
  if (typeof originalNodeEnv === "string") mutableEnv.NODE_ENV = originalNodeEnv;
  else delete mutableEnv.NODE_ENV;
  if (typeof originalPlanningAuthRequired === "string") mutableEnv.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
  else delete mutableEnv.PLANNING_AUTH_REQUIRED;
  if (typeof originalPlanningTrustAuthHeaders === "string") mutableEnv.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
  else delete mutableEnv.PLANNING_TRUST_AUTH_HEADERS;
  for (const key of DESKTOP_ENV_KEYS) {
    const value = originalDesktopEnv[key];
    if (typeof value === "string") mutableEnv[key] = value;
    else delete mutableEnv[key];
  }
});

describe("security middleware", () => {
  it("adds baseline security headers for /planning", () => {
    const response = middleware(makeRequest("http://localhost:3000/planning"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
    expect(response.headers.get("origin-agent-cluster")).toBe("?1");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("adds baseline security headers for /ops", () => {
    const response = middleware(makeRequest("http://localhost:3000/ops"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("omits unsafe-eval from CSP in production", () => {
    mutableEnv.NODE_ENV = "production";
    const response = middleware(makeRequest("https://example.com/planning", {
      headers: {
        host: "localhost:3000",
      },
    }));
    const csp = response.headers.get("content-security-policy") ?? "";
    const scriptSrcDirective = csp.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
    const styleSrcDirective = csp.split(";").find((directive) => directive.trim().startsWith("style-src ")) ?? "";
    const styleSrcElemDirective = csp.split(";").find((directive) => directive.trim().startsWith("style-src-elem")) ?? "";
    const styleSrcAttrDirective = csp.split(";").find((directive) => directive.trim().startsWith("style-src-attr")) ?? "";
    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
    expect(scriptSrcDirective).toContain("'nonce-");
    expect(styleSrcDirective.trim()).toBe("style-src 'self'");
    expect(styleSrcElemDirective.trim()).toBe("style-src-elem 'self'");
    expect(styleSrcAttrDirective.trim()).toBe("style-src-attr 'none'");
    expect(csp).toContain("connect-src 'self' https: wss:");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("connect-src 'self' ws:");
    expect(csp).not.toContain(" http:");
  });

  it("blocks remote access to /ops", async () => {
    const response = middleware(makeRequest("https://example.com/ops", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).toBe(403);
  });

  it("blocks remote access to feedback management pages and APIs", () => {
    for (const path of ["/feedback/list", "/feedback/feedback-id", "/api/feedback/list", "/api/feedback/feedback-id"]) {
      const response = middleware(makeRequest(`https://example.com${path}`, {
        headers: { host: "example.com" },
      }));
      expect(response.status).toBe(403);
    }
  });

  it("keeps ops local-only even when prefetch headers are supplied", () => {
    mutableEnv.NODE_ENV = "production";
    const prefetchHeaders: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }];
    for (const pathname of ["/ops", "/ops/about", "/api/ops/metrics"]) {
      for (const headers of prefetchHeaders) {
        const url = `http://example.com${pathname}`;
        expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(true);
        expect(middleware(makeRequest(url, { headers })).status).toBe(403);
      }
    }
  });

  it("keeps feedback management routes matched for prefetch requests", () => {
    for (const url of [
      "https://example.com/feedback/list",
      "https://example.com/feedback/feedback-id",
      "https://example.com/api/feedback/list",
      "https://example.com/api/feedback/feedback-id",
    ]) {
      expect(unstable_doesMiddlewareMatch({
        config,
        url,
        headers: { "next-router-prefetch": "1" },
      })).toBe(true);
      expect(unstable_doesMiddlewareMatch({
        config,
        url,
        headers: { purpose: "prefetch" },
      })).toBe(true);
    }
  });

  it("rejects forwarded host on feedback management routes", () => {
    for (const path of ["/feedback/list", "/feedback/feedback-id", "/api/feedback/list", "/api/feedback/feedback-id"]) {
      const response = middleware(makeRequest(`https://example.com${path}`, {
        headers: {
          host: "example.com",
          "x-forwarded-host": "localhost:3000",
        },
      }));
      expect(response.status).toBe(403);
    }
  });

  it("keeps public feedback submission paths outside the local-only boundary", () => {
    const pageResponse = middleware(makeRequest("https://example.com/feedback", {
      headers: { host: "example.com" },
    }));
    const apiResponse = middleware(makeRequest("https://example.com/api/feedback", {
      method: "POST",
      headers: { host: "example.com" },
    }));

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
  });

  it("hides feedback management pages and APIs in production", () => {
    mutableEnv.NODE_ENV = "production";
    for (const path of ["/feedback/list", "/api/feedback/list"]) {
      const response = middleware(makeRequest(`https://example.com${path}`, {
        headers: { host: "example.com" },
      }));
      expect(response.status).toBe(404);
    }
  });

  it("blocks remote state-changing request to /api/planning/run", async () => {
    const response = middleware(makeRequest("https://example.com/api/planning/run", {
      method: "POST",
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).toBe(403);
  });

  it("blocks planning API requests without an auth signal when planning auth is required", async () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles"));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("keeps every settings backup API local-only", async () => {
    for (const path of [
      "/api/settings/backup/status",
      "/api/settings/backup/export",
      "/api/settings/backup/export/finalize",
      "/api/settings/backup/preview",
      "/api/settings/backup/restore",
    ]) {
      const response = middleware(makeRequest(`https://example.com${path}`, {
        method: path.endsWith("/status") ? "GET" : "POST",
        headers: { host: "example.com", cookie: "authjs.session-token=session" },
      }));
      expect(response.status).toBe(403);
    }
  });

  it("requires an auth signal for every local settings backup API", async () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    for (const path of [
      "/api/settings/backup/status",
      "/api/settings/backup/export",
      "/api/settings/backup/export/finalize",
      "/api/settings/backup/preview",
      "/api/settings/backup/restore",
    ]) {
      const response = middleware(makeRequest(`http://localhost:3000${path}`, {
        method: path.endsWith("/status") ? "GET" : "POST",
      }));
      const body = await response.json() as { error?: { code?: string } };
      expect(response.status).toBe(401);
      expect(body.error?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("allows local settings backup APIs through the trusted auth bridge", () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    mutableEnv.PLANNING_TRUST_AUTH_HEADERS = "1";
    const response = middleware(makeRequest("http://localhost:3000/api/settings/backup/status", {
      headers: { "x-planning-user-id": "alice" },
    }));

    expect(response.status).toBe(200);
  });

  it("blocks planning API requests by default until local fallback is explicitly enabled", async () => {
    delete mutableEnv.PLANNING_AUTH_REQUIRED;
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles"));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("allows planning API requests without an auth signal only when auth is explicitly disabled", () => {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.PLANNING_AUTH_REQUIRED = "0";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles"));

    expect(response.status).toBe(200);
  });

  it("blocks planning API fallback when the auth env value is invalid", async () => {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.PLANNING_AUTH_REQUIRED = "sometimes";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles"));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("requires planning auth in production even when fallback env is disabled", async () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.PLANNING_AUTH_REQUIRED = "0";
    const response = middleware(makeRequest("https://example.com/api/planning/profiles", {
      headers: {
        host: "example.com",
      },
    }));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("allows planning API requests with an Auth.js session cookie when planning auth is required", () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
      headers: {
        cookie: "authjs.session-token=session",
      },
    }));

    expect(response.status).toBe(200);
  });

  it("blocks trusted planning auth headers when the internal bridge is disabled", async () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    mutableEnv.PLANNING_TRUST_AUTH_HEADERS = "0";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
      headers: {
        "x-planning-user-id": "alice",
      },
    }));
    const body = await response.json() as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(403);
    expect(body.error).toEqual({
      code: "FORBIDDEN",
      message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
    });
  });

  it("blocks untrusted planning auth headers before session cookie fallback", async () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    mutableEnv.PLANNING_TRUST_AUTH_HEADERS = "0";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
      headers: {
        cookie: "authjs.session-token=session",
        "x-planning-user-id": "alice",
      },
    }));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("blocks remote trusted planning auth headers even when the internal bridge is enabled", async () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    mutableEnv.PLANNING_TRUST_AUTH_HEADERS = "1";
    const response = middleware(makeRequest("https://example.com/api/planning/profiles", {
      headers: {
        host: "example.com",
        "x-planning-user-id": "alice",
      },
    }));
    const body = await response.json() as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(403);
    expect(body.error).toEqual({
      code: "FORBIDDEN",
      message: "신뢰된 인증 헤더는 로컬 또는 내부 프록시 요청에서만 사용할 수 있습니다.",
    });
  });

  it("allows trusted planning auth headers only when the internal bridge is enabled", () => {
    mutableEnv.PLANNING_AUTH_REQUIRED = "1";
    mutableEnv.PLANNING_TRUST_AUTH_HEADERS = "1";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
      headers: {
        "x-planning-user-id": "alice",
      },
    }));

    expect(response.status).toBe(200);
  });

  it.each([
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ])("lets chunked %s sessions reach route authentication", (name) => {
    mutableEnv.NODE_ENV = "production";
    const response = middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
      headers: { cookie: `${name}.0=first; ${name}.1=second` },
    }));
    expect(response.status).toBe(200);
  });

  it.each(["authjs.session-token.0=", "authjs.session-token.other=value", "authjs.session-token-extra.0=value"])(
    "rejects missing or similarly named session signals: %s",
    (cookie) => {
      mutableEnv.NODE_ENV = "production";
      expect(middleware(makeRequest("http://localhost:3000/api/planning/profiles", {
        headers: { cookie },
      })).status).toBe(401);
    },
  );

  it("allows a launcher-attested desktop session on exact loopback", () => {
    setDesktopEnv();
    const response = middleware(makeRequest("http://127.0.0.1:3100/api/planning/profiles", {
      headers: {
        cookie: `planning.desktop-session=${DESKTOP_TOKEN}`,
      },
    }));

    expect(response.status).toBe(200);
  });

  it("does not accept an Auth.js cookie as desktop-local identity", async () => {
    setDesktopEnv();
    const response = middleware(makeRequest("http://127.0.0.1:3100/api/planning/profiles", {
      headers: {
        cookie: "authjs.session-token=session",
      },
    }));
    const body = await response.json() as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
    expect(body.error?.message).toBe("데스크톱 세션을 확인하지 못했습니다. 앱 실행 아이콘이나 시작 명령으로 다시 열어 주세요.");
  });

  it.each([
    ["forwarded headers", { "x-forwarded-for": "203.0.113.10", cookie: `planning.desktop-session=${DESKTOP_TOKEN}` }],
    ["raw identity headers", { "x-planning-user-id": "default", cookie: `planning.desktop-session=${DESKTOP_TOKEN}` }],
    ["host aliases", { host: "localhost:3100", cookie: `planning.desktop-session=${DESKTOP_TOKEN}` }],
  ])("blocks desktop-local %s", async (_label, headers) => {
    setDesktopEnv();
    const response = middleware(makeRequest("http://127.0.0.1:3100/api/planning/profiles", { headers }));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toMatch(/FORBIDDEN|LOCAL_ONLY/);
  });

  it("fails closed when desktop runtime attestation is missing", async () => {
    setDesktopEnv({ PLANNING_RUNTIME_ATTESTATION: undefined });
    const response = middleware(makeRequest("http://127.0.0.1:3100/api/planning/profiles", {
      headers: {
        cookie: `planning.desktop-session=${DESKTOP_TOKEN}`,
      },
    }));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("DEPLOYMENT_NOT_READY");
  });

  it("blocks remote access to /api/dev in development", () => {
    const response = middleware(makeRequest("https://example.com/api/dev/errors/recent", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).toBe(403);
  });

  it("blocks remote access to dev pages in development", () => {
    const response = middleware(makeRequest("https://example.com/dev/data", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).toBe(403);
  });

  it("lets dev-only routes fall through in production so route handlers can return 404", () => {
    mutableEnv.NODE_ENV = "production";
    const response = middleware(makeRequest("https://example.com/api/dev/errors/recent", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).not.toBe(403);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("lets legacy /planner routes fall through to app redirect pages", () => {
    const response = middleware(makeRequest("http://localhost:3000/planner/legacy"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows remote when ALLOW_REMOTE=true outside production", () => {
    mutableEnv.ALLOW_REMOTE = "true";
    const response = middleware(makeRequest("https://example.com/ops", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).not.toBe(403);
  });

  it("ignores ALLOW_REMOTE=true in production", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.ALLOW_REMOTE = "true";
    const response = middleware(makeRequest("https://example.com/ops", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).toBe(403);
  });
});
