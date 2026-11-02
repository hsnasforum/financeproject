import { describe, expect, it } from "vitest";
import {
  PLANNING_RUNTIME_ATTESTATION,
  normalizePlanningRuntimePolicyInput,
  resolvePlanningRuntimePolicy,
} from "../../../src/lib/planning/deployment/runtimePolicy.mjs";
import {
  evaluateDesktopSessionRequest,
  PLANNING_DESKTOP_SESSION_COOKIE,
} from "../../../src/lib/planning/deployment/desktopSession.mjs";

const SESSION_TOKEN = "a".repeat(43);

function desktopEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
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
    PLANNING_DESKTOP_SESSION_TOKEN: SESSION_TOKEN,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function desktopRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:3100/api/planning/profiles", {
    headers: {
      host: "127.0.0.1:3100",
      cookie: `${PLANNING_DESKTOP_SESSION_COOKIE}=${SESSION_TOKEN}`,
      ...headers,
    },
  });
}

describe("planning runtime policy adapter", () => {
  it("turns launcher-attested desktop facts into the canonical success decision", () => {
    expect(resolvePlanningRuntimePolicy(desktopEnv())).toMatchObject({
      ok: true,
      mode: "desktop-local",
      writerExclusivity: "data-root-exclusive",
      identityMode: "desktop-local-session",
    });
  });

  it("does not trust a claimed lease or session without launcher attestation", () => {
    const input = normalizePlanningRuntimePolicyInput(desktopEnv({
      PLANNING_RUNTIME_ATTESTATION: undefined,
    }));

    expect(input.writerExclusivity).toBe("unknown");
    expect(input.dataRootKind).toBe("unknown");
    expect(input.desktopLocalIdentityReady).toBe(false);
    expect(resolvePlanningRuntimePolicy(desktopEnv({
      PLANNING_RUNTIME_ATTESTATION: undefined,
    }))).toMatchObject({ ok: false, code: "DEPLOYMENT_POLICY_CONFLICT" });
  });

  it("requires a high-entropy process-lifetime session token", () => {
    expect(resolvePlanningRuntimePolicy(desktopEnv({
      PLANNING_DESKTOP_SESSION_TOKEN: "short",
    }))).toMatchObject({
      ok: false,
      code: "DEPLOYMENT_AUTH_NOT_READY",
      conflicts: ["desktopLocalIdentityReady"],
    });
  });
});

describe("desktop-local session request", () => {
  it("accepts only the launcher token on the exact IPv4 loopback host", () => {
    expect(evaluateDesktopSessionRequest(desktopRequest(), desktopEnv())).toEqual({
      ok: true,
      userId: "default",
      source: "desktop-local-session",
    });
  });

  it.each([
    ["wrong cookie", { cookie: `${PLANNING_DESKTOP_SESSION_COOKIE}=wrong` }, "SESSION_REQUIRED"],
    ["localhost alias", { host: "localhost:3100" }, "HOST_FORBIDDEN"],
    ["remote forwarded host", { "x-forwarded-host": "example.com" }, "FORWARDED_HEADERS_FORBIDDEN"],
    ["remote forwarded address", { "x-forwarded-for": "203.0.113.10" }, "FORWARDED_HEADERS_FORBIDDEN"],
    ["raw planning identity", { "x-planning-user-id": "default" }, "RAW_IDENTITY_HEADERS_FORBIDDEN"],
  ])("rejects %s", (_label, headers, code) => {
    expect(evaluateDesktopSessionRequest(desktopRequest(headers), desktopEnv())).toMatchObject({
      ok: false,
      code,
    });
  });

  it("allows only the canonical loopback forwarding values synthesized by Next.js", () => {
    expect(evaluateDesktopSessionRequest(desktopRequest({
      "x-forwarded-for": "127.0.0.1",
      "x-forwarded-host": "127.0.0.1:3100",
      "x-forwarded-port": "3100",
      "x-forwarded-proto": "http",
    }), desktopEnv())).toMatchObject({ ok: true, source: "desktop-local-session" });
  });
});
