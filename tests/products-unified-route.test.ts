import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProducts: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
  getProductFreshnessSummary: vi.fn(),
}));

vi.mock("@/lib/sources/productFreshness", () => ({
  getProductFreshnessSummary: mocked.getProductFreshnessSummary,
  applyProductSourceIssues: (summary: unknown) => summary,
}));

vi.mock("@/lib/sources/unified", () => ({
  getUnifiedProducts: mocked.getUnifiedProducts,
  UnifiedInputError: mocked.UnifiedInputError,
}));

vi.mock("@/lib/sources/includeSources", () => ({
  parseIncludeSources: (input: string | string[] | null) => {
    if (Array.isArray(input)) {
      const tokens = input.flatMap((entry) => entry.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
      return tokens.length > 0 ? tokens : ["finlife"];
    }
    if (typeof input === "string" && input.trim().length > 0) {
      return input.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    }
    return ["finlife"];
  },
}));

vi.mock("@/lib/http/apiResponse", async () => await import("../src/lib/http/apiResponse"));
vi.mock("@/lib/http/validate", async () => await import("../src/lib/http/validate"));

import { GET } from "../src/app/api/products/unified/route";

type UnifiedRouteJson = {
  ok?: boolean;
  data?: {
    items?: Array<{ badges?: string[] }>;
    pageInfo?: {
      partial?: boolean;
      partialReasons?: Array<{
        code?: string;
        sourceId?: string;
        message?: string;
        recovery?: string;
      }>;
    };
    facets?: {
      providerStatus?: {
        state?: string;
        issues?: Array<{ code?: string; sourceId?: string }>;
      };
    };
  };
  coverage?: {
    totalProducts?: number;
    kdbBadged?: number;
    depositProtection?: {
      matched?: number;
      unknown?: number;
    };
  };
  diagnostics?: {
    providerIndex?: {
      finlifeProviders?: number;
      kdbProvidersIndexed?: number;
    };
    matchSummary?: {
      kdb?: { byExact?: number; byNormalized?: number; byFuzzy?: number; none?: number };
    };
    unmatchedProviders?: Array<{ providerName?: string; count?: number }>;
    notes?: string[];
  };
  meta?: {
    generatedAt?: string;
    freshness?: {
      checkedAt?: string;
      sources?: Array<{ sourceAsOf?: string | null }>;
    };
  };
  error?: {
    code?: string;
    message?: string;
    details?: {
      reason?: {
        code?: string;
        message?: string;
        recovery?: string;
      };
    };
  };
};

const sampleUnified = {
  kind: "deposit" as const,
  sources: { finlife: { count: 1 } },
  merged: [
    {
      sourceId: "finlife",
      kind: "deposit",
      externalKey: "P1",
      providerName: "테스트은행",
      productName: "테스트예금",
      badges: ["KDB_MATCHED"],
    },
  ],
  items: [
    {
      sourceId: "finlife",
      kind: "deposit",
      externalKey: "P1",
      providerName: "테스트은행",
      productName: "테스트예금",
      badges: ["KDB_MATCHED"],
    },
  ],
  diagnostics: {
    providerIndex: {
      finlifeProviders: 1,
      kdbProvidersIndexed: 2,
    },
    matchSummary: {
      kdb: { byExact: 0, byNormalized: 1, byFuzzy: 0, none: 0 },
    },
    unmatchedProviders: [{ providerName: "미매칭은행", count: 1 }],
    notes: ["테스트 노트"],
  },
  pageInfo: {
    hasMore: false,
    nextCursor: null,
    limit: 200,
    sourceId: "finlife",
  },
};

async function callUnified(query = ""): Promise<{ status: number; json: UnifiedRouteJson }> {
  const req = new Request(`http://localhost/api/products/unified${query}`);
  const res = await GET(req);
  return {
    status: res.status,
    json: (await res.json()) as UnifiedRouteJson,
  };
}

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

describe("GET /api/products/unified", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowInProd = process.env.UNIFIED_DEBUG_ALLOW_IN_PROD;

  beforeEach(() => {
    mocked.getUnifiedProducts.mockReset();
    mocked.getUnifiedProducts.mockResolvedValue(sampleUnified);
    mocked.getProductFreshnessSummary.mockReset();
    mocked.getProductFreshnessSummary.mockResolvedValue({
      checkedAt: "2026-08-26T03:00:00.000Z",
      overall: "stale",
      sources: [{
        sourceId: "finlife",
        kind: "deposit",
        sourceAsOf: "2026-06-22T15:58:01.146Z",
        checkedAt: "2026-08-26T03:00:00.000Z",
        ttlMs: 43_200_000,
        ageMs: 1,
        freshness: "stale",
        fallbackUsed: false,
        message: "stale",
      }],
    });
    setEnv("NODE_ENV", "test");
    setEnv("UNIFIED_DEBUG_ALLOW_IN_PROD", undefined);
  });

  afterEach(() => {
    setEnv("NODE_ENV", originalNodeEnv);
    if (originalAllowInProd === undefined) {
      setEnv("UNIFIED_DEBUG_ALLOW_IN_PROD", undefined);
    } else {
      setEnv("UNIFIED_DEBUG_ALLOW_IN_PROD", originalAllowInProd);
    }
  });

  it("returns diagnostics contract when debug=1 in non-production", async () => {
    const { status, json } = await callUnified("?debug=1");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({ debug: true }));

    expect(typeof json.diagnostics?.providerIndex?.finlifeProviders).toBe("number");
    expect(typeof json.diagnostics?.providerIndex?.kdbProvidersIndexed).toBe("number");

    expect(typeof json.diagnostics?.matchSummary?.kdb?.byExact).toBe("number");
    expect(typeof json.diagnostics?.matchSummary?.kdb?.byNormalized).toBe("number");
    expect(typeof json.diagnostics?.matchSummary?.kdb?.byFuzzy).toBe("number");
    expect(typeof json.diagnostics?.matchSummary?.kdb?.none).toBe("number");

    expect(Array.isArray(json.diagnostics?.unmatchedProviders)).toBe(true);
    expect(typeof json.diagnostics?.unmatchedProviders?.[0]?.providerName).toBe("string");
    expect(typeof json.diagnostics?.unmatchedProviders?.[0]?.count).toBe("number");
    expect(Array.isArray(json.diagnostics?.notes)).toBe(true);
  });

  it("keeps response generation time separate from sourceAsOf", async () => {
    const { status, json } = await callUnified("?kind=deposit&includeSources=finlife");

    expect(status).toBe(200);
    expect(json.meta?.freshness?.sources?.[0]?.sourceAsOf).toBe("2026-06-22T15:58:01.146Z");
    expect(json.meta?.generatedAt).not.toBe(json.meta?.freshness?.sources?.[0]?.sourceAsOf);
  });

  it("does not expose diagnostics in production by default", async () => {
    setEnv("NODE_ENV", "production");

    const { status, json } = await callUnified("?debug=1");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));
    expect("diagnostics" in json).toBe(false);
  });

  it("can expose diagnostics in production only when explicitly allowed", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("UNIFIED_DEBUG_ALLOW_IN_PROD", "1");

    const { status, json } = await callUnified("?debug=1");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({ debug: true }));
    expect(typeof json.diagnostics?.providerIndex?.finlifeProviders).toBe("number");
  });

  it("accepts samplebank in includeSources query outside production", async () => {
    const { status, json } = await callUnified("?mode=merged&includeSources=samplebank&kind=deposit");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      includeSources: ["samplebank"],
      kind: "deposit",
      mode: "merged",
    }));
  });

  it("rejects samplebank source in production public catalog API", async () => {
    setEnv("NODE_ENV", "production");

    const { status, json } = await callUnified("?mode=merged&includeSources=samplebank&kind=deposit");

    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });

  it("passes depositProtection mode to unified product service", async () => {
    const { status, json } = await callUnified("?kind=deposit&depositProtection=require");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      depositProtection: "require",
    }));
  });

  it("passes catalog filters to the merged product service", async () => {
    const { status, json } = await callUnified(
      "?mode=merged&kind=deposit&includeSources=finlife,datago_kdb&provider=%EA%B5%AD%EB%AF%BC%EC%9D%80%ED%96%89&termMonths=12&minRate=3.5",
    );

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      provider: "국민은행",
      termMonths: 12,
      minRate: 3.5,
      signal: expect.anything(),
    }));
  });

  it("reports deposit protection matched and unknown coverage", async () => {
    mocked.getUnifiedProducts.mockResolvedValueOnce({
      ...sampleUnified,
      items: [
        { badges: ["KDB_MATCHED"], signals: { depositProtection: "matched" } },
        { badges: [], signals: { depositProtection: "unknown" } },
        { badges: [] },
      ],
    });

    const { status, json } = await callUnified("?kind=deposit");

    expect(status).toBe(200);
    expect(json.coverage?.depositProtection).toEqual({
      matched: 1,
      unknown: 2,
    });
  });

  it("preserves structured data and provider-facet partial status in the public route", async () => {
    mocked.getUnifiedProducts.mockResolvedValueOnce({
      ...sampleUnified,
      pageInfo: {
        ...sampleUnified.pageInfo,
        partial: true,
        partialReasons: [{
          code: "SOURCE_QUERY_FAILED",
          sourceId: "datago_kdb",
          message: "상품 후보가 누락되었습니다.",
          recovery: "잠시 후 다시 조회해 주세요.",
        }],
      },
      facets: {
        providers: ["테스트은행"],
        providerStatus: {
          state: "partial",
          issues: [{
            code: "PROVIDER_FACET_FAILED",
            sourceId: "datago_kdb",
            message: "전체 기관 목록을 불러오지 못했습니다.",
            recovery: "잠시 후 다시 조회해 주세요.",
          }],
        },
      },
    });

    const { status, json } = await callUnified("?kind=deposit");

    expect(status).toBe(200);
    expect(json.data?.pageInfo?.partial).toBe(true);
    expect(json.data?.pageInfo?.partialReasons).toEqual([
      expect.objectContaining({ code: "SOURCE_QUERY_FAILED", sourceId: "datago_kdb" }),
    ]);
    expect(json.data?.facets?.providerStatus).toEqual({
      state: "partial",
      issues: [expect.objectContaining({ code: "PROVIDER_FACET_FAILED", sourceId: "datago_kdb" })],
    });
  });

  it("keeps an aborted request distinct from an upstream failure", async () => {
    mocked.getUnifiedProducts.mockRejectedValueOnce(new DOMException("request cancelled", "AbortError"));

    const { status, json } = await callUnified("?kind=deposit&provider=%EA%B5%AD%EB%AF%BC%EC%9D%80%ED%96%89");

    expect(status).toBe(499);
    expect(json.error).toEqual(expect.objectContaining({
      code: "REQUEST_ABORTED",
      details: {
        reason: expect.objectContaining({
          code: "REQUEST_ABORTED",
          recovery: expect.any(String),
        }),
      },
    }));
  });
});
