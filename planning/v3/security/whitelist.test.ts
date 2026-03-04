import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assertV3Whitelisted,
  parseWithV3Whitelist,
  sanitizeV3LogMessage,
} from "./whitelist";

describe("v3 whitelist guard", () => {
  it("allows safe persistence payloads", () => {
    const schema = z.object({
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
    });
    const parsed = parseWithV3Whitelist(schema, {
      title: "headline",
      snippet: "short summary",
      url: "https://example.test/news",
    }, { scope: "persistence", context: "unit" });
    expect(parsed.title).toBe("headline");
  });

  it("blocks fulltext/raw-like keys in persistence payloads", () => {
    expect(() => assertV3Whitelisted({
      title: "x",
      fullText: "forbidden",
    }, { scope: "persistence", context: "unit" })).toThrow(/whitelist violation/i);
  });

  it("blocks secret-like keys/values in response payloads", () => {
    expect(() => assertV3Whitelisted({
      ok: true,
      data: { apiKey: "abc123" },
    }, { scope: "response", context: "unit" })).toThrow(/secret_key/i);

    expect(() => assertV3Whitelisted({
      ok: true,
      data: { message: "token=unsafe-value" },
    }, { scope: "response", context: "unit" })).toThrow(/secret_value/i);
  });

  it("sanitizes secret-like text for logs", () => {
    const sanitized = sanitizeV3LogMessage("failed token=unsafe serviceKey=abc123");
    expect(sanitized.includes("unsafe")).toBe(false);
    expect(sanitized.includes("abc123")).toBe(false);
    expect(sanitized).toContain("[redacted]");
  });
});
