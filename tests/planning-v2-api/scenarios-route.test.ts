import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../../src/app/api/planning/v2/scenarios/route";

function request(body: unknown, query = ""): Request {
  return new Request(`http://localhost:3000/api/planning/v2/scenarios${query}`, {
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

function baseProfileWithRisk(riskTolerance: "low" | "mid" | "high") {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_550_000,
    monthlyDiscretionaryExpenses: 620_000,
    liquidAssets: 900_000,
    investmentAssets: 1_800_000,
    debts: [],
    goals: [
      {
        id: "goal-a",
        name: "Goal A",
        targetAmount: 3_000_000,
        targetMonth: 12,
        priority: 3,
      },
    ],
    risk: {
      riskTolerance,
    },
  };
}

describe("POST /api/planning/v2/scenarios", () => {
  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
  });

  it("uses defaults when snapshot is missing", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfileWithRisk("mid"),
      horizonMonths: 12,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: { snapshot?: { missing?: boolean } };
      data?: {
        engineSchemaVersion?: number;
        engine?: {
          stage?: string;
          financialStatus?: { stage?: string };
          stageDecision?: { priority?: string };
        };
        base?: { assumptionsUsed?: { inflationPct?: number; investReturnPct?: number }; keyTimelinePoints?: Array<{ monthIndex: number }> };
        scenarios?: Array<{ id?: string; diffVsBase?: unknown; timeline?: unknown }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.snapshot?.missing).toBe(true);
    expect(payload.data?.engineSchemaVersion).toBe(1);
    expect(payload.data?.engine?.stage).toBeDefined();
    expect(payload.data?.engine?.financialStatus?.stage).toBe(payload.data?.engine?.stage);
    expect(typeof payload.data?.engine?.stageDecision?.priority).toBe("string");
    const data = payload.data as Record<string, unknown> | undefined;
    expect(data?.stage).toBeUndefined();
    expect(data?.financialStatus).toBeUndefined();
    expect(data?.stageDecision).toBeUndefined();
    expect(payload.data?.base?.assumptionsUsed?.inflationPct).toBe(2);
    expect(payload.data?.base?.assumptionsUsed?.investReturnPct).toBe(5);
    expect(payload.data?.base?.keyTimelinePoints?.[0]?.monthIndex).toBe(0);
    expect(payload.data?.scenarios?.length).toBe(2);
    expect(payload.data?.scenarios?.every((entry) => Boolean(entry.diffVsBase))).toBe(true);
    expect(payload.data?.scenarios?.every((entry) => entry.timeline === undefined)).toBe(true);
  });

  it("injects snapshot values when snapshot exists and no override", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue({
      version: 1,
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T12:00:00.000Z",
      korea: {
        cpiYoYPct: 2.4,
        newDepositAvgPct: 2.8,
      },
      sources: [
        { name: "source-a", url: "https://example.com/a", fetchedAt: "2026-02-28T12:00:00.000Z" },
      ],
      warnings: ["warn-a"],
    });

    const response = await POST(request({
      profile: baseProfileWithRisk("high"),
      horizonMonths: 18,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        base?: { assumptionsUsed?: { inflationPct?: number; investReturnPct?: number; cashReturnPct?: number } };
        scenarios?: Array<{ id?: string; assumptionsUsed?: { investReturnPct?: number } }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.base?.assumptionsUsed?.inflationPct).toBe(2.4);
    expect(payload.data?.base?.assumptionsUsed?.investReturnPct).toBe(5);
    expect(payload.data?.base?.assumptionsUsed?.cashReturnPct).toBe(2.8);

    const aggressive = payload.data?.scenarios?.find((entry) => entry.id === "aggressive");
    expect(aggressive?.assumptionsUsed?.investReturnPct).toBe(7);
  });

  it("prioritizes overrides over snapshot mapped values", async () => {
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
      profile: baseProfileWithRisk("low"),
      horizonMonths: 10,
      assumptions: {
        inflation: 1.1,
        expectedReturn: 7.2,
        cashReturnPct: 3.1,
      },
    }, "?full=1"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        base?: {
          assumptionsUsed?: { inflationPct?: number; investReturnPct?: number; cashReturnPct?: number };
          timeline?: Array<{ month: number }>;
        };
        scenarios?: Array<{ id?: string; assumptionsUsed?: { investReturnPct?: number } }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.base?.assumptionsUsed).toEqual({
      inflationPct: 1.1,
      investReturnPct: 7.2,
      cashReturnPct: 3.1,
      withdrawalRatePct: 4,
      debtRates: {},
    });
    expect(Array.isArray(payload.data?.base?.timeline)).toBe(true);

    const conservative = payload.data?.scenarios?.find((entry) => entry.id === "conservative");
    expect(conservative?.assumptionsUsed?.investReturnPct).toBe(5.2);
  });
});
