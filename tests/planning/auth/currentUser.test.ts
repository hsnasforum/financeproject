import { afterEach, describe, expect, it } from "vitest";
import {
  PlanningAuthError,
  isPlanningAuthRequired,
  requireCurrentPlanningUser,
  withCurrentPlanningUser,
} from "../../../src/lib/planning/auth/currentUser";
import { withCurrentPlanningPageUser } from "../../../src/lib/planning/server/pageAuth";
import { resolvePlanningUserId } from "../../../src/lib/planning/store/namespace";
import { getScopedPlanningAuthSource } from "../../../src/lib/planning/store/userScope";
import { PLANNING_RUNTIME_ATTESTATION } from "../../../src/lib/planning/deployment/runtimePolicy.mjs";

const env = process.env as Record<string, string | undefined>;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalSingleUserMode = process.env.PLANNING_SINGLE_USER_MODE;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function requestWithUser(userId: string, host = "localhost:3000"): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}/api/planning/profiles`, {
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "x-planning-user-id": userId,
    },
  });
}

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
    PLANNING_DESKTOP_SESSION_TOKEN: "s".repeat(43),
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function desktopRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:3100/api/planning/profiles", {
    headers: {
      host: "127.0.0.1:3100",
      cookie: `planning.desktop-session=${"s".repeat(43)}`,
      ...headers,
    },
  });
}

describe("planning current user", () => {
  afterEach(() => {
    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;
    if (typeof originalSingleUserMode === "string") env.PLANNING_SINGLE_USER_MODE = originalSingleUserMode;
    else delete env.PLANNING_SINGLE_USER_MODE;
    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("requires planning auth by default until fallback is explicitly enabled", async () => {
    env.NODE_ENV = "test";
    delete env.PLANNING_AUTH_REQUIRED;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    expect(isPlanningAuthRequired()).toBe(true);
    await expect(requireCurrentPlanningUser(new Request("http://localhost:3000/api/planning/profiles")))
      .rejects
      .toMatchObject({ code: "UNAUTHENTICATED", status: 401 } satisfies Partial<PlanningAuthError>);
  });

  it("keeps local namespace fallback explicit in local/dev when auth is disabled", async () => {
    env.NODE_ENV = "development";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const user = await requireCurrentPlanningUser(new Request("http://localhost:3000/api/planning/profiles"));

    expect(user).toMatchObject({
      id: "default",
      source: "local-namespace",
      authRequired: false,
    });
  });

  it("keeps local namespace fallback closed when the auth env value is invalid", async () => {
    env.NODE_ENV = "development";
    env.PLANNING_AUTH_REQUIRED = "sometimes";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    expect(isPlanningAuthRequired()).toBe(true);
    await expect(requireCurrentPlanningUser(new Request("http://localhost:3000/api/planning/profiles")))
      .rejects
      .toMatchObject({ code: "UNAUTHENTICATED", status: 401 } satisfies Partial<PlanningAuthError>);
  });

  it("keeps planning auth required in production even when fallback env is disabled", async () => {
    env.NODE_ENV = "production";
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_SINGLE_USER_MODE = "1";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    expect(isPlanningAuthRequired()).toBe(true);
    await expect(requireCurrentPlanningUser(new Request("https://example.com/api/planning/profiles")))
      .rejects
      .toMatchObject({ code: "UNAUTHENTICATED", status: 401 } satisfies Partial<PlanningAuthError>);
  });

  it("rejects production planning users when storage ownership is not explicit", async () => {
    env.NODE_ENV = "production";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "0";
    delete env.PLANNING_SINGLE_USER_MODE;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    await expect(requireCurrentPlanningUser(requestWithUser("alice")))
      .rejects
      .toMatchObject({
        code: "INVALID_STORAGE_MODE",
        status: 500,
      });
  });

  it("uses the local namespace without touching Auth.js when auth is optional and no secret is configured", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const user = await requireCurrentPlanningUser(new Request("http://localhost:3000/api/planning/profiles"));

    expect(user).toMatchObject({
      id: "default",
      source: "local-namespace",
      authRequired: false,
    });
  });

  it("rejects unauthenticated access when planning auth is required", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    await expect(requireCurrentPlanningUser(new Request("http://localhost:3000/api/planning/profiles")))
      .rejects
      .toMatchObject({ code: "UNAUTHENTICATED", status: 401 } satisfies Partial<PlanningAuthError>);
  });

  it("rejects trusted user headers unless the internal bridge is enabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    await expect(requireCurrentPlanningUser(requestWithUser("alice")))
      .rejects
      .toMatchObject({ code: "FORBIDDEN", status: 403 } satisfies Partial<PlanningAuthError>);
  });

  it("rejects trusted user headers from remote requests even when the bridge is enabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";

    await expect(requireCurrentPlanningUser(requestWithUser("alice", "example.com")))
      .rejects
      .toMatchObject({ code: "FORBIDDEN", status: 403 } satisfies Partial<PlanningAuthError>);
  });

  it("exposes the current user id through request scope for internal trusted requests", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";

    const user = await requireCurrentPlanningUser(requestWithUser("alice"));
    expect(user).toMatchObject({
      id: "alice",
      source: "trusted-header",
      authRequired: true,
    });

    const scopedUserId = await withCurrentPlanningUser(requestWithUser("alice"), () => resolvePlanningUserId());
    expect(scopedUserId).toBe("alice");
    expect(resolvePlanningUserId()).toBe("default");
  });

  it("preserves auth source in server page user scope", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const scoped = await withCurrentPlanningPageUser(() => ({
      userId: resolvePlanningUserId(),
      authSource: getScopedPlanningAuthSource(),
    }));

    expect(scoped).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
  });

  it("uses the launcher-established desktop session for users/default", async () => {
    await expect(requireCurrentPlanningUser(desktopRequest(), desktopEnv())).resolves.toEqual({
      id: "default",
      source: "desktop-local-session",
      authRequired: true,
    });
  });

  it("rejects an expired desktop cookie instead of falling back to Auth.js", async () => {
    await expect(requireCurrentPlanningUser(
      desktopRequest({ cookie: "planning.desktop-session=expired" }),
      desktopEnv({ AUTH_SECRET: "configured-but-not-a-desktop-identity" }),
    )).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401, recovery: "desktop-launcher" });
  });

  it("fails closed when desktop runtime attestation is absent", async () => {
    await expect(requireCurrentPlanningUser(
      desktopRequest(),
      desktopEnv({ PLANNING_RUNTIME_ATTESTATION: undefined }),
    )).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_READY", status: 503 });
  });

  it.each([
    ["forwarded headers", { "x-forwarded-for": "203.0.113.10" }],
    ["raw identity headers", { "x-planning-user-id": "attacker" }],
    ["host aliases", { host: "localhost:3100" }],
  ])("rejects desktop-local %s", async (_label, headers) => {
    await expect(requireCurrentPlanningUser(
      desktopRequest(headers),
      desktopEnv(),
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
