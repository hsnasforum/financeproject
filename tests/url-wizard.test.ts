import { describe, expect, it } from "vitest";
import { extractBaseUrlFromSample } from "../src/lib/dev/urlWizard";

describe("urlWizard", () => {
  it("extracts base url and redacts sensitive query values", () => {
    const result = extractBaseUrlFromSample("https://api.example.com/v1/items?serviceKey=ABC123&pageNo=1");
    expect(result.baseUrl).toBe("https://api.example.com/v1/items");
    expect(result.sanitizedPreview).toContain("serviceKey=%3CREDACTED%3E");
    expect(result.sanitizedPreview).not.toContain("ABC123");
  });

  it("returns error for invalid input", () => {
    const result = extractBaseUrlFromSample("not-a-url");
    expect(result.error).toBeTruthy();
    expect(result.baseUrl).toBeUndefined();
  });

  it("auto-prefixes https when scheme is missing", () => {
    const result = extractBaseUrlFromSample("api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail");
    expect(result.baseUrl).toBe("https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail");
    expect(result.warnings.some((w) => w.includes("https://"))).toBe(true);
  });
});
