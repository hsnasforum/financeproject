import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getRun: vi.fn(),
  getProfile: vi.fn(),
  getUnifiedProducts: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
}));

vi.mock("../../src/lib/planning/server/store/runStore", () => ({
  getRun: mocked.getRun,
}));

vi.mock("../../src/lib/planning/server/store/profileStore", () => ({
  getProfile: mocked.getProfile,
}));

vi.mock("../../src/lib/sources/unified", () => ({
  getUnifiedProducts: mocked.getUnifiedProducts,
  UnifiedInputError: mocked.UnifiedInputError,
}));

import { GET } from "../../src/app/api/products/candidates/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

function buildRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "GET",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning/reports",
    },
  });
}

describe("GET /api/products/candidates", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    mocked.getRun.mockReset();
    mocked.getProfile.mockReset();
    mocked.getUnifiedProducts.mockReset();
    mocked.getRun.mockResolvedValue({
      id: "run-1",
      profileId: "profile-1",
    });
    mocked.getProfile.mockResolvedValue({
      id: "profile-1",
      profile: {
        monthlyIncomeNet: 4_500_000,
        monthlyEssentialExpenses: 1_700_000,
        monthlyDiscretionaryExpenses: 900_000,
        liquidAssets: 12_000_000,
        goals: [
          {
            id: "goal-1",
            name: "비상금",
            targetAmount: 18_000_000,
            currentAmount: 6_000_000,
            targetMonth: 12,
            priority: 1,
          },
        ],
      },
    });
    mocked.getUnifiedProducts.mockResolvedValue({
      items: [
        {
          sourceId: "finlife",
          stableId: "finlife-demo-product",
          externalKey: "external-1",
          providerName: "테스트은행",
          productName: "테스트예금",
          summary: "우대조건 있음",
          badges: ["우대금리"],
          options: [
            {
              sourceId: "finlife",
              termMonths: 12,
              intrRate: 3.4,
              intrRate2: 3.9,
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("returns normalized candidate vm fields without raw payload dumps", async () => {
    const response = await GET(buildRequest("/api/products/candidates?runId=run-1&kind=deposit&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        kind?: string;
        candidates?: Array<Record<string, unknown>>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.kind).toBe("deposit");
    expect((payload.data?.candidates ?? []).length).toBeGreaterThan(0);

    const first = payload.data?.candidates?.[0] ?? {};
    expect(first).toMatchObject({
      id: expect.any(String),
      providerName: "테스트은행",
      productName: "테스트예금",
      termMonths: 12,
      baseRatePct: expect.any(Number),
      conditionsSummary: expect.any(String),
      source: "finlife",
      fetchedAt: expect.any(String),
    });
    expect("raw" in first).toBe(false);
    expect("rawJson" in first).toBe(false);

    const serialized = JSON.stringify(payload);
    expect(serialized.includes("process.env")).toBe(false);
    expect(serialized.includes("GITHUB_TOKEN")).toBe(false);
    expect(serialized.includes("ECOS_API_KEY")).toBe(false);
  });

  it("returns an empty candidate set when product catalog tables are unavailable", async () => {
    const unavailable = Object.assign(
      new Error("The table `main.Product` does not exist in the current database."),
      { code: "P2021" },
    );
    mocked.getUnifiedProducts.mockRejectedValueOnce(unavailable);

    const response = await GET(buildRequest("/api/products/candidates?runId=run-1&kind=deposit&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        candidates?: unknown[];
      };
      meta?: {
        degradedReason?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.candidates).toEqual([]);
    expect(payload.meta?.degradedReason).toBe("PRODUCT_CATALOG_UNAVAILABLE");
  });

  it("keeps returning 500 for unexpected candidate loading failures", async () => {
    mocked.getUnifiedProducts.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(buildRequest("/api/products/candidates?runId=run-1&kind=deposit&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      error?: {
        code?: string;
        message?: string;
      };
    };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INTERNAL");
    expect(payload.error?.message).toBe("boom");
  });
});
