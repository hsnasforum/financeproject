import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCurrentPlanningUser } from "../../../src/lib/planning/auth/currentUser";
import {
  planningUserMeta,
  requirePlanningRouteUser,
  withPlanningRouteUser,
} from "../../../src/lib/planning/api/routeAuth";
import { resolvePlanningUserId } from "../../../src/lib/planning/store/namespace";
import { getScopedPlanningAuthSource } from "../../../src/lib/planning/store/userScope";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

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
