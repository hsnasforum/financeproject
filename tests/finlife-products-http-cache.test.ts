import { describe, expect, it } from "vitest";
import { buildFinlifeHttpCacheKey, resolveFinlifeHttpCacheState } from "../src/lib/finlife/httpCache";

describe("finlife products http cache", () => {
  it("builds cache key without auth fields", () => {
    const key = buildFinlifeHttpCacheKey({
      kind: "deposit",
      topFinGrpNo: "020000",
      pageNo: 1,
      pageSize: 50,
      scan: "page",
      maxPages: 1,
    });

    expect(key).toContain("deposit?");
    expect(key).toContain("topFinGrpNo=020000");
    expect(key).not.toContain("auth=");
  });

  it("returns bypass when force flag is enabled", () => {
    const decision = resolveFinlifeHttpCacheState({
      forceBypass: true,
      cacheKey: "deposit?topFinGrpNo=020000&pageNo=1&pageSize=50&scan=page&maxPages=1",
      nowMs: Date.now(),
      cacheStore: new Map(),
    });

    expect(decision.state).toBe("bypass");
    expect(decision.entry).toBeNull();
  });
});
