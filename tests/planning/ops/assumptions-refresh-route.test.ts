import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendAuditMock,
  appendOpsAuditEventMock,
  appendOpsMetricEventMock,
  buildAssumptionsSnapshotMock,
} = vi.hoisted(() => ({
  appendAuditMock: vi.fn(),
  appendOpsAuditEventMock: vi.fn(),
  appendOpsMetricEventMock: vi.fn(),
  buildAssumptionsSnapshotMock: vi.fn(),
}));

vi.mock("../../../src/lib/audit/auditLogStore", () => ({
  append: (...args: unknown[]) => appendAuditMock(...args),
}));

vi.mock("../../../src/lib/ops/securityAuditLog", () => ({
  appendOpsAuditEvent: (...args: unknown[]) => appendOpsAuditEventMock(...args),
}));

vi.mock("../../../src/lib/ops/metrics/metricsStore", () => ({
  appendEvent: (...args: unknown[]) => appendOpsMetricEventMock(...args),
}));

vi.mock("../../../src/lib/planning/assumptions/sync", () => ({
  buildAssumptionsSnapshot: (...args: unknown[]) => buildAssumptionsSnapshotMock(...args),
}));

import { POST as refreshPOST } from "../../../src/app/api/ops/assumptions/refresh/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningUserId = process.env.PLANNING_USER_ID;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function localHeaders(csrf = "csrf-token", extra?: HeadersInit): HeadersInit {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/ops/assumptions`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
    ...(extra ?? {}),
  };
}

function refreshRequest(input?: {
  csrf?: string;
  headers?: HeadersInit;
}): Request {
  const csrf = input?.csrf ?? "csrf-token";
  return new Request(`${LOCAL_ORIGIN}/api/ops/assumptions/refresh`, {
    method: "POST",
    headers: input?.headers ?? localHeaders(csrf),
    body: JSON.stringify({ csrf }),
  });
}

function restoreEnv(): void {
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
}

describe.sequential("ops assumptions refresh route", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.PLANNING_TRUST_AUTH_HEADERS;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_USER_ID;
    appendAuditMock.mockReset();
    appendOpsAuditEventMock.mockReset();
    appendOpsAuditEventMock.mockResolvedValue(undefined);
    appendOpsMetricEventMock.mockReset();
    appendOpsMetricEventMock.mockResolvedValue(undefined);
    buildAssumptionsSnapshotMock.mockReset();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("refreshes a snapshot and returns the existing payload with current user meta", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        baseRatePct: 2.5,
      },
      sources: [
        { name: "ECOS", url: "https://example.com/ecos", fetchedAt: "2026-02-28T00:00:00.000Z" },
      ],
      warnings: ["ECOS_FALLBACK_USED"],
    };
    buildAssumptionsSnapshotMock.mockResolvedValue({
      snapshot,
      snapshotId: "2026-02-28_2026-02-28-00-00-00",
    });

    const response = await refreshPOST(refreshRequest());
    const payload = await response.json() as {
      ok?: boolean;
      latestId?: string;
      message?: string;
      meta?: { userId?: string; authSource?: string };
      snapshot?: {
        id?: string;
        asOf?: string;
        fetchedAt?: string;
        warningsCount?: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.latestId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(payload.message).toContain("경고");
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(payload.snapshot).toEqual({
      id: "2026-02-28_2026-02-28-00-00-00",
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      warningsCount: 1,
    });

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0]?.[0]).toMatchObject({
      event: "ASSUMPTIONS_REFRESH",
      route: "/api/ops/assumptions/refresh",
      details: {
        result: "SUCCESS",
        latestId: "2026-02-28_2026-02-28-00-00-00",
        planningUserId: "default",
        authSource: "local-namespace",
      },
    });
    expect(appendOpsAuditEventMock).toHaveBeenCalledWith({
      eventType: "OPS_ASSUMPTIONS_REFRESH_SUCCESS",
      meta: {
        latestId: "2026-02-28_2026-02-28-00-00-00",
        warningsCount: 1,
        planningUserId: "default",
        authSource: "local-namespace",
      },
    });
    expect(appendOpsMetricEventMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "ASSUMPTIONS_REFRESH",
      status: "SUCCESS",
    }));
  });

  it("blocks refresh without a planning auth signal when fallback is not explicit", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await refreshPOST(refreshRequest());
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
    expect(buildAssumptionsSnapshotMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("uses trusted header user meta when trusted headers are explicitly enabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "1";
    buildAssumptionsSnapshotMock.mockResolvedValue({
      snapshot: {
        version: 1,
        asOf: "2026-03-01",
        fetchedAt: "2026-03-01T00:00:00.000Z",
        korea: {},
        sources: [],
        warnings: [],
      },
      snapshotId: "2026-03-01_2026-03-01-00-00-00",
    });

    const response = await refreshPOST(refreshRequest({
      headers: localHeaders("csrf-token", {
        "x-planning-user-id": "alice",
      }),
    }));
    const payload = await response.json() as {
      meta?: { userId?: string; authSource?: string; planningNamespaceEnabled?: boolean };
    };

    expect(response.status).toBe(200);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
    expect(appendOpsAuditEventMock).toHaveBeenCalledWith({
      eventType: "OPS_ASSUMPTIONS_REFRESH_SUCCESS",
      meta: {
        latestId: "2026-03-01_2026-03-01-00-00-00",
        warningsCount: 0,
        planningUserId: "alice",
        authSource: "trusted-header",
        planningNamespaceEnabled: true,
      },
    });
  });

  it("returns redacted service errors through the ops error contract", async () => {
    buildAssumptionsSnapshotMock.mockRejectedValue(new Error("process.env.SECRET_TOKEN=bad"));

    const response = await refreshPOST(refreshRequest());
    const payload = await response.json() as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(payload.error?.code).toBe("INTERNAL");
    expect(payload.error?.message).not.toContain("process.env");
    expect(payload.error?.message).not.toContain("SECRET_TOKEN");
    expect(appendOpsMetricEventMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "ASSUMPTIONS_REFRESH",
      status: "FAILED",
      errorCode: "INTERNAL",
    }));
  });
});
