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

  it.each([
    ["https://opendart.fss.or.kr/api", "https://opendart.fss.or.kr"],
    ["https://opendart.fss.or.kr/api/", "https://opendart.fss.or.kr"],
    ["https://opendart.fss.or.kr/API", "https://opendart.fss.or.kr"],
    ["https://opendart.fss.or.kr/apis", "https://opendart.fss.or.kr/apis"],
  ])("does not double the /api path for legacy OPENDART_API_URL=%s", (legacy, expected) => {
    expect(resolveDartBaseUrl({ OPENDART_API_URL: legacy })).toBe(expected);
  });

  it("also accepts OPENDART_BASE_URL written with the /api path", () => {
    expect(resolveDartBaseUrl({ OPENDART_BASE_URL: "https://opendart.fss.or.kr/api/" })).toBe("https://opendart.fss.or.kr");
  });
});
