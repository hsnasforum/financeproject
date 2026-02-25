import { describe, expect, it } from "vitest";
import { normalizeEximExchange, resolveExchangeBaseUrl } from "../src/lib/publicApis/providers/exchange";

describe("exchange url and error branching helpers", () => {
  it("strips query parameters from EXIM_EXCHANGE_API_URL", () => {
    const resolved = resolveExchangeBaseUrl("https://api.example.com/path/to/exim?authkey=secret&x=1");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.baseUrl).toBe("https://api.example.com/path/to/exim");
  });

  it("returns ENV_INVALID_URL when protocol is missing", () => {
    const resolved = resolveExchangeBaseUrl("api.example.com/path");
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe("ENV_INVALID_URL");
  });

  it("returns null for empty row data", () => {
    const normalized = normalizeEximExchange({ data: [] }, "https://api.example.com/path");
    expect(normalized).toBeNull();
  });
});

