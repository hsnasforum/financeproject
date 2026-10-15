import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProductById: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
  UnifiedRetiredProductError: class UnifiedRetiredProductError extends Error {
    constructor(message: string, readonly replacementHref: string) {
      super(message);
    }
  },
  getProductFreshnessSummary: vi.fn(),
}));

vi.mock("@/lib/sources/productFreshness", () => ({
  getProductFreshnessSummary: mocked.getProductFreshnessSummary,
}));

vi.mock("@/lib/sources/unified", () => ({
  getUnifiedProductById: mocked.getUnifiedProductById,
  UnifiedInputError: mocked.UnifiedInputError,
  UnifiedRetiredProductError: mocked.UnifiedRetiredProductError,
}));

import { GET } from "../src/app/api/products/unified/item/route";

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

describe("GET /api/products/unified/item", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mocked.getUnifiedProductById.mockReset();
    mocked.getProductFreshnessSummary.mockReset();
    mocked.getProductFreshnessSummary.mockResolvedValue({
      checkedAt: "2026-08-26T03:00:00.000Z",
      overall: "stale",
      sources: [
        { sourceId: "finlife", kind: "deposit", sourceAsOf: "2026-06-22T15:58:01.146Z", checkedAt: "2026-08-26T03:00:00.000Z", ttlMs: 1, ageMs: 2, freshness: "stale", fallbackUsed: false, message: "stale" },
        { sourceId: "datago_kdb", kind: "deposit", sourceAsOf: "2026-06-28T10:31:26.167Z", checkedAt: "2026-08-26T03:00:00.000Z", ttlMs: 1, ageMs: 2, freshness: "stale", fallbackUsed: false, message: "stale" },
      ],
    });
    setEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    setEnv("NODE_ENV", originalNodeEnv);
  });

  it("returns 404 NO_DATA when item is missing", async () => {
    mocked.getUnifiedProductById.mockResolvedValue(null);

    const req = new Request("http://localhost/api/products/unified/item?id=missing-id");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("NO_DATA");
    expect(typeof json.error?.message).toBe("string");
  });

  it("returns 410 PRODUCT_RETIRED with the replacement screen for a retired source", async () => {
    mocked.getUnifiedProductById.mockRejectedValue(
      new mocked.UnifiedRetiredProductError("이전 데이터 제공을 종료했습니다.", "/products/pension"),
    );

    const res = await GET(new Request("http://localhost/api/products/unified/item?id=finlife:pension:0010003:OLD"));
    const json = await res.json() as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string; replacementHref?: string } };

    expect(res.status).toBe(410);
    expect(json.ok).toBe(false);
    expect(json.data).toBeUndefined();
    expect(json.error).toMatchObject({ code: "PRODUCT_RETIRED", message: "이전 데이터 제공을 종료했습니다.", replacementHref: "/products/pension" });
  });

  it("returns item payload on success", async () => {
    mocked.getUnifiedProductById.mockResolvedValue({
      stableId: "P-001",
      sourceId: "finlife",
      sourceIds: ["finlife", "datago_kdb"],
      kind: "deposit",
      externalKey: "P-001",
      providerName: "테스트은행",
      productName: "테스트 예금",
      options: [
        { sourceId: "finlife", termMonths: 12, saveTrm: "12", intrRate: 2.9, intrRate2: 3.4 },
      ],
    });

    const req = new Request("http://localhost/api/products/unified/item?id=P-001");
    const res = await GET(req);
    const json = await res.json() as {
      ok?: boolean;
      data?: { item?: { stableId?: string; productName?: string } };
      meta?: { generatedAt?: string; freshness?: { sources?: Array<{ sourceAsOf?: string | null }> } };
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data?.item?.stableId).toBe("P-001");
    expect(json.data?.item?.productName).toBe("테스트 예금");
    expect(typeof json.meta?.generatedAt).toBe("string");
    expect(json.meta?.freshness?.sources?.map((source) => source.sourceAsOf)).toEqual([
      "2026-06-22T15:58:01.146Z",
      "2026-06-28T10:31:26.167Z",
    ]);
    expect(mocked.getUnifiedProductById).toHaveBeenCalledWith({ id: "P-001", includeTimestamps: true });
  });

  it("blocks samplebank detail lookup in production public catalog", async () => {
    setEnv("NODE_ENV", "production");

    const req = new Request("http://localhost/api/products/unified/item?id=samplebank:SB-001");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
    expect(json.error?.message).toContain("샘플 데이터 상품");
    expect(mocked.getUnifiedProductById).not.toHaveBeenCalled();
  });
});
