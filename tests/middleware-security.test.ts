import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const originalAllowRemote = process.env.ALLOW_REMOTE;

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
  if (typeof originalAllowRemote === "string") process.env.ALLOW_REMOTE = originalAllowRemote;
  else delete process.env.ALLOW_REMOTE;
});

describe("security middleware", () => {
  it("adds baseline security headers for /planning", () => {
    const response = middleware(makeRequest("http://localhost:3000/planning"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("adds baseline security headers for /ops", () => {
    const response = middleware(makeRequest("http://localhost:3000/ops"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
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

  it("keeps legacy /planner redirect", () => {
    const response = middleware(makeRequest("http://localhost:3000/planner/runs"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/planning/runs");
  });

  it("allows remote when ALLOW_REMOTE=true", () => {
    process.env.ALLOW_REMOTE = "true";
    const response = middleware(makeRequest("https://example.com/ops", {
      headers: {
        host: "example.com",
      },
    }));
    expect(response.status).not.toBe(403);
  });
});
