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

import { POST } from "../../src/app/api/planning/v2/optimize/route";

const env = process.env as Record<string, string | undefined>;
const originalOptimizerFlag = process.env.PLANNING_OPTIMIZER_ENABLED;

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/optimize", {
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
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_000_000,
    investmentAssets: 1_500_000,
    debts: [],
    goals: [
      {
        id: "goal-a",
        name: "Goal A",
        targetAmount: 5_000_000,
        targetMonth: 24,
        priority: 3,
      },
    ],
  };
}

describe("POST /api/planning/v2/optimize", () => {
  beforeEach(() => {
    if (typeof originalOptimizerFlag === "string") env.PLANNING_OPTIMIZER_ENABLED = originalOptimizerFlag;
    else delete env.PLANNING_OPTIMIZER_ENABLED;

    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
  });

  it("returns DISABLED when optimizer feature flag is off", async () => {
    env.PLANNING_OPTIMIZER_ENABLED = "false";
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 24,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("DISABLED");
  });

  it("returns ranked candidates when optimizer is enabled", async () => {
    env.PLANNING_OPTIMIZER_ENABLED = "true";
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);

    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 24,
      constraints: {
        minEmergencyMonths: 1,
      },
      knobs: {
        maxMonthlyContributionKrw: 100_000,
        allowExtraDebtPayment: false,
        allowInvestContribution: true,
      },
      search: {
        candidates: 12,
        keepTop: 2,
        seed: 77,
      },
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
        candidates?: Array<{
          strategy?: { extraDebtPaymentKrw?: number };
          why?: string[];
        }>;
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
    expect((payload.data?.candidates?.length ?? 0)).toBeGreaterThan(0);
    expect((payload.data?.candidates?.length ?? 0)).toBeLessThanOrEqual(2);

    for (const candidate of payload.data?.candidates ?? []) {
      expect(candidate.strategy?.extraDebtPaymentKrw ?? 0).toBe(0);
      expect((candidate.why ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });
});
