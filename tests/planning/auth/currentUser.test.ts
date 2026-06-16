import { afterEach, describe, expect, it } from "vitest";
import {
  PlanningAuthError,
  requireCurrentPlanningUser,
  withCurrentPlanningUser,
} from "../../../src/lib/planning/auth/currentUser";
import { resolvePlanningUserId } from "../../../src/lib/planning/store/namespace";

const env = process.env as Record<string, string | undefined>;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

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

describe("planning current user", () => {
  afterEach(() => {
    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
  });

  it("uses the local namespace without touching Auth.js when auth is optional and no secret is configured", async () => {
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
});
