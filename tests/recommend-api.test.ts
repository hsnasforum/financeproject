import { beforeEach, describe, expect, it, vi } from "vitest";

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
  error?: { message?: string };
  meta?: {
    kind?: string;
    planningContext?: Record<string, unknown> | null;
    planningLinkage?: {
      readiness?: string;
      metricsCount?: number;
      stageInference?: string;
    };
  };
  items?: Array<{ finalScore?: number; breakdown?: unknown[] }>;
  debug?: { candidateCount?: number };
  message?: string;
};

async function callRecommend(body: unknown, query = ""): Promise<{ status: number; json: RecommendApiJson }> {
  const req = new Request(`http://localhost/api/recommend${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
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
    mocked.getUnifiedProducts.mockReset();
    mocked.productFindMany.mockReset();
    mocked.externalProductFindMany.mockReset();
    mocked.externalProductMatchFindMany.mockReset();
    mocked.recommendCandidates.mockReset();
    mocked.applyDepositProtectionPolicy.mockReset();
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
    });

    expect(status).toBe(200);
    expect(json).toHaveProperty("meta");
    expect(json).toHaveProperty("items");
    expect(Array.isArray(json.items)).toBe(true);
    expect(["deposit", "saving"]).toContain(json.meta?.kind);
    expect(json.meta?.planningContext).toMatchObject({
      monthlyIncomeKrw: 4_500_000,
      monthlyExpenseKrw: 2_600_000,
    });
    expect(json.meta?.planningLinkage).toMatchObject({
      readiness: "partial",
      metricsCount: 2,
      stageInference: "disabled",
    });
    expect(json).not.toHaveProperty("engine");
    expect(json).not.toHaveProperty("stage");
    expect(json).not.toHaveProperty("stageDecision");

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
    });
    expect(typeof json.message === "string" || json.debug?.candidateCount === 0).toBe(true);
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
      stageInference: "disabled",
    });
  });
});
