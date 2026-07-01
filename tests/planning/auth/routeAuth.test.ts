import { describe, expect, it } from "vitest";
import { PlanningAuthError } from "../../../src/lib/planning/auth/currentUser";
import { resolvePlanningUserId } from "../../../src/lib/planning/store/namespace";
import { getScopedPlanningAuthSource } from "../../../src/lib/planning/store/userScope";
import {
  planningAuthErrorResponse,
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
  withPlanningRouteUser,
} from "../../../src/lib/planning/api/routeAuth";

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PLANNING_AUTH_REQUIRED: "1",
    PLANNING_TRUST_AUTH_HEADERS: "0",
    AUTH_SECRET: undefined,
    NEXTAUTH_SECRET: undefined,
    ...values,
  } as NodeJS.ProcessEnv;
}

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

describe("planning route auth boundary", () => {
  it("converts unauthenticated planning auth errors to the standard API error shape", async () => {
    const response = planningAuthErrorResponse(
      new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
    await expect(readJson(response as Response)).resolves.toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
  });

  it("converts forbidden planning auth errors to the standard API error shape", async () => {
    const response = planningAuthErrorResponse(
      new PlanningAuthError("FORBIDDEN", "신뢰된 인증 헤더가 비활성화되어 있습니다.", 403),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(403);
    await expect(readJson(response as Response)).resolves.toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
      },
    });
  });

  it("returns null for non-auth errors so routes keep their local error handling", () => {
    expect(planningAuthErrorResponse(new Error("boom"))).toBeNull();
  });

  it("maps route user metadata to the public user/auth source keys", () => {
    expect(planningUserMeta({
      id: "alice",
      source: "trusted-header",
      authRequired: true,
    })).toEqual({
      userId: "alice",
      authSource: "trusted-header",
    });
  });

  it("returns the standard 401 response from requirePlanningRouteUser when auth is required", async () => {
    const result = await requirePlanningRouteUser(
      new Request("http://localhost:3000/api/planning/profiles"),
      testEnv(),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const body = await readJson(result as Response);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
    expect(body).not.toHaveProperty("meta");
  });

  it("does not attach route user metadata to unauthenticated 401 responses", async () => {
    const result = await requirePlanningRouteUser(
      new Request("http://localhost:3000/api/planning/profiles"),
      testEnv(),
    );

    expect(result).toBeInstanceOf(Response);
    const body = await readJson(result as Response);
    expect(body).not.toHaveProperty("meta");
  });

  it("keeps production route auth closed even when local fallback env is disabled", async () => {
    const result = await requirePlanningRouteUser(
      new Request("https://example.com/api/planning/profiles"),
      testEnv({
        NODE_ENV: "production",
        PLANNING_AUTH_REQUIRED: "0",
        PLANNING_SINGLE_USER_MODE: "1",
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const body = await readJson(result as Response);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
    expect(body).not.toHaveProperty("meta");
  });

  it("returns the standard 403 response when trusted headers are disabled", async () => {
    const result = await requirePlanningRouteUser(
      requestWithUser("alice"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "0" }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    await expect(readJson(result as Response)).resolves.toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
      },
    });
  });

  it("does not echo spoofed trusted-header identities in 403 responses", async () => {
    const result = await requirePlanningRouteUser(
      requestWithUser("attacker"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "0" }),
    );

    expect(result).toBeInstanceOf(Response);
    const body = await readJson(result as Response);
    expect(body).not.toHaveProperty("meta");
    expect(JSON.stringify(body)).not.toContain("attacker");
  });

  it("returns the standard 403 response for remote trusted headers", async () => {
    const result = await requirePlanningRouteUser(
      requestWithUser("alice", "example.com"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    await expect(readJson(result as Response)).resolves.toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더는 로컬 또는 내부 프록시 요청에서만 사용할 수 있습니다.",
      },
    });
  });

  it("scopes successful withPlanningRouteUser callbacks and exposes standard user meta", async () => {
    const result = await withPlanningRouteUser(
      requestWithUser("alice"),
      (currentUser) => ({
        authSource: getScopedPlanningAuthSource(),
        scopedUserId: resolvePlanningUserId(),
        meta: planningUserMeta(currentUser),
      }),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );

    expect(result).toEqual({
      authSource: "trusted-header",
      scopedUserId: "alice",
      meta: {
        userId: "alice",
        authSource: "trusted-header",
      },
    });
  });

  it("returns successful requirePlanningRouteUser results with standard user meta", async () => {
    const result = await requirePlanningRouteUser(
      requestWithUser("bob"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(planningUserMeta(result as Exclude<typeof result, Response>)).toEqual({
      userId: "bob",
      authSource: "trusted-header",
    });
  });

  it("keeps withPlanningRouteUser scope across awaited callbacks", async () => {
    const result = await withPlanningRouteUser(
      requestWithUser("dana"),
      async (currentUser) => {
        await Promise.resolve();
        return {
          authSource: getScopedPlanningAuthSource(),
          scopedUserId: resolvePlanningUserId(),
          meta: planningUserMeta(currentUser),
        };
      },
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );

    expect(result).toEqual({
      authSource: "trusted-header",
      scopedUserId: "dana",
      meta: {
        userId: "dana",
        authSource: "trusted-header",
      },
    });
    expect(resolvePlanningUserId()).toBe("default");
  });

  it("keeps isPlanningRouteUser as the route guard and refreshes request scope", async () => {
    const denied = await requirePlanningRouteUser(
      requestWithUser("blocked"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "0" }),
    );
    expect(isPlanningRouteUser(denied)).toBe(false);

    const allowed = await requirePlanningRouteUser(
      requestWithUser("carol"),
      testEnv({ PLANNING_TRUST_AUTH_HEADERS: "1" }),
    );
    expect(isPlanningRouteUser(allowed)).toBe(true);
    expect(resolvePlanningUserId()).toBe("carol");
  });
});
