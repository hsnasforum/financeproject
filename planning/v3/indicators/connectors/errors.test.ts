import { describe, expect, it } from "vitest";
import { ConnectorError, normalizeConnectorError, sanitizeErrorMessage, shouldRetryConnectorError, toRefreshError } from "./errors";

describe("planning v3 indicators connector errors", () => {
  it("sanitizes sensitive tokens and trims whitespace", () => {
    const message = sanitizeErrorMessage("failed api_key=abc123\n token:secret-value");
    expect(message.includes("abc123")).toBe(false);
    expect(message.includes("secret-value")).toBe(false);
    expect(message.includes("\n")).toBe(false);
    expect(message).toContain("api_key=[redacted]");
  });

  it("normalizes unknown errors to INTERNAL", () => {
    const normalized = normalizeConnectorError(new Error("boom token=unsafe"));
    expect(normalized.code).toBe("INTERNAL");
    expect(normalized.message.includes("unsafe")).toBe(false);
  });

  it("maps to refresh error and retry policy", () => {
    const err = new ConnectorError("LIMIT", "429 too many requests");
    const mapped = toRefreshError(err, "fixture", "kr_cpi");
    expect(mapped.code).toBe("LIMIT");
    expect(shouldRetryConnectorError(err)).toBe(true);
    expect(shouldRetryConnectorError(new ConnectorError("INPUT", "invalid"))).toBe(false);
  });
});
