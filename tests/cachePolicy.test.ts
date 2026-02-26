import { describe, expect, it } from "vitest";
import { CACHE_POLICY, getCachePolicy, getMaxAgeMs } from "../src/lib/dataSources/cachePolicy";

describe("cache policy", () => {
  it("returns policy by source id", () => {
    expect(getCachePolicy("finlife")).toEqual(CACHE_POLICY.finlife);
    expect(getCachePolicy("exchange")).toEqual(CACHE_POLICY.exchange);
  });

  it("converts maxAgeDays to milliseconds", () => {
    expect(getMaxAgeMs("gov24")).toBe(CACHE_POLICY.gov24.maxAgeDays * 24 * 60 * 60 * 1000);
  });
});
