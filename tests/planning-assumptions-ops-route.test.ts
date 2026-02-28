import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadLatestAssumptionsSnapshotMock,
  findAssumptionsSnapshotIdMock,
  buildAssumptionsSnapshotMock,
  appendAuditMock,
} = vi.hoisted(() => ({
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
  buildAssumptionsSnapshotMock: vi.fn(),
  appendAuditMock: vi.fn(),
}));

vi.mock("../src/lib/planning/assumptions/storage", () => ({
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
}));

vi.mock("../src/lib/planning/assumptions/sync", () => ({
  buildAssumptionsSnapshot: (...args: unknown[]) => buildAssumptionsSnapshotMock(...args),
}));

vi.mock("../src/lib/audit/auditLogStore", () => ({
  append: (...args: unknown[]) => appendAuditMock(...args),
}));

import { GET as latestGET } from "../src/app/api/ops/assumptions/latest/route";
import { POST as syncPOST } from "../src/app/api/ops/assumptions/sync/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

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
    loadLatestAssumptionsSnapshotMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
    buildAssumptionsSnapshotMock.mockReset();
    appendAuditMock.mockReset();
  });

  it("returns ok:false when latest snapshot does not exist", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await latestGET(buildGetRequest());
    const payload = (await response.json()) as { ok?: boolean; message?: string };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain("없습니다");
    expect(loadLatestAssumptionsSnapshotMock).toHaveBeenCalledTimes(1);
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
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.snapshotSummary?.snapshotId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(payload.snapshotSummary?.asOf).toBe("2026-02-28");
    expect(payload.snapshotSummary?.warningsCount).toBe(1);
    expect(payload.snapshotSummary?.sourcesCount).toBe(2);

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
        };
      },
    ];
    expect(auditInput.event).toBe("ASSUMPTIONS_SYNC");
    expect(auditInput.details?.result).toBe("SUCCESS");
    expect(auditInput.details?.snapshotId).toBe("2026-02-28_2026-02-28-00-00-00");
    expect(auditInput.details?.asOf).toBe("2026-02-28");
    expect(auditInput.details?.warningsCount).toBe(1);
    expect(auditInput.details?.sourcesCount).toBe(2);
  });

  it("returns ok:false on sync error and appends ERROR audit", async () => {
    buildAssumptionsSnapshotMock.mockRejectedValue(new Error("fetch failed"));

    const response = await syncPOST(buildPostRequest());
    const payload = (await response.json()) as { ok?: boolean; message?: string };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain("fetch failed");

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
});

afterAll(() => {
  if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
  else delete env.NODE_ENV;
});
