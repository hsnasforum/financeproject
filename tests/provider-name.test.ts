import { describe, expect, it } from "vitest";
import { isLikelyFuzzyProviderMatch, normalizeProviderName } from "../src/lib/sources/providerName";

describe("normalizeProviderName", () => {
  it("matches 주식회사 카카오뱅크 and 카카오뱅크", () => {
    expect(normalizeProviderName("주식회사 카카오뱅크")).toBe(normalizeProviderName("카카오뱅크"));
  });

  it("matches 토스뱅크 주식회사 and 토스뱅크", () => {
    expect(normalizeProviderName("토스뱅크 주식회사")).toBe(normalizeProviderName("토스뱅크"));
  });

  it("matches ㈜OO은행 and OO은행", () => {
    expect(normalizeProviderName("㈜OO은행")).toBe(normalizeProviderName("OO은행"));
  });
});

describe("isLikelyFuzzyProviderMatch", () => {
  it("does not match unrelated providers", () => {
    const a = normalizeProviderName("국민은행");
    const b = normalizeProviderName("기업은행");
    expect(isLikelyFuzzyProviderMatch(a, b)).toBe(false);
  });

  it("does not match when one side is too short", () => {
    const a = normalizeProviderName("하나은행");
    const b = normalizeProviderName("은행");
    expect(isLikelyFuzzyProviderMatch(a, b)).toBe(false);
  });
});
