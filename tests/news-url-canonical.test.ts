import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../src/lib/news/urlCanonical";

describe("news url canonical", () => {
  it("removes fragment and tracking params", () => {
    const got = canonicalizeUrl("https://Example.com/path/?utm_source=a&b=2&fbclid=z#section");
    expect(got).toBe("https://example.com/path?b=2");
  });

  it("normalizes duplicate slashes and default port", () => {
    const got = canonicalizeUrl("https://example.com:443//a//b/?z=9&gclid=1");
    expect(got).toBe("https://example.com/a/b?z=9");
  });
});
