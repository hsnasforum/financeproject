import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../../src/app/api/planning/v2/actions/route";

const originalFetch = globalThis.fetch;

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/actions", {
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

function profileWithDeficit() {
  return {
    monthlyIncomeNet: 2_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 500_000,
    investmentAssets: 300_000,
    debts: [],
    goals: [
      { id: "goal-home", name: "Home", targetAmount: 6_000_000, targetMonth: 12, priority: 3 },
    ],
    risk: { riskTolerance: "mid" },
  };
}

function makeFinlifePayload(kind: "deposit" | "saving") {
  const baseName = kind === "deposit" ? "Deposit" : "Saving";
  return {
    ok: true,
    data: Array.from({ length: 8 }, (_, index) => ({
      fin_prdt_cd: `${kind}-${index + 1}`,
      kor_co_nm: `Bank ${index + 1}`,
      fin_prdt_nm: `${baseName} Product ${index + 1}`,
      best: {
        save_trm: `${(index % 4 + 1) * 3}`,
        intr_rate: 2 + index * 0.1,
        intr_rate2: 2.4 + index * 0.1,
      },
      options: [
        {
          save_trm: `${(index % 4 + 1) * 3}`,
          intr_rate: 2 + index * 0.1,
          intr_rate2: 2.4 + index * 0.1,
        },
      ],
    })),
  };
}

describe("POST /api/planning/v2/actions", () => {
  const originalPlanningCacheDir = process.env.PLANNING_CACHE_DIR;
  const originalIncludeProductsEnabled = process.env.PLANNING_INCLUDE_PRODUCTS_ENABLED;
  let cacheRoot = "";

  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-actions-cache-"));
    process.env.PLANNING_CACHE_DIR = cacheRoot;
    process.env.PLANNING_INCLUDE_PRODUCTS_ENABLED = "true";
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    if (typeof originalPlanningCacheDir === "string") process.env.PLANNING_CACHE_DIR = originalPlanningCacheDir;
    else delete process.env.PLANNING_CACHE_DIR;
    if (typeof originalIncludeProductsEnabled === "string") process.env.PLANNING_INCLUDE_PRODUCTS_ENABLED = originalIncludeProductsEnabled;
    else delete process.env.PLANNING_INCLUDE_PRODUCTS_ENABLED;
    if (cacheRoot) fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("returns actions without candidates when includeProducts=false", async () => {
    const response = await POST(request({
      profile: profileWithDeficit(),
      horizonMonths: 12,
      includeProducts: false,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        actions?: Array<{ code?: string; candidates?: unknown[] }>;
        engine?: { stage?: string };
        engineSchemaVersion?: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.engine?.stage).toBeTruthy();
    expect(payload.data?.engineSchemaVersion).toBe(1);
    const data = payload.data as Record<string, unknown> | undefined;
    expect(data?.stage).toBeUndefined();
    expect(data?.financialStatus).toBeUndefined();
    expect(data?.stageDecision).toBeUndefined();
    expect((payload.data?.actions ?? []).length).toBeGreaterThan(0);
    expect((payload.data?.actions ?? []).every((entry) => entry.candidates === undefined)).toBe(true);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it("attaches finlife candidates when includeProducts=true", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/finlife/deposit")) {
        return new Response(JSON.stringify(makeFinlifePayload("deposit")), { status: 200 });
      }
      if (url.includes("/api/finlife/saving")) {
        return new Response(JSON.stringify(makeFinlifePayload("saving")), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

    const response = await POST(request({
      profile: profileWithDeficit(),
      horizonMonths: 12,
      includeProducts: true,
      maxCandidatesPerAction: 2,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        actions?: Array<{ code?: string; candidates?: Array<{ finPrdtCd?: string }> }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    const actions = payload.data?.actions ?? [];
    const actionWithCandidates = actions.find((entry) => Array.isArray(entry.candidates) && entry.candidates.length > 0);
    expect(actionWithCandidates).toBeDefined();
    expect((actionWithCandidates?.candidates ?? []).length).toBeLessThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("enforces maxCandidatesPerAction upper bound in candidate list", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/finlife/deposit")) {
        return new Response(JSON.stringify(makeFinlifePayload("deposit")), { status: 200 });
      }
      if (url.includes("/api/finlife/saving")) {
        return new Response(JSON.stringify(makeFinlifePayload("saving")), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

    const response = await POST(request({
      profile: profileWithDeficit(),
      horizonMonths: 12,
      includeProducts: true,
      maxCandidatesPerAction: 1,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        actions?: Array<{ candidates?: Array<unknown> }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    for (const action of payload.data?.actions ?? []) {
      if (Array.isArray(action.candidates) && action.candidates.length > 0) {
        expect(action.candidates.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
