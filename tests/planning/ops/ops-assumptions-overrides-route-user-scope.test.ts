import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listRouteAssumptionsOverridesMock,
  patchRouteAssumptionsOverridesMock,
  replaceRouteAssumptionsOverridesMock,
  resetRouteAssumptionsOverridesMock,
} = vi.hoisted(() => ({
  listRouteAssumptionsOverridesMock: vi.fn(),
  patchRouteAssumptionsOverridesMock: vi.fn(),
  replaceRouteAssumptionsOverridesMock: vi.fn(),
  resetRouteAssumptionsOverridesMock: vi.fn(),
}));

vi.mock("@/lib/planning/server/assumptions/overridesRouteService", () => ({
  listRouteAssumptionsOverrides: (...args: unknown[]) => listRouteAssumptionsOverridesMock(...args),
  patchRouteAssumptionsOverrides: (...args: unknown[]) => patchRouteAssumptionsOverridesMock(...args),
  replaceRouteAssumptionsOverrides: (...args: unknown[]) => replaceRouteAssumptionsOverridesMock(...args),
  resetRouteAssumptionsOverrides: (...args: unknown[]) => resetRouteAssumptionsOverridesMock(...args),
}));

import {
  DELETE as overridesDELETE,
  GET as overridesGET,
  PATCH as overridesPATCH,
  POST as overridesPOST,
  PUT as overridesPUT,
} from "../../../src/app/api/ops/assumptions/overrides/route";
import { POST as overridesResetPOST } from "../../../src/app/api/ops/assumptions/overrides/reset/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningUserId = process.env.PLANNING_USER_ID;

function buildJsonRequest(options: {
  body: Record<string, unknown>;
  method: "DELETE" | "PATCH" | "POST" | "PUT";
  path?: string;
}): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const csrf = typeof options.body.csrf === "string" ? options.body.csrf : "csrf-token";
  return new Request(`${origin}${options.path ?? "/api/ops/assumptions/overrides"}`, {
    method: options.method,
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      "content-type": "application/json",
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    },
    body: JSON.stringify(options.body),
  });
}

function buildGetRequest(profileId = "profile-1", csrf = "csrf-token"): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const url = new URL(`${origin}/api/ops/assumptions/overrides`);
  url.searchParams.set("csrf", csrf);
  url.searchParams.set("profileId", profileId);
  return new Request(url, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    },
  });
}

function expectNoServiceCalls(): void {
  expect(listRouteAssumptionsOverridesMock).not.toHaveBeenCalled();
  expect(patchRouteAssumptionsOverridesMock).not.toHaveBeenCalled();
  expect(replaceRouteAssumptionsOverridesMock).not.toHaveBeenCalled();
  expect(resetRouteAssumptionsOverridesMock).not.toHaveBeenCalled();
}

