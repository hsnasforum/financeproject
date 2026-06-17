import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const originalAllowRemote = process.env.ALLOW_REMOTE;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const mutableEnv = process.env as Record<string, string | undefined>;

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
