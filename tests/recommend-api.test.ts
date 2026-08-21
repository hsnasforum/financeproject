import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    getUnifiedProducts: vi.fn(),
    productFindMany: vi.fn(),
    externalProductFindMany: vi.fn(),
    externalProductMatchFindMany: vi.fn(),
    recommendCandidates: vi.fn(),
    applyDepositProtectionPolicy: vi.fn(),
  };
});

vi.mock("@/lib/sources/unified", () => {
  return {
    getUnifiedProducts: mocked.getUnifiedProducts,
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      product: {
        findMany: mocked.productFindMany,
      },
      externalProduct: {
        findMany: mocked.externalProductFindMany,
      },
      externalProductMatch: {
        findMany: mocked.externalProductMatchFindMany,
      },
    },
  };
});

vi.mock("@/lib/finlife/best", () => {
  return {
    ensureProductBest: vi.fn(),
  };
});

vi.mock("@/lib/recommend/score", () => {
  return {
    recommendCandidates: mocked.recommendCandidates,
  };
});

vi.mock("@/lib/recommend/depositProtection", () => {
  return {
    applyDepositProtectionPolicy: mocked.applyDepositProtectionPolicy,
  };
});

vi.mock("@/lib/recommend/external/kdb", () => {
  return {
    parseKdbRateAndTerm: vi.fn(() => ({ options: [], notes: [] })),
  };
});

vi.mock("@/lib/recommend/selectOption", () => {
  return {
    toNormalizedOption: (option: { saveTrm?: string | null; intrRate?: number | null; intrRate2?: number | null; raw?: Record<string, unknown> | null }) => ({
      save_trm: option.saveTrm ?? undefined,
      intr_rate: option.intrRate ?? null,
      intr_rate2: option.intrRate2 ?? null,
      raw: option.raw ?? {},
    }),
  };
});

vi.mock("@/lib/recommend/types", () => {
  return {
    DEFAULT_TOP_N: 10,
    DEFAULT_WEIGHTS: {
      rate: 0.55,
      term: 0.3,
      liquidity: 0.15,
    },
  };
});

vi.mock("@/lib/http/fallbackMeta", async () => await import("../src/lib/http/fallbackMeta"));
vi.mock("@/lib/http/apiResponse", async () => await import("../src/lib/http/apiResponse"));

import { POST } from "../src/app/api/recommend/route";

type RecommendApiJson = {
  ok?: boolean;
  error?: { code?: string; message?: string };
  meta?: {
    userId?: string;
    authSource?: string;
    diagnosticId?: string;
    debug?: {
      opsDiagnostic?: {
        diagnosticId?: string;
        hint?: string;
      };
    };
    kind?: string;
    planning?: {
      runId?: string;
      summary?: {
        stage?: string;
        overallStatus?: string;
      };
    } | null;
    planningContext?: Record<string, unknown> | null;
    planningLinkage?: {
      readiness?: string;
      metricsCount?: number;
      stageInference?: string;
      inferenceSource?: string;
    };
    fallback?: { reason?: string };
  };
  items?: Array<{ finalScore?: number; breakdown?: unknown[] }>;
  debug?: { candidateCount?: number };
  message?: string;
};

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