describe("ops assumptions overrides route user scope", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.PLANNING_TRUST_AUTH_HEADERS;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_USER_ID;
    listRouteAssumptionsOverridesMock.mockReset();
    patchRouteAssumptionsOverridesMock.mockReset();
    replaceRouteAssumptionsOverridesMock.mockReset();
    resetRouteAssumptionsOverridesMock.mockReset();
  });

  it("returns override list with current planning user meta", async () => {
    const items = [{
      key: "inflationPct",
      value: 2.6,
      reason: "operator adjustment",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }];
    listRouteAssumptionsOverridesMock.mockResolvedValue({
      profileId: "profile-1",
      items,
    });

    const response = await overridesGET(buildGetRequest("profile-1"));
    const payload = (await response.json()) as {
      ok?: boolean;
      profileId?: string;
      items?: unknown[];
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.profileId).toBe("profile-1");
    expect(payload.items).toEqual(items);
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(listRouteAssumptionsOverridesMock).toHaveBeenCalledWith("profile-1");
  });

  it("returns replace and legacy POST responses with current planning user meta", async () => {
    const body = {
      csrf: "csrf-token",
      profileId: "profile-1",
      items: [{
        key: "inflationPct",
        value: 2.6,
        reason: "operator adjustment",
      }],
    };
    replaceRouteAssumptionsOverridesMock.mockResolvedValue({
      profileId: "profile-1",
      items: body.items,
    });

    const putResponse = await overridesPUT(buildJsonRequest({
      method: "PUT",
      body,
    }));
    const putPayload = (await putResponse.json()) as {
      ok?: boolean;
      message?: string;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(putResponse.status).toBe(200);
    expect(putPayload.ok).toBe(true);
    expect(putPayload.message).toContain("저장했습니다");
    expect(putPayload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });

    const postResponse = await overridesPOST(buildJsonRequest({
      method: "POST",
      body,
    }));
    const postPayload = (await postResponse.json()) as { ok?: boolean; meta?: unknown };

    expect(postResponse.status).toBe(200);
    expect(postPayload.ok).toBe(true);
    expect(postPayload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(replaceRouteAssumptionsOverridesMock).toHaveBeenCalledTimes(2);
    expect(replaceRouteAssumptionsOverridesMock).toHaveBeenNthCalledWith(1, body);
    expect(replaceRouteAssumptionsOverridesMock).toHaveBeenNthCalledWith(2, body);
  });

  it("returns patch response with current planning user meta", async () => {
    const body = {
      csrf: "csrf-token",
      profileId: "profile-1",
      key: "inflationPct",
      value: 2.6,
      reason: "operator adjustment",
    };
    patchRouteAssumptionsOverridesMock.mockResolvedValue({
      profileId: "profile-1",
      items: [{
        key: "inflationPct",
        value: 2.6,
        reason: "operator adjustment",
      }],
    });

    const response = await overridesPATCH(buildJsonRequest({
      method: "PATCH",
      body,
    }));
    const payload = (await response.json()) as {
      ok?: boolean;
      message?: string;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.message).toContain("업데이트했습니다");
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(patchRouteAssumptionsOverridesMock).toHaveBeenCalledWith(body);
  });

  it("returns DELETE and reset endpoint responses with current planning user meta", async () => {
    const body = {
      csrf: "csrf-token",
      profileId: "profile-1",
    };
    resetRouteAssumptionsOverridesMock.mockResolvedValue({
      profileId: "profile-1",
    });

    const deleteResponse = await overridesDELETE(buildJsonRequest({
      method: "DELETE",
      body,
    }));
    const deletePayload = (await deleteResponse.json()) as {
      ok?: boolean;
      items?: unknown[];
      message?: string;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.items).toEqual([]);
    expect(deletePayload.message).toContain("초기화했습니다");
    expect(deletePayload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });

    const resetResponse = await overridesResetPOST(buildJsonRequest({
      method: "POST",
      path: "/api/ops/assumptions/overrides/reset",
      body,
    }));
    const resetPayload = (await resetResponse.json()) as { ok?: boolean; items?: unknown[]; meta?: unknown };

    expect(resetResponse.status).toBe(200);
    expect(resetPayload.ok).toBe(true);
    expect(resetPayload.items).toEqual([]);
    expect(resetPayload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(resetRouteAssumptionsOverridesMock).toHaveBeenCalledTimes(2);
    expect(resetRouteAssumptionsOverridesMock).toHaveBeenNthCalledWith(1, "profile-1");
    expect(resetRouteAssumptionsOverridesMock).toHaveBeenNthCalledWith(2, "profile-1");
  });

  it("blocks overrides reads without planning auth signal before service calls", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await overridesGET(buildGetRequest("profile-1"));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
    expectNoServiceCalls();
  });

  it("blocks override mutations without planning auth signal before service calls", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const replaceBody = {
      csrf: "csrf-token",
      profileId: "profile-1",
      items: [],
    };
    const patchBody = {
      csrf: "csrf-token",
      profileId: "profile-1",
      key: "inflationPct",
      value: 2.6,
    };
    const resetBody = {
      csrf: "csrf-token",
      profileId: "profile-1",
    };
    const mutationAttempts = [
      () => overridesPUT(buildJsonRequest({ method: "PUT", body: replaceBody })),
      () => overridesPOST(buildJsonRequest({ method: "POST", body: replaceBody })),
      () => overridesPATCH(buildJsonRequest({ method: "PATCH", body: patchBody })),
      () => overridesDELETE(buildJsonRequest({ method: "DELETE", body: resetBody })),
      () => overridesResetPOST(buildJsonRequest({
        method: "POST",
        path: "/api/ops/assumptions/overrides/reset",
        body: resetBody,
      })),
    ];

    for (const attempt of mutationAttempts) {
      const response = await attempt();
      const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

      expect(response.status).toBe(401);
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("UNAUTHENTICATED");
      expectNoServiceCalls();
    }
  });

  it("redacts secret-like override service errors before returning them", async () => {
    patchRouteAssumptionsOverridesMock.mockRejectedValue(new Error("process.env.SECRET_TOKEN=bad"));

    const response = await overridesPATCH(buildJsonRequest({
      method: "PATCH",
      body: {
        csrf: "csrf-token",
        profileId: "profile-1",
        key: "inflationPct",
        value: 2.6,
      },
    }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).not.toContain("process.env");
    expect(payload.error?.message).not.toContain("SECRET_TOKEN");
    expect(payload.error?.message).not.toContain("bad");
  });
});

afterAll(() => {
  if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
  else delete env.NODE_ENV;
  if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
  else delete env.PLANNING_AUTH_REQUIRED;
  if (typeof originalTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalTrustAuthHeaders;
  else delete env.PLANNING_TRUST_AUTH_HEADERS;
  if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
  else delete env.AUTH_SECRET;
  if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
  else delete env.NEXTAUTH_SECRET;
  if (typeof originalNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalNamespaceEnabled;
  else delete env.PLANNING_NAMESPACE_ENABLED;
  if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
  else delete env.PLANNING_USER_ID;
});
