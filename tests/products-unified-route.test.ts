import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProducts: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
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

  it("accepts samplebank in includeSources query", async () => {
    const { status, json } = await callUnified("?mode=merged&includeSources=samplebank&kind=deposit");

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      includeSources: ["samplebank"],
      kind: "deposit",
      mode: "merged",
    }));
  });
});
