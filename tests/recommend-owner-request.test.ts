import { describe, expect, it } from "vitest";
import { isLocalRequest } from "../src/lib/dev/localRequest";
import { buildRecommendOwnerRequest } from "../src/lib/recommend/ownerRequest";

const INVALID_RECOMMEND_REQUEST_URL = "https://recommend.invalid/recommend";

function nextLocalHeaders(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    host: "127.0.0.1:3200",
    "x-forwarded-for": "127.0.0.1",
    "x-forwarded-host": "127.0.0.1:3200",
    "x-forwarded-port": "3200",
    "x-forwarded-proto": "http",
    ...overrides,
  });
}

describe("buildRecommendOwnerRequest", () => {
  it("preserves a direct Next.js loopback request for trusted local auth", () => {
    const request = buildRecommendOwnerRequest(nextLocalHeaders());

    expect(request.url).toBe("http://127.0.0.1:3200/recommend");
    expect(isLocalRequest(request)).toBe(true);
  });

  it("does not let a forwarded loopback value make a remote Host local", () => {
    const request = buildRecommendOwnerRequest(nextLocalHeaders({
      host: "example.com",
      "x-forwarded-host": "127.0.0.1:3200",
    }));

    expect(isLocalRequest(request)).toBe(false);
  });

  it("does not trust an external forwarded peer on a loopback Host", () => {
    const request = buildRecommendOwnerRequest(nextLocalHeaders({
      "x-forwarded-for": "203.0.113.10",
    }));

    expect(isLocalRequest(request)).toBe(false);
  });

  it("fails closed for an invalid forwarded protocol", () => {
    const request = buildRecommendOwnerRequest(nextLocalHeaders({
      "x-forwarded-proto": "javascript",
    }));

    expect(request.url).toBe(INVALID_RECOMMEND_REQUEST_URL);
    expect(isLocalRequest(request)).toBe(false);
  });

  it.each([
    "user@127.0.0.1:3200",
    "127.0.0.1:3200?spoofed=1",
    "127.0.0.1:3200#spoofed",
  ])("fails closed for a malformed Host header: %s", (host) => {
    const request = buildRecommendOwnerRequest(nextLocalHeaders({ host, "x-forwarded-host": host }));

    expect(request.url).toBe(INVALID_RECOMMEND_REQUEST_URL);
    expect(isLocalRequest(request)).toBe(false);
  });
});
