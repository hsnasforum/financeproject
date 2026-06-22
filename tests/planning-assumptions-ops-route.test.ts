import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadLatestAssumptionsSnapshotMock,
  findAssumptionsSnapshotIdMock,
  listAssumptionsHistoryMock,
  loadAssumptionsSnapshotByIdMock,
  buildAssumptionsSnapshotMock,
  appendAuditMock,
} = vi.hoisted(() => ({
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
  listAssumptionsHistoryMock: vi.fn(),
  loadAssumptionsSnapshotByIdMock: vi.fn(),
  buildAssumptionsSnapshotMock: vi.fn(),
  appendAuditMock: vi.fn(),
}));

vi.mock("../src/lib/planning/assumptions/storage", () => ({
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
  listAssumptionsHistory: (...args: unknown[]) => listAssumptionsHistoryMock(...args),
  loadAssumptionsSnapshotById: (...args: unknown[]) => loadAssumptionsSnapshotByIdMock(...args),
}));

vi.mock("../src/lib/planning/assumptions/sync", () => ({
  buildAssumptionsSnapshot: (...args: unknown[]) => buildAssumptionsSnapshotMock(...args),
}));

vi.mock("../src/lib/audit/auditLogStore", () => ({
  append: (...args: unknown[]) => appendAuditMock(...args),
}));

import { GET as latestGET } from "../src/app/api/ops/assumptions/latest/route";
import { GET as historyGET } from "../src/app/api/ops/assumptions/history/route";
import { GET as historyDetailGET } from "../src/app/api/ops/assumptions/history/[id]/route";
import { POST as syncPOST } from "../src/app/api/ops/assumptions/sync/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningUserId = process.env.PLANNING_USER_ID;

function buildGetRequest(csrf = "csrf-token"): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  return new Request(`${origin}/api/ops/assumptions/latest?csrf=${encodeURIComponent(csrf)}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    },
  });
}

function buildHistoryRequest(input: { csrf?: string; limit?: string } = {}): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const csrf = input.csrf ?? "csrf-token";
  const limit = input.limit ?? "30";
  return new Request(
    `${origin}/api/ops/assumptions/history?csrf=${encodeURIComponent(csrf)}&limit=${encodeURIComponent(limit)}`,
    {
      method: "GET",
      headers: {
        host,
        origin,
        referer: `${origin}/ops/assumptions`,
        cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
      },
    },
  );
}

function buildHistoryDetailRequest(id = "snapshot-1", csrf = "csrf-token"): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  return new Request(`${origin}/api/ops/assumptions/history/${encodeURIComponent(id)}?csrf=${encodeURIComponent(csrf)}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    },
  });
}

function buildPostRequest(csrf = "csrf-token"): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  return new Request(`${origin}/api/ops/assumptions/sync`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ csrf }),
  });
}

