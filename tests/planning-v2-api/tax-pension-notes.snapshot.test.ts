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

import { POST as simulatePOST } from "../../src/app/api/planning/v2/simulate/route";
import { POST as scenariosPOST } from "../../src/app/api/planning/v2/scenarios/route";

function request(url: string, body: unknown): Request {
  return new Request(url, {
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
    risk: { riskTolerance: "mid" },
    tax: {
      regime: "KR",
      filingStatus: "single",
      dependents: 1,
    },
    pensionsDetailed: {
      regime: "KR",
      nationalPension: {
        expectedMonthlyPayoutKrw: 900_000,
        startAge: 63,
      },
    },
  };
}

describe("planning v2 precision note snapshot", () => {
  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);
  });

  it("includes placeholder note once in simulate and scenarios outputs", async () => {
    const simulateResponse = await simulatePOST(
      request("http://localhost:3000/api/planning/v2/simulate", {
        profile: baseProfile(),
        horizonMonths: 12,
      }),
    );
    const simulatePayload = await simulateResponse.json() as {
      data?: { precisionNotes?: string[] };
    };

    const scenariosResponse = await scenariosPOST(
      request("http://localhost:3000/api/planning/v2/scenarios", {
        profile: baseProfile(),
        horizonMonths: 12,
      }),
    );
    const scenariosPayload = await scenariosResponse.json() as {
      data?: { precisionNotes?: string[] };
    };

    const snapshot = {
      simulate: simulatePayload.data?.precisionNotes ?? [],
      scenarios: scenariosPayload.data?.precisionNotes ?? [],
    };

    expect(snapshot.simulate).toHaveLength(1);
    expect(snapshot.scenarios).toHaveLength(1);
    expect(snapshot).toMatchSnapshot();
  });
});

