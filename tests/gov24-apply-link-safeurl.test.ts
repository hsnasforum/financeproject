import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "../src/lib/url/safeExternalUrl";

describe("gov24 apply link safe url", () => {
  it("allows http/https external links", () => {
    expect(safeExternalUrl("https://www.gov.kr/apply")).toBe("https://www.gov.kr/apply");
    expect(safeExternalUrl("http://example.org/path?q=1")).toBe("http://example.org/path?q=1");
  });

  it("blocks dangerous or invalid schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
});
