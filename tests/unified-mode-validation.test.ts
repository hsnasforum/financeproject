import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUnifiedProducts: vi.fn().mockResolvedValue({
    kind: "deposit",
    sources: { finlife: { count: 0 } },
    merged: [],
    items: [],
    pageInfo: { hasMore: false, nextCursor: null, limit: 200 },
  }),
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

describe("unified mode validation", () => {
  it("rejects integrated mode when finlife is not included", async () => {
    const req = new Request("http://localhost/api/products/unified?mode=integrated&includeSources=datago_kdb");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
    expect(json.error?.message).toContain("Integrated mode requires finlife");
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });

  it("rejects cursor in integrated mode", async () => {
    const req = new Request("http://localhost/api/products/unified?mode=integrated&includeSources=finlife&cursor=eyJpZCI6MX0");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
    expect(json.error?.message).toContain("Cursor pagination is not supported in integrated mode");
    expect(mocked.getUnifiedProducts).not.toHaveBeenCalled();
  });
});
