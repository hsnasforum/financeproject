import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../../src/app/api/planning/v2/simulate/route";

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/simulate", {
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
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 800_000,
    investmentAssets: 2_000_000,
    debts: [],
    goals: [],
  };
}

describe("POST /api/planning/v2/simulate", () => {
  const originalPlanningCacheDir = process.env.PLANNING_CACHE_DIR;
  let cacheRoot = "";

  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-cache-"));
    process.env.PLANNING_CACHE_DIR = cacheRoot;
  });

  afterEach(() => {
    if (typeof originalPlanningCacheDir === "string") process.env.PLANNING_CACHE_DIR = originalPlanningCacheDir;
    else delete process.env.PLANNING_CACHE_DIR;
    if (cacheRoot) fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("uses defaults when snapshot is missing and no overrides are provided", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
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
        assumptionsUsed?: {
          annualInflationRate?: number;
          annualExpectedReturnRate?: number;
        };
        timeline?: Array<{ month: number; netWorth: number }>;
        warnings?: Array<{ reasonCode: string }>;
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
    expect(payload.data?.assumptionsUsed?.annualInflationRate).toBeCloseTo(0.02, 8);
    expect(payload.data?.assumptionsUsed?.annualExpectedReturnRate).toBeCloseTo(0.05, 8);
    expect(payload.data?.warnings?.map((warning) => warning.reasonCode) ?? []).toEqual([]);
    expect(loadLatestAssumptionsSnapshotMock).toHaveBeenCalled();

    const timeline = payload.data?.timeline ?? [];
    expect(timeline[0]?.month).toBe(1);
    expect(timeline[timeline.length - 1]?.month).toBe(12);
  });

  it("injects snapshot-mapped assumptions when snapshot exists and no overrides", async () => {
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
      profile: baseProfile(),
      horizonMonths: 6,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: {
        snapshot?: {
          asOf?: string;
          fetchedAt?: string;
          warningsCount?: number;
          sourcesCount?: number;
        };
      };
      data?: {
        assumptionsUsed?: {
          annualInflationRate?: number;
          annualExpectedReturnRate?: number;
        };
        timeline?: Array<{ month: number; netWorth: number }>;
        warnings?: Array<{ reasonCode: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.snapshot).toEqual({
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T12:00:00.000Z",
      missing: false,
      warningsCount: 1,
      sourcesCount: 1,
    });
    expect(payload.data?.assumptionsUsed?.annualInflationRate).toBeCloseTo(0.024, 8);
    expect(payload.data?.assumptionsUsed?.annualExpectedReturnRate).toBeCloseTo(0.05, 8);
    expect(payload.data?.warnings?.map((warning) => warning.reasonCode) ?? []).toEqual([]);

    const timeline = payload.data?.timeline ?? [];
    expect(timeline[0]?.month).toBe(1);
    expect(timeline[timeline.length - 1]?.month).toBe(6);
  });

  it("prioritizes request overrides over snapshot-mapped assumptions", async () => {
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
      horizonMonths: 8,
      assumptions: {
        inflation: 1.1,
        expectedReturn: 7.2,
      },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        assumptionsUsed?: {
          annualInflationRate?: number;
          annualExpectedReturnRate?: number;
        };
        timeline?: Array<{ month: number; netWorth: number }>;
        warnings?: Array<{ reasonCode: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.assumptionsUsed?.annualInflationRate).toBeCloseTo(0.011, 8);
    expect(payload.data?.assumptionsUsed?.annualExpectedReturnRate).toBeCloseTo(0.072, 8);
    expect(payload.data?.warnings?.map((warning) => warning.reasonCode) ?? []).toEqual([]);

    const timeline = payload.data?.timeline ?? [];
    expect(timeline[0]?.month).toBe(1);
    expect(timeline[timeline.length - 1]?.month).toBe(8);
  });

  it("includes health critical warning when snapshot is missing and optimistic override is high", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: {
        ...baseProfile(),
        risk: { riskTolerance: "low" },
      },
      horizonMonths: 12,
      assumptions: {
        investReturnPct: 15,
      },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: {
        health?: {
          criticalCount?: number;
          warningCodes?: string[];
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.health?.criticalCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(payload.meta?.health?.warningCodes ?? []).toContain("OPTIMISTIC_RETURN_HIGH");
  });

  it("returns INPUT error on invalid input", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: {},
      horizonMonths: 12,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; issues?: string[] };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.issues?.length ?? 0).toBeGreaterThan(0);
  });

  it("uses snapshot by snapshotId when provided", async () => {
    loadAssumptionsSnapshotByIdMock.mockResolvedValue({
      version: 1,
      asOf: "2026-01-31",
      fetchedAt: "2026-01-31T09:00:00.000Z",
      korea: {
        cpiYoYPct: 1.8,
      },
      sources: [],
      warnings: [],
    });

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 6,
      snapshotId: "2026-01-31_2026-01-31-09-00-00",
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: { snapshot?: { id?: string; asOf?: string } };
      data?: { assumptionsUsed?: { annualInflationRate?: number } };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.snapshot?.id).toBe("2026-01-31_2026-01-31-09-00-00");
    expect(payload.meta?.snapshot?.asOf).toBe("2026-01-31");
    expect(payload.data?.assumptionsUsed?.annualInflationRate).toBeCloseTo(0.018, 8);
    expect(loadLatestAssumptionsSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns SNAPSHOT_NOT_FOUND when snapshotId is invalid", async () => {
    loadAssumptionsSnapshotByIdMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 12,
      snapshotId: "missing-id",
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("SNAPSHOT_NOT_FOUND");
  });

  it("returns cache miss then cache hit for identical requests", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const body = {
      profile: baseProfile(),
      horizonMonths: 24,
      assumptions: {
        inflation: 2.1,
        expectedReturn: 5.2,
      },
    };

    const first = await POST(request(body));
    const firstPayload = await first.json() as {
      ok?: boolean;
      meta?: { cache?: { hit?: boolean; keyPrefix?: string } };
    };

    const second = await POST(request(body));
    const secondPayload = await second.json() as {
      ok?: boolean;
      meta?: { cache?: { hit?: boolean; keyPrefix?: string } };
    };

    expect(first.status).toBe(200);
    expect(firstPayload.ok).toBe(true);
    expect(firstPayload.meta?.cache?.hit).toBe(false);

    expect(second.status).toBe(200);
    expect(secondPayload.ok).toBe(true);
    expect(secondPayload.meta?.cache?.hit).toBe(true);
    expect(secondPayload.meta?.cache?.keyPrefix).toBe(firstPayload.meta?.cache?.keyPrefix);
  });

  it("does not leak secrets or internal paths in response payload", async () => {
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 12,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      meta?: { snapshot?: Record<string, unknown> };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/GITHUB_TOKEN|BOK_ECOS_API_KEY|ECOS_API_KEY|FINLIFE/i);
    expect(serialized).not.toContain(".data/");
    expect(payload.meta?.snapshot).not.toHaveProperty("path");
    expect(payload.meta?.snapshot).not.toHaveProperty("sources");
  });
});