function restoreEnv() {
  if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
  else delete env.NODE_ENV;
  if (typeof originalPlanningAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
  else delete env.PLANNING_AUTH_REQUIRED;
  if (typeof originalPlanningTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
  else delete env.PLANNING_TRUST_AUTH_HEADERS;
  if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
  else delete env.PLANNING_USER_ID;
  if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
  else delete env.AUTH_SECRET;
  if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
  else delete env.NEXTAUTH_SECRET;
}

async function callRecommend(
  body: unknown,
  query = "",
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: RecommendApiJson }> {
  const req = new Request(`http://localhost/api/recommend${query}`, {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      referer: "http://localhost/recommend",
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  return {
    status: res.status,
    json: (await res.json()) as RecommendApiJson,
  };
}

describe("POST /api/recommend", () => {
  beforeEach(() => {
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    mocked.getUnifiedProducts.mockReset();
    mocked.productFindMany.mockReset();
    mocked.externalProductFindMany.mockReset();
    mocked.externalProductMatchFindMany.mockReset();
    mocked.recommendCandidates.mockReset();
    mocked.applyDepositProtectionPolicy.mockReset();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns the standard 401 response when recommend auth is required", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(status).toBe(401);
    expect(json).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });

  it("rejects spoofed recommend trusted headers when the bridge is disabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    }, "", { "x-planning-user-id": "attacker" });

    expect(status).toBe(403);
    expect(json).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
      },
    });
    expect(JSON.stringify(json)).not.toContain("attacker");
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });

  it("blocks cross-origin recommend requests before parsing the recommendation profile", async () => {
    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    }, "", {
      origin: "https://example.com",
      referer: "https://example.com/recommend",
    });

    expect(status).toBe(403);
    expect(json).toMatchObject({
      ok: false,
      error: {
        code: "ORIGIN_MISMATCH",
        message: "동일 origin 요청만 허용됩니다.",
      },
    });
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input", async () => {
    const { status, json } = await callRecommend({
      kind: "foo",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(status).toBe(400);
    expect(json?.ok).toBe(false);
    expect(typeof json?.error?.message).toBe("string");
    expect((json.error?.message ?? "").length).toBeGreaterThan(0);
  });

  it("returns 400 with standardized error for invalid candidatePool", async () => {
    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      candidatePool: "invalid",
    });

    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(typeof json.error?.message).toBe("string");
    expect((json.error?.message ?? "")).toContain("candidatePool");
  });

  it("returns 200 and recommendation schema for valid input", async () => {
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 1 } },
      merged: [
        {
          sourceId: "finlife",
          kind: "deposit",
          externalKey: "P1",
          providerName: "테스트은행",
          productName: "테스트 예금",
        },
      ],
      items: [
        {
          sourceId: "finlife",
          kind: "deposit",
          externalKey: "P1",
          providerName: "테스트은행",
          productName: "테스트 예금",
        },
      ],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 1000,
        sourceId: "finlife",
      },
    });

    mocked.productFindMany.mockResolvedValue([
      {
        id: 1,
        finPrdtCd: "P1",
        name: "테스트 예금",
        raw: {
          fin_prdt_nm: "테스트 예금",
          kor_co_nm: "테스트은행",
        },
        provider: { name: "테스트은행" },
        options: [
          {
            saveTrm: "12",
            intrRate: 2.8,
            intrRate2: 3.1,
            raw: {},
          },
        ],
      },
    ]);
    mocked.externalProductMatchFindMany.mockResolvedValue([]);
    mocked.recommendCandidates.mockReturnValue({
      items: [
        {
          sourceId: "finlife",
          kind: "deposit",
          finPrdtCd: "P1",
          providerName: "테스트은행",
          productName: "테스트 예금",
          finalScore: 0.8123,
          selectedOption: {
            saveTrm: "12",
            termMonths: 12,
            appliedRate: 3.1,
            baseRate: 2.8,
            maxRate: 3.1,
            rateSource: "intr_rate2",
            reasons: ["최고금리 우선 정책 적용"],
          },
          breakdown: [
            { key: "rate", label: "금리", raw: 1, weight: 0.55, contribution: 0.55, reason: "금리 상위권" },
            { key: "term", label: "기간 적합", raw: 1, weight: 0.3, contribution: 0.3, reason: "선호기간과 근접" },
            { key: "liquidity", label: "유동성 패널티", raw: 0.25, weight: 0.15, contribution: -0.0375, reason: "유동성 선호 대비 장기 페널티" },
          ],
          reasons: ["선택 옵션: 12개월 · 적용금리 3.10%"],
        },
      ],
      debug: { candidateCount: 1, rateMin: 3.1, rateMax: 3.1 },
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
      assumptions: {
        rateSelectionPolicy: "금리 선택 정책: 최고금리 우선",
        liquidityPolicy: "유동성은 기간 기반 휴리스틱으로 반영",
        normalizationPolicy: "금리 점수는 후보군 min/max로 0..1 정규화",
      },
    });
    mocked.applyDepositProtectionPolicy.mockImplementation(({ items }: { items: unknown[] }) => items);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
      planningContext: {
        monthlyIncomeKrw: 4_500_000,
        monthlyExpenseKrw: 2_600_000,
      },
      planning: {
        runId: "run_20260316_001",
        summary: {
          stage: "DEBT",
          overallStatus: "SUCCESS",
        },
      },
    });

    expect(status).toBe(200);
    expect(json).toHaveProperty("meta");
    expect(json).toHaveProperty("items");
    expect(Array.isArray(json.items)).toBe(true);
    expect(["deposit", "saving"]).toContain(json.meta?.kind);
    expect(json.meta?.planning).toMatchObject({
      runId: "run_20260316_001",
      summary: {
        stage: "DEBT",
        overallStatus: "SUCCESS",
      },
    });
    expect(json.meta?.planningContext).toMatchObject({
      monthlyIncomeKrw: 4_500_000,
      monthlyExpenseKrw: 2_600_000,
    });
    expect(json.meta?.planningLinkage).toMatchObject({
      readiness: "ready",
      metricsCount: 2,
      stageInference: "DEBT",
      inferenceSource: "planning-summary",
    });
    expect(json.meta).toMatchObject({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(json).not.toHaveProperty("engine");
    expect(json).not.toHaveProperty("stage");
    expect(json).not.toHaveProperty("stageDecision");
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      includeRecommendDetail: true,
      includeTimestamps: true,
    }));

    if ((json.items?.length ?? 0) > 0) {
      expect(typeof json.items?.[0]?.finalScore).toBe("number");
      expect(Array.isArray(json.items?.[0]?.breakdown)).toBe(true);
    }
  });

  it("returns 200 with empty items and guide message when there are no candidates", async () => {
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 0 } },
      merged: [],
      items: [],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 1000,
        sourceId: "finlife",
      },
    });
    mocked.externalProductFindMany.mockResolvedValue([]);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(status).toBe(200);
    expect(Array.isArray(json.items)).toBe(true);
    expect((json.items ?? []).length).toBe(0);
    expect(json.meta?.planningLinkage).toMatchObject({
      readiness: "none",
      metricsCount: 0,
      stageInference: "disabled",
      inferenceSource: "none",
    });
    expect(json.meta).toMatchObject({
      userId: "default",
      authSource: "local-namespace",
      diagnosticId: "recommend.no_candidates",
    });
    expect(json.message).toBe("현재 조건에 맞는 상품 후보를 찾지 못했습니다. 조건을 넓히거나 잠시 후 다시 조회해 주세요.");
    expect(json.message ?? "").not.toMatch(/pnpm|\/api\/dev|Run /i);
    expect(JSON.stringify(json.meta?.debug ?? {})).not.toMatch(/pnpm|\/api\/dev|Run /i);
    expect(json.debug?.candidateCount).toBe(0);
  });

  it("uses the no-candidates contract when scoring filters every loaded candidate", async () => {
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 1 } },
      merged: [],
      items: [{
        stableId: "finlife:P-FILTERED",
        sourceId: "finlife",
        kind: "deposit",
        externalKey: "P-FILTERED",
        providerName: "테스트은행",
        productName: "금리 결측 예금",
        options: [],
      }],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1000, sourceId: "finlife" },
    });
    mocked.recommendCandidates.mockReturnValue({
      items: [],
      debug: { candidateCount: 0, rateMin: 0, rateMax: 0 },
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
      assumptions: {
        rateSelectionPolicy: "금리 선택 정책: 최고금리 우선",
        liquidityPolicy: "유동성은 기간 기반 휴리스틱으로 반영",
        normalizationPolicy: "금리 점수는 후보군 min/max로 0..1 정규화",
      },
    });
    mocked.applyDepositProtectionPolicy.mockReturnValue([]);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(status).toBe(200);
    expect(json.items).toEqual([]);
    expect(json.meta).toMatchObject({
      diagnosticId: "recommend.no_candidates",
      fallback: { reason: "compute_no_candidates" },
    });
    expect(json.message).toBe("현재 조건에 맞는 상품 후보를 찾지 못했습니다. 조건을 넓히거나 잠시 후 다시 조회해 주세요.");
    expect(json.debug?.candidateCount).toBe(0);
  });

  it("keeps recommend ops hints behind explicit debug meta", async () => {
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 0 } },
      merged: [],
      items: [],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 1000,
        sourceId: "finlife",
      },
    });
    mocked.externalProductFindMany.mockResolvedValue([]);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    }, "?debug=1");

    expect(status).toBe(200);
    expect(json.message ?? "").not.toMatch(/pnpm|\/api\/dev|Run /i);
    expect(json.meta?.debug?.opsDiagnostic?.diagnosticId).toBe("recommend.no_candidates");
    expect(json.meta?.debug?.opsDiagnostic?.hint ?? "").toContain("pnpm");
  });

  it("returns planningLinkage ready when all planning metrics are present", async () => {
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 0 } },
      merged: [],
      items: [],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 1000,
        sourceId: "finlife",
      },
    });
    mocked.externalProductFindMany.mockResolvedValue([]);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
      planningContext: {
        monthlyIncomeKrw: 4_500_000,
        monthlyExpenseKrw: 2_600_000,
        liquidAssetsKrw: 12_000_000,
        debtBalanceKrw: 5_000_000,
      },
    });

    expect(status).toBe(200);
    expect(json.meta?.planningContext).toMatchObject({
      monthlyIncomeKrw: 4_500_000,
      monthlyExpenseKrw: 2_600_000,
      liquidAssetsKrw: 12_000_000,
      debtBalanceKrw: 5_000_000,
    });
    expect(json.meta?.planningLinkage).toMatchObject({
      readiness: "ready",
      metricsCount: 4,
      stageInference: "DEBT",
      inferenceSource: "planning-context",
    });
  });

  it("returns trusted-header user metadata when the explicit local bridge is enabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { finlife: { count: 0 } },
      merged: [],
      items: [],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 1000,
        sourceId: "finlife",
      },
    });
    mocked.externalProductFindMany.mockResolvedValue([]);

    const { status, json } = await callRecommend({
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    }, "", { "x-planning-user-id": "alice" });

    expect(status).toBe(200);
    expect(json.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
    });
  });
});
