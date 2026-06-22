import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getCurrentUserRun: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getUnifiedProducts: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
}));

vi.mock("../../src/lib/planning/server/runs/repository", () => ({
  getCurrentUserRun: mocked.getCurrentUserRun,
}));

vi.mock("../../src/lib/planning/server/profiles/repository", () => ({
  getCurrentUserProfile: mocked.getCurrentUserProfile,
}));

vi.mock("../../src/lib/sources/unified", () => ({
  getUnifiedProducts: mocked.getUnifiedProducts,
  UnifiedInputError: mocked.UnifiedInputError,
}));

import { GET } from "../../src/app/api/products/candidates/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

function buildRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "GET",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning/reports",
      "x-planning-user-id": "alice",
    },
  });
}

describe("GET /api/products/candidates", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.AUTH_SECRET = undefined;
    env.NEXTAUTH_SECRET = undefined;
    mocked.getCurrentUserRun.mockReset();
    mocked.getCurrentUserProfile.mockReset();
    mocked.getUnifiedProducts.mockReset();
    mocked.getCurrentUserRun.mockResolvedValue({
      id: "run-1",
      profileId: "profile-1",
    });
    mocked.getCurrentUserProfile.mockResolvedValue({
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
    if (typeof originalPlanningTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
  });

  it("returns normalized candidate vm fields without raw payload dumps", async () => {
    const response = await GET(buildRequest("/api/products/candidates?runId=run-1&kind=deposit&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        kind?: string;
        candidates?: Array<Record<string, unknown>>;
      };
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
    });
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
        userId?: string;
        authSource?: string;
        degradedReason?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.candidates).toEqual([]);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
    });
    expect(payload.meta?.degradedReason).toBe("PRODUCT_CATALOG_UNAVAILABLE");
  });

  it("rejects requests that cannot establish the current planning user", async () => {
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const response = await GET(buildRequest("/api/products/candidates?runId=run-1&kind=deposit&limit=10"));
    const payload = await response.json() as {
      ok?: boolean;
      error?: {
        code?: string;
      };
      meta?: unknown;
    };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("FORBIDDEN");
    expect(payload).not.toHaveProperty("meta");
    expect(mocked.getCurrentUserRun).not.toHaveBeenCalled();
    expect(mocked.getCurrentUserProfile).not.toHaveBeenCalled();
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
