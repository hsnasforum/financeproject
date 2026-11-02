import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProductById: vi.fn(),
}));

vi.mock("@/lib/sources/unified", () => ({
  getUnifiedProductById: mocked.getUnifiedProductById,
}));

import { generateMetadata } from "../src/app/products/catalog/[id]/page";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

describe("product detail metadata", () => {
  beforeEach(() => {
    mocked.getUnifiedProductById.mockReset();
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("uses the resolved product and provider without timestamps", async () => {
    mocked.getUnifiedProductById.mockResolvedValue({
      stableId: "P-001",
      sourceId: "finlife",
      kind: "deposit",
      externalKey: "P-001",
      providerName: "테스트은행",
      productName: "테스트 예금",
      options: [],
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ id: "P-001" }) });

    expect(metadata).toEqual({
      title: "테스트 예금 상품 상세",
      description: "테스트은행에서 제공하는 테스트 예금의 기간별 금리와 우대조건, 제공 정보를 현재 비교 기준으로 확인합니다.",
    });
    expect(mocked.getUnifiedProductById).toHaveBeenCalledWith({ id: "P-001", includeTimestamps: false });
  });

  it("keeps different identifiers distinguishable when lookup fails", async () => {
    mocked.getUnifiedProductById.mockRejectedValue(new Error("database unavailable"));

    const first = await generateMetadata({ params: Promise.resolve({ id: "P-001" }) });
    const second = await generateMetadata({ params: Promise.resolve({ id: "P-002" }) });

    expect(first.title).toBe("상품 P-001 상세");
    expect(second.title).toBe("상품 P-002 상세");
  });

  it("does not expose development sample product details in production metadata", async () => {
    env.NODE_ENV = "production";

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "samplebank%3ASB-001" }),
    });

    expect(metadata.title).toBe("상품 samplebank:SB-001 상세");
    expect(mocked.getUnifiedProductById).not.toHaveBeenCalled();
  });
});
