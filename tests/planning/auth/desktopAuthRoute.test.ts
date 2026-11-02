import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../../../src/app/api/auth/[...nextauth]/route";
import { PLANNING_RUNTIME_ATTESTATION } from "../../../src/lib/planning/deployment/runtimePolicy.mjs";

const { webGet, webPost } = vi.hoisted(() => ({ webGet: vi.fn(), webPost: vi.fn() }));
vi.mock("@/auth", () => ({ handlers: { GET: webGet, POST: webPost } }));

function desktopEnv() {
  for (const [key, value] of Object.entries({
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
    PLANNING_DESKTOP_SESSION_TOKEN: "r".repeat(43),
    AUTH_SECRET: undefined,
    NEXTAUTH_SECRET: undefined,
    AUTH_TRUST_HOST: undefined,
  })) vi.stubEnv(key, value);
}

function request(endpoint = "signin", headers: Record<string, string> = {}, method = "GET") {
  return new NextRequest(`http://127.0.0.1:3100/api/auth/${endpoint}`, {
    method,
    headers: { host: "127.0.0.1:3100", ...headers },
  });
}

beforeEach(() => { webGet.mockReset(); webPost.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("desktop and web Auth.js route boundary", () => {
  it("recovers an unauthenticated desktop sign-in bookmark locally without granting a cookie", async () => {
    desktopEnv();
    const response = await GET(request("signin?callbackUrl=https://attacker.invalid", { "next-router-prefetch": "1" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3100/planning");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(webGet).not.toHaveBeenCalled();
  });

  it("does not run other OAuth handlers even with a valid desktop session", async () => {
    desktopEnv();
    const headers = { cookie: `planning.desktop-session=${"r".repeat(43)}` };
    for (const endpoint of ["session", "providers", "csrf", "callback/github", "signout"]) {
      expect((await GET(request(endpoint, headers))).status).toBe(404);
    }
    expect((await POST(request("signin", headers, "POST"))).status).toBe(404);
    expect(webGet).not.toHaveBeenCalled();
    expect(webPost).not.toHaveBeenCalled();
  });

  it.each([
    ["remote host", { host: "example.com" }],
    ["out-of-range port", { host: "127.0.0.1:65536" }],
    ["invalid five-digit port", { host: "127.0.0.1:99999" }],
    ["remote forwarding", { "x-forwarded-for": "203.0.113.7" }],
    ["raw identity", { "x-planning-user-id": "default" }],
  ])("rejects %s without falling back to web authentication", async (_name, headers) => {
    desktopEnv();
    expect((await GET(request("signin", headers))).status).toBe(403);
    expect(webGet).not.toHaveBeenCalled();
  });

  it("requires runtime attestation even for session recovery", async () => {
    desktopEnv();
    vi.stubEnv("PLANNING_RUNTIME_ATTESTATION", undefined);
    expect((await GET(request())).status).toBe(503);
    expect(webGet).not.toHaveBeenCalled();
  });

  it.each([undefined, "web-single", "web-multi"])("preserves production web handlers, requests and responses in %s mode", async (mode) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLANNING_DEPLOYMENT_MODE", mode);
    vi.stubEnv("PLANNING_SINGLE_USER_MODE", "true");
    vi.stubEnv("PLANNING_AUTH_REQUIRED", "false");
    const getRequest = new NextRequest("https://example.com/api/auth/signin?callbackUrl=%2Fplanning");
    const postRequest = new NextRequest("https://example.com/api/auth/callback/github", { method: "POST", body: "original-body" });
    const getResponse = new Response("web-login", { status: 401 });
    const postResponse = new Response(null, { status: 302, headers: { location: "/dashboard" } });
    webGet.mockResolvedValue(getResponse);
    webPost.mockResolvedValue(postResponse);
    expect(await GET(getRequest)).toBe(getResponse);
    expect(await POST(postRequest)).toBe(postResponse);
    expect(webGet).toHaveBeenCalledExactlyOnceWith(getRequest);
    expect(webPost).toHaveBeenCalledExactlyOnceWith(postRequest);
    expect(await postRequest.text()).toBe("original-body");
  });
});
