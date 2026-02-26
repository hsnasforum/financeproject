import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProductById: vi.fn(),
  UnifiedInputError: class UnifiedInputError extends Error {},
}));

vi.mock("@/lib/sources/unified", () => ({
  getUnifiedProductById: mocked.getUnifiedProductById,
  UnifiedInputError: mocked.UnifiedInputError,
}));

import { GET } from "../src/app/api/products/unified/item/route";

describe("GET /api/products/unified/item", () => {
  beforeEach(() => {
    mocked.getUnifiedProductById.mockReset();
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
      meta?: { generatedAt?: string };
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data?.item?.stableId).toBe("P-001");
    expect(json.data?.item?.productName).toBe("테스트 예금");
    expect(typeof json.meta?.generatedAt).toBe("string");
    expect(mocked.getUnifiedProductById).toHaveBeenCalledWith({ id: "P-001", includeTimestamps: true });
  });
});
