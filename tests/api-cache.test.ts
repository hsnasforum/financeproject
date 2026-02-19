import { describe, expect, it, vi } from "vitest";
import { getApiCache, makeApiCacheKey, setApiCache } from "../src/lib/cache/apiCache";

describe("apiCache", () => {
  it("expires value by ttl", () => {
    vi.useFakeTimers();
    const key = makeApiCacheKey("fx", { pairs: "USD:1000" });
    setApiCache(key, { ok: true }, 1);
    expect(getApiCache(key)).toEqual({ ok: true });

    vi.advanceTimersByTime(1100);
    expect(getApiCache(key)).toBeNull();
    vi.useRealTimers();
  });
});
