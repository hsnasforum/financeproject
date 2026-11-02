import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireCurrentPlanningUser } from "../../../src/lib/planning/auth/currentUser";
import {
  planningUserMeta,
  requirePlanningRouteUser,
  withPlanningRouteUser,
} from "../../../src/lib/planning/api/routeAuth";
import { resolvePlanningUserId } from "../../../src/lib/planning/store/namespace";
import { getScopedPlanningAuthSource } from "../../../src/lib/planning/store/userScope";
import { withCurrentPlanningPageUser } from "../../../src/lib/planning/server/pageAuth";

const { authMock, pageHeadersMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  pageHeadersMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));
vi.mock("next/headers", () => ({ headers: pageHeadersMock }));

function desktopEnv(): Record<string, string | undefined> {
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
    PLANNING_RUNTIME_ATTESTATION: "desktop-launcher-v1",
    PLANNING_DESKTOP_SESSION_TOKEN: "d".repeat(43),
    AUTH_SECRET: undefined,
    NEXTAUTH_SECRET: undefined,
  };
}

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PLANNING_AUTH_REQUIRED: "1",
    PLANNING_TRUST_AUTH_HEADERS: "0",
    PLANNING_USER_ID: "default",
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_SECRET: undefined,
    ...values,
  } as NodeJS.ProcessEnv;
}

function planningRequest(): Request {
  return new Request("http://localhost:3000/api/planning/profiles", {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
    },
  });
}

function planningRequestWithTrustedHeader(userId: string): Request {
  return new Request("http://localhost:3000/api/planning/profiles", {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
      "x-planning-user-id": userId,
    },
  });
}

describe("planning auth-session current user", () => {
  beforeEach(() => {
    authMock.mockReset();
    pageHeadersMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("authenticates a production server page through the launcher cookie without consulting Auth.js", async () => {
    for (const [key, value] of Object.entries(desktopEnv())) vi.stubEnv(key, value);
    pageHeadersMock.mockResolvedValue(new Headers({ host: "127.0.0.1:3100", cookie: `planning.desktop-session=${"d".repeat(43)}` }));
    authMock.mockRejectedValue(new Error("OAuth must not run in desktop-local"));
    await expect(withCurrentPlanningPageUser((user) => ({ user, scopedUserId: resolvePlanningUserId(), source: getScopedPlanningAuthSource() }))).resolves.toEqual({
      user: { id: "default", source: "desktop-local-session", authRequired: true },
      scopedUserId: "default",
      source: "desktop-local-session",
    });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects missing desktop cookies even when an Auth.js session exists", async () => {
    const env: NodeJS.ProcessEnv = { ...desktopEnv(), NODE_ENV: "production", AUTH_SECRET: "test-web-secret" };
    authMock.mockResolvedValue({ user: { id: "web-user" } });
    await expect(requireCurrentPlanningUser(new Request("http://127.0.0.1:3100/planning", { headers: { host: "127.0.0.1:3100" } }), env)).rejects.toMatchObject({
      code: "UNAUTHENTICATED", status: 401, recovery: "desktop-launcher",
    });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("does not use desktop identity in ordinary production and preserves multi-user sessions", async () => {
    const env = testEnv({ NODE_ENV: "production", PLANNING_NAMESPACE_ENABLED: "true", PLANNING_SINGLE_USER_MODE: "false", PLANNING_DEPLOYMENT_MODE: "web-multi", PLANNING_AUTH_REQUIRED: "false" });
    authMock.mockResolvedValue(null);
    await expect(requireCurrentPlanningUser(planningRequest(), env)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401, recovery: "sign-in" });
    authMock.mockResolvedValue({ user: { id: "web-user" } });
    await expect(requireCurrentPlanningUser(planningRequest(), env)).resolves.toEqual({ id: "web-user", source: "auth-session", authRequired: true });
  });

  it("uses Auth.js session user id when a runtime secret is configured", async () => {
    authMock.mockResolvedValue({ user: { id: " session-user " } });

    const user = await requireCurrentPlanningUser(planningRequest(), testEnv());

    expect(authMock).toHaveBeenCalledTimes(1);
    expect(user).toEqual({
      id: "session-user",
      source: "auth-session",
      authRequired: true,
    });
  });

  it("keeps requirePlanningRouteUser on the auth-session meta contract", async () => {
    authMock.mockResolvedValue({ user: { id: "session-user" } });

    const result = await requirePlanningRouteUser(planningRequest(), testEnv());

    expect(result).not.toBeInstanceOf(Response);
    expect(planningUserMeta(result as Exclude<typeof result, Response>)).toEqual({
      userId: "session-user",
      authSource: "auth-session",
    });
  });

  it("scopes withPlanningRouteUser callbacks to the Auth.js session user", async () => {
    authMock.mockResolvedValue({ user: { id: "session-user" } });

    const result = await withPlanningRouteUser(
      planningRequest(),
      (currentUser) => ({
        authSource: getScopedPlanningAuthSource(),
        scopedUserId: resolvePlanningUserId(),
        meta: planningUserMeta(currentUser),
      }),
      testEnv(),
    );

    expect(result).toEqual({
      authSource: "auth-session",
      scopedUserId: "session-user",
      meta: {
        userId: "session-user",
        authSource: "auth-session",
      },
    });
  });

  it("rejects spoofed trusted headers instead of falling back to Auth.js sessions", async () => {
    authMock.mockResolvedValue({ user: { id: "session-user" } });

    await expect(
      requireCurrentPlanningUser(
        planningRequestWithTrustedHeader("attacker"),
        testEnv({ PLANNING_TRUST_AUTH_HEADERS: "0" }),
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("uses the local trusted header bridge before Auth.js sessions only when explicitly enabled", async () => {
    authMock.mockResolvedValue({ user: { id: "session-user" } });

    const user = await requireCurrentPlanningUser(
      planningRequestWithTrustedHeader("bridge-user"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );

    expect(authMock).not.toHaveBeenCalled();
    expect(user).toEqual({
      id: "bridge-user",
      source: "trusted-header",
      authRequired: true,
    });
  });

  it("does not consult Auth.js when no runtime secret is configured", async () => {
    authMock.mockResolvedValue({ user: { id: "session-user" } });

    await expect(
      requireCurrentPlanningUser(planningRequest(), testEnv({
        AUTH_SECRET: undefined,
        NEXTAUTH_SECRET: undefined,
      })),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(authMock).not.toHaveBeenCalled();
  });
});
