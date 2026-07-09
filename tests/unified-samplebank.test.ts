import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProducts: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
}));

vi.mock("@/lib/sources/unified", () => ({
  getUnifiedProducts: mocked.getUnifiedProducts,
  UnifiedInputError: mocked.UnifiedInputError,
}));

vi.mock("@/lib/http/apiResponse", async () => await import("../src/lib/http/apiResponse"));
vi.mock("@/lib/http/validate", async () => await import("../src/lib/http/validate"));

import { GET } from "../src/app/api/products/unified/route";

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

describe("GET /api/products/unified samplebank", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mocked.getUnifiedProducts.mockReset();
    setEnv("NODE_ENV", "test");
    mocked.getUnifiedProducts.mockResolvedValue({
      kind: "deposit",
      sources: { samplebank: { count: 1 } },
      merged: [
        {
          stableId: "samplebank:SB-001",
          sourceId: "samplebank",
          kind: "deposit",
          externalKey: "SB-001",
          providerName: "샘플은행",
          productName: "샘플 정기예금",
          options: [{ sourceId: "samplebank", termMonths: 12, intrRate: 2.5, intrRate2: 3.0 }],
          badges: ["SAMPLEBANK"],
        },
      ],
      items: [
        {
          stableId: "samplebank:SB-001",
          sourceId: "samplebank",
          kind: "deposit",
          externalKey: "SB-001",
          providerName: "샘플은행",
          productName: "샘플 정기예금",
          options: [{ sourceId: "samplebank", termMonths: 12, intrRate: 2.5, intrRate2: 3.0 }],
          badges: ["SAMPLEBANK"],
        },
      ],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: 200,
      },
    });
  });

  afterEach(() => {
    setEnv("NODE_ENV", originalNodeEnv);
  });

  it("includes samplebank source outside production when includeSources=samplebank", async () => {
    const req = new Request("http://localhost/api/products/unified?mode=merged&includeSources=samplebank&kind=deposit");
    const res = await GET(req);
    const json = await res.json() as {
      ok?: boolean;
      data?: {
        items?: Array<{ sourceId?: string }>;
      };
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data?.items?.some((item) => item.sourceId === "samplebank")).toBe(true);
    expect(mocked.getUnifiedProducts).toHaveBeenCalledWith(expect.objectContaining({
      includeSources: ["samplebank"],
      kind: "deposit",
      mode: "merged",
    }));
  });

  it("keeps samplebank unavailable in production public catalog", async () => {
    setEnv("NODE_ENV", "production");

    const req = new Request("http://localhost/api/products/unified?mode=merged&includeSources=samplebank&kind=deposit");
    const res = await GET(req);
    const json = await res.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
    expect(json.error?.message).toContain("샘플 데이터 소스");
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });
});
