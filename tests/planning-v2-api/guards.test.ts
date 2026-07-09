import { beforeEach, describe, expect, it, vi } from "vitest";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const {
  loadLatestAssumptionsSnapshotMock,
  loadAssumptionsSnapshotByIdMock,
  findAssumptionsSnapshotIdMock,
} = vi.hoisted(() => ({
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  loadAssumptionsSnapshotByIdMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
}));

vi.mock("../../src/lib/planning/assumptions/storage", () => ({
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  loadAssumptionsSnapshotById: (...args: unknown[]) => loadAssumptionsSnapshotByIdMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
}));

import { POST as simulatePOST } from "../../src/app/api/planning/v2/simulate/route";

installPlanningAuthRequiredFalseForTest();

function baseProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 800_000,
    investmentAssets: 2_000_000,
    debts: [],
    goals: [],
  };
}

function requestWithHost(
  host: string,
  origin: string,
  body: Record<string, unknown> = {},
  cookie?: string,
): Request {
  return new Request(`${origin}/api/planning/v2/simulate`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      profile: baseProfile(),
      horizonMonths: 12,
      ...body,
    }),
  });
}

describe("planning v2 route guards", () => {
  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
  });

  it("allows same-origin remote host request for simulate route", async () => {
    const response = await simulatePOST(requestWithHost("example.com", "http://example.com"));
    const payload = await response.json() as {
      ok?: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });

  it("passes local host request for simulate route", async () => {
    const response = await simulatePOST(requestWithHost("localhost:3000", "http://localhost:3000"));
    const payload = await response.json() as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });

  it("requires body csrf when a csrf cookie is present", async () => {
    const response = await simulatePOST(
      requestWithHost("localhost:3000", "http://localhost:3000", {}, "dev_csrf=test-token"),
    );
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });
});
