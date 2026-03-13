import { describe, expect, it } from "vitest";
import { resolveDartBaseUrl } from "../src/lib/publicApis/dart/baseUrl";

describe("resolveDartBaseUrl", () => {
  it("prefers OPENDART_BASE_URL when both names exist", () => {
    expect(resolveDartBaseUrl({
      OPENDART_BASE_URL: "https://primary.example.com/",
      OPENDART_API_URL: "https://legacy.example.com/",
    })).toBe("https://primary.example.com");
  });

  it("falls back to legacy OPENDART_API_URL when needed", () => {
    expect(resolveDartBaseUrl({
      OPENDART_API_URL: "https://legacy.example.com/",
    })).toBe("https://legacy.example.com");
  });

  it("uses the OpenDART default when neither env is set", () => {
    expect(resolveDartBaseUrl({})).toBe("https://opendart.fss.or.kr");
  });
});
