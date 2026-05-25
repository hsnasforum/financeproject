import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const originalAllowRemote = process.env.ALLOW_REMOTE;
const originalNodeEnv = process.env.NODE_ENV;
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
