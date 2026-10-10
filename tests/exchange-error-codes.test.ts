import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEximExchange, normalizeEximExchange, resolveExchangeBaseUrl } from "../src/lib/publicApis/providers/exchange";

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

describe("EXIM AP01 request-date provenance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T17:00:00.000Z"));
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", "synthetic-test-key");
    vi.stubEnv("EXIM_EXCHANGE_API_URL", "https://example.test/exchangeJSON");
    vi.stubEnv("EXIM_EXCHANGE_DATA", "AP01");
    vi.stubEnv("EXIM_EXCHANGE_KEY_PARAM", "authkey");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the exact successful request date and keeps the actual fetched time separate", async () => {
    const sentDates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      sentDates.push(new URL(input).searchParams.get("searchdate"));
      return new Response(JSON.stringify([
        { result: 1, cur_unit: "USD", deal_bas_r: "1,330.50" },
        { result: 1, cur_unit: "JPY(100)", deal_bas_r: "912" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await fetchEximExchange({ dateYYYYMMDD: "20261008" });

    expect(sentDates).toEqual(["20261008"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.asOf).toBe("2026-10-08");
    expect(result.data.rates).toEqual({ USD: 1330.5, JPY: 9.12 });
    expect(result.meta.provenance).toMatchObject({
      mode: "live", degraded: false, asOf: "2026-10-08", fetchedAt: "2026-10-10T17:00:00.000Z",
    });
  });

  it.each(["20260229", "20261012", "2026-10-08", "", "20261008junk"])(
    "rejects invalid or future request dates before any network request: %s",
    async (dateYYYYMMDD) => {
      const sentDates: Array<string | null> = [];
      vi.stubGlobal("fetch", async (input: string) => {
        sentDates.push(new URL(input).searchParams.get("searchdate"));
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      });
      const result = await fetchEximExchange({ dateYYYYMMDD });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INPUT");
      expect(sentDates).toEqual([]);
    },
  );

  it.each(["[]", "null"])("returns NO_DATA for %s without retrying another date", async (body) => {
    const sentDates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      sentDates.push(new URL(input).searchParams.get("searchdate"));
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await fetchEximExchange({ dateYYYYMMDD: "20261010" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_DATA");
    expect(sentDates).toEqual(["20261010"]);
  });

  it("uses the KST calendar date when no request date is supplied", async () => {
    const sentDates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      sentDates.push(new URL(input).searchParams.get("searchdate"));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });
    await fetchEximExchange();
    expect(sentDates).toEqual(["20261011"]);
  });

  it.each(["AP02", "AP03"])("rejects a non-exchange dataset before requesting it: %s", async (data) => {
    vi.stubEnv("EXIM_EXCHANGE_DATA", data);
    const requests: string[] = [];
    vi.stubGlobal("fetch", async () => {
      requests.push(data);
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await fetchEximExchange({ dateYYYYMMDD: "20261008" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INPUT");
    expect(requests).toEqual([]);
  });

  it.each([{ body: false }, { body: 42 }, { body: "not-rows" }])(
    "returns SCHEMA_MISMATCH instead of NO_DATA for a scalar payload: $body",
    async ({ body }) => {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), {
        status: 200, headers: { "content-type": "application/json" },
      }));
      const result = await fetchEximExchange({ dateYYYYMMDD: "20261008" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("SCHEMA_MISMATCH");
    },
  );
});

