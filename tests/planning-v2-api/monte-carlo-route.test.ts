import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const {
  loadLatestAssumptionsSnapshotMock,
  loadAssumptionsSnapshotByIdMock,
  findAssumptionsSnapshotIdMock,
  recordMonteCarloBudgetRejectionMock,
} = vi.hoisted(() => ({
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  loadAssumptionsSnapshotByIdMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
  recordMonteCarloBudgetRejectionMock: vi.fn(),
}));

vi.mock("../../src/lib/planning/assumptions/storage", () => ({
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  loadAssumptionsSnapshotById: (...args: unknown[]) => loadAssumptionsSnapshotByIdMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
}));

vi.mock("../../src/lib/planning/server/v2/monteCarloAuditRouteService", () => ({
  recordMonteCarloBudgetRejection: (...args: unknown[]) => recordMonteCarloBudgetRejectionMock(...args),
}));

import { POST } from "../../src/app/api/planning/v2/monte-carlo/route";

installPlanningAuthRequiredFalseForTest();

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/monte-carlo", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function baseProfile() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    debts: [],
    goals: [
      { id: "goal-ret", name: "Retirement", targetAmount: 18_000_000, targetMonth: 72, priority: 4 },
      { id: "goal-home", name: "Home", targetAmount: 12_000_000, targetMonth: 36, priority: 3 },
    ],
    risk: { riskTolerance: "mid" },
  };
}

describe("POST /api/planning/v2/monte-carlo", () => {
  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    recordMonteCarloBudgetRejectionMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
  });

  it("uses defaults when snapshot is missing", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 60,
      monteCarlo: { paths: 60, seed: 1 },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: { snapshot?: { missing?: boolean } };
      data?: {
        baseAssumptionsUsed?: { inflationPct?: number; investReturnPct?: number };
        monteCarlo?: { meta?: { paths?: number; seed?: number } };
        engineSchemaVersion?: number;
        engine?: { stage?: string };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.snapshot?.missing).toBe(true);
    expect(payload.data?.baseAssumptionsUsed?.inflationPct).toBe(2);
    expect(payload.data?.baseAssumptionsUsed?.investReturnPct).toBe(5);
    expect(payload.data?.monteCarlo?.meta?.paths).toBe(60);
    expect(payload.data?.monteCarlo?.meta?.seed).toBe(1);
    expect(payload.data?.engineSchemaVersion).toBe(1);
    expect(payload.data?.engine?.stage).toBeTruthy();
  });

  it("injects snapshot and prioritizes override assumptions", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue({
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T12:00:00.000Z",
      korea: {
        cpiYoYPct: 2.4,
        newDepositAvgPct: 2.8,
      },
      sources: [],
      warnings: [],
    });

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 60,
      assumptions: {
        inflation: 1.1,
        expectedReturn: 7.2,
        cashReturnPct: 3.1,
      },
      monteCarlo: { paths: 80, seed: 9 },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        baseAssumptionsUsed?: {
          inflationPct?: number;
          investReturnPct?: number;
          cashReturnPct?: number;
          withdrawalRatePct?: number;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.baseAssumptionsUsed).toEqual({
      inflationPct: 1.1,
      investReturnPct: 7.2,
      cashReturnPct: 3.1,
      withdrawalRatePct: 4,
      debtRates: {},
    });
  });

  it("returns INPUT error when paths exceed max cap", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 60,
      monteCarlo: { paths: 20001, seed: 1 },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; issues?: string[] };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.issues?.some((issue) => issue.includes("monteCarlo.paths"))).toBe(true);
  });

  it("returns BUDGET_EXCEEDED when work units exceed budget", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 600,
      monteCarlo: { paths: 15000, seed: 1 },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      meta?: { budget?: { workUnits?: number } };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("BUDGET_EXCEEDED");
    expect(Number(payload.meta?.budget?.workUnits ?? 0)).toBeGreaterThan(8_000_000);
    expect(recordMonteCarloBudgetRejectionMock).toHaveBeenCalledTimes(1);
    expect(recordMonteCarloBudgetRejectionMock.mock.calls[0]?.[0]).toMatchObject({
      ok: false,
      code: "BUDGET_EXCEEDED",
      data: {
        paths: 15000,
        horizonMonths: 600,
      },
    });
  });

  it("keeps monte carlo audit writes behind the route service boundary", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v2/monte-carlo/route.ts"),
      "utf8",
    );
    const serviceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/v2/monteCarloAuditRouteService.ts"),
      "utf8",
    );

    expect(routeSource).toContain("/planning/server/v2/monteCarloAuditRouteService");
    expect(routeSource).not.toContain("auditLogStore");
    expect(routeSource).not.toContain("appendAuditLog");
    expect(serviceSource).toContain("auditLogStore");
    expect(serviceSource).toContain("appendAuditLog");
    expect(serviceSource).toContain("catch");
  });
});