describe("ops assumptions routes", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.PLANNING_TRUST_AUTH_HEADERS;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_USER_ID;
    loadLatestAssumptionsSnapshotMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
    listAssumptionsHistoryMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    buildAssumptionsSnapshotMock.mockReset();
    appendAuditMock.mockReset();
  });

  it("returns ok:false when latest snapshot does not exist", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await latestGET(buildGetRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string; fixHref?: string } };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("STALE_ASSUMPTIONS");
    expect(payload.error?.message).toContain("없습니다");
    expect(payload.error?.fixHref).toBe("/ops/assumptions");
    expect(loadLatestAssumptionsSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("returns latest snapshot with current planning user meta", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        policyRatePct: 2.5,
        baseRatePct: 2.5,
        cpiYoYPct: 2,
        coreCpiYoYPct: 2,
        newDepositAvgPct: 2.78,
        newLoanAvgPct: 4.24,
      },
      sources: [
        { name: "BOK", url: "https://example.com/bok", fetchedAt: "2026-02-28T00:00:00.000Z" },
      ],
      warnings: [],
    };
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(snapshot);
    findAssumptionsSnapshotIdMock.mockResolvedValue("2026-02-28_2026-02-28-00-00-00");

    const response = await latestGET(buildGetRequest());
    const payload = (await response.json()) as {
      ok?: boolean;
      snapshot?: unknown;
      snapshotId?: string;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.snapshot).toEqual(snapshot);
    expect(payload.snapshotId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(loadLatestAssumptionsSnapshotMock).toHaveBeenCalledTimes(1);
    expect(findAssumptionsSnapshotIdMock).toHaveBeenCalledWith(snapshot);
  });

  it("blocks latest snapshot reads without a planning auth signal when fallback is not explicit", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await latestGET(buildGetRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
    expect(loadLatestAssumptionsSnapshotMock).not.toHaveBeenCalled();
    expect(findAssumptionsSnapshotIdMock).not.toHaveBeenCalled();
  });

  it("returns history list with current planning user meta", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        policyRatePct: 2.5,
        baseRatePct: 2.5,
        cpiYoYPct: 2,
        coreCpiYoYPct: 2,
        newDepositAvgPct: 2.78,
        newLoanAvgPct: 4.24,
      },
      sources: [
        { name: "BOK", url: "https://example.com/bok", fetchedAt: "2026-02-28T00:00:00.000Z" },
        { name: "KOSIS", url: "https://example.com/kosis", fetchedAt: "2026-02-28T00:00:00.000Z" },
      ],
      warnings: ["warning 1"],
    };
    listAssumptionsHistoryMock.mockResolvedValue([
      { id: "snapshot-1", asOf: "2026-02-28", fetchedAt: "2026-02-28T00:00:00.000Z" },
      { id: "missing", asOf: "2026-02-27", fetchedAt: "2026-02-27T00:00:00.000Z" },
    ]);
    loadAssumptionsSnapshotByIdMock.mockImplementation(async (id: string) => {
      if (id === "snapshot-1") return snapshot;
      return null;
    });

    const response = await historyGET(buildHistoryRequest({ limit: "40" }));
    const payload = (await response.json()) as {
      ok?: boolean;
      items?: Array<{
        id?: string;
        asOf?: string;
        fetchedAt?: string;
        warningsCount?: number;
        sourcesCount?: number;
        korea?: unknown;
      }>;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.items).toEqual([
      {
        id: "snapshot-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        warningsCount: 1,
        sourcesCount: 2,
        korea: snapshot.korea,
      },
    ]);
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(listAssumptionsHistoryMock).toHaveBeenCalledWith(40);
    expect(loadAssumptionsSnapshotByIdMock).toHaveBeenCalledWith("snapshot-1");
    expect(loadAssumptionsSnapshotByIdMock).toHaveBeenCalledWith("missing");
  });

  it("blocks history list without a planning auth signal when fallback is not explicit", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await historyGET(buildHistoryRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
    expect(listAssumptionsHistoryMock).not.toHaveBeenCalled();
    expect(loadAssumptionsSnapshotByIdMock).not.toHaveBeenCalled();
  });

  it("returns history detail with current planning user meta", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        baseRatePct: 2.5,
      },
      sources: [],
      warnings: [],
    };
    loadAssumptionsSnapshotByIdMock.mockResolvedValue(snapshot);

    const response = await historyDetailGET(buildHistoryDetailRequest("snapshot-1"), {
      params: Promise.resolve({ id: "snapshot-1" }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      snapshotId?: string;
      snapshot?: unknown;
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.snapshotId).toBe("snapshot-1");
    expect(payload.snapshot).toEqual(snapshot);
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(loadAssumptionsSnapshotByIdMock).toHaveBeenCalledWith("snapshot-1");
  });

  it("returns not found when history detail snapshot is missing", async () => {
    loadAssumptionsSnapshotByIdMock.mockResolvedValue(null);

    const response = await historyDetailGET(buildHistoryDetailRequest("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(404);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("STALE_ASSUMPTIONS");
    expect(payload.error?.message).toContain("찾을 수 없습니다");
    expect(loadAssumptionsSnapshotByIdMock).toHaveBeenCalledWith("missing");
  });

  it("redacts secret-like history storage errors before returning them", async () => {
    listAssumptionsHistoryMock.mockRejectedValue(new Error("process.env.SECRET_TOKEN=bad"));

    const response = await historyGET(buildHistoryRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("STORAGE_CORRUPT");
    expect(payload.error?.message).not.toContain("process.env");
    expect(payload.error?.message).not.toContain("SECRET_TOKEN");
    expect(payload.error?.message).not.toContain("bad");
  });

  it("redacts secret-like latest lookup errors before returning them", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        baseRatePct: 2.5,
      },
      sources: [],
      warnings: [],
    };
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(snapshot);
    findAssumptionsSnapshotIdMock.mockRejectedValue(new Error("process.env.SECRET_TOKEN=bad"));

    const response = await latestGET(buildGetRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("STORAGE_CORRUPT");
    expect(payload.error?.message).not.toContain("process.env");
    expect(payload.error?.message).not.toContain("SECRET_TOKEN");
    expect(payload.error?.message).not.toContain("bad");
  });

  it("syncs snapshot successfully and appends SUCCESS audit", async () => {
    const snapshot = {
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T00:00:00.000Z",
      korea: {
        baseRatePct: 2.5,
        cpiYoYPct: 2,
        coreCpiYoYPct: 2,
        newDepositAvgPct: 2.78,
        newLoanAvgPct: 4.24,
      },
      sources: [
        { name: "BOK MPC English", url: "https://example.com/mpc", fetchedAt: "2026-02-28T00:00:00.000Z" },
        { name: "BOK Interest Rates English", url: "https://example.com/rates", fetchedAt: "2026-02-28T00:00:00.000Z" },
      ],
      warnings: ["warning 1"],
    };

    buildAssumptionsSnapshotMock.mockResolvedValue({ snapshot, snapshotId: "2026-02-28_2026-02-28-00-00-00" });

    const response = await syncPOST(buildPostRequest());
    const payload = (await response.json()) as {
      ok?: boolean;
      message?: string;
      snapshotSummary?: {
        snapshotId?: string;
        asOf?: string;
        warningsCount?: number;
        sourcesCount?: number;
      };
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.snapshotSummary?.snapshotId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(payload.snapshotSummary?.asOf).toBe("2026-02-28");
    expect(payload.snapshotSummary?.warningsCount).toBe(1);
    expect(payload.snapshotSummary?.sourcesCount).toBe(2);
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const [auditInput] = appendAuditMock.mock.calls[0] as [
      {
        event?: string;
        details?: {
          result?: string;
          snapshotId?: string;
          asOf?: string;
          warningsCount?: number;
          sourcesCount?: number;
          planningUserId?: string;
          authSource?: string;
        };
      },
    ];
    expect(auditInput.event).toBe("ASSUMPTIONS_SYNC");
    expect(auditInput.details?.result).toBe("SUCCESS");
    expect(auditInput.details?.snapshotId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(auditInput.details?.asOf).toBe("2026-02-28");
    expect(auditInput.details?.warningsCount).toBe(1);
    expect(auditInput.details?.sourcesCount).toBe(2);
    expect(auditInput.details?.planningUserId).toBe("default");
    expect(auditInput.details?.authSource).toBe("local-namespace");
  });

  it("blocks sync without a planning auth signal when fallback is not explicit", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await syncPOST(buildPostRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
    expect(buildAssumptionsSnapshotMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("returns ok:false on sync error and appends ERROR audit", async () => {
    buildAssumptionsSnapshotMock.mockRejectedValue(new Error("fetch failed"));

    const response = await syncPOST(buildPostRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INTERNAL");
    expect(payload.error?.message).toContain("fetch failed");

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const [auditInput] = appendAuditMock.mock.calls[0] as [
      {
        event?: string;
        details?: {
          result?: string;
          asOf?: string | null;
          warningsCount?: number | null;
          sourcesCount?: number | null;
        };
      },
    ];
    expect(auditInput.event).toBe("ASSUMPTIONS_SYNC");
    expect(auditInput.details?.result).toBe("ERROR");
    expect(auditInput.details?.asOf).toBeNull();
    expect(auditInput.details?.warningsCount).toBeNull();
    expect(auditInput.details?.sourcesCount).toBeNull();
  });

  it("redacts secret-like sync errors before returning and auditing them", async () => {
    buildAssumptionsSnapshotMock.mockRejectedValue(new Error("process.env.SECRET_TOKEN=bad"));

    const response = await syncPOST(buildPostRequest());
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INTERNAL");
    expect(payload.error?.message).not.toContain("process.env");
    expect(payload.error?.message).not.toContain("SECRET_TOKEN");
    expect(payload.error?.message).not.toContain("bad");
    const [auditInput] = appendAuditMock.mock.calls[0] as [
      {
        details?: {
          message?: string;
        };
      },
    ];
    expect(auditInput.details?.message).not.toContain("process.env");
    expect(auditInput.details?.message).not.toContain("SECRET_TOKEN");
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
