import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";

// Synthetic prices with the complete public AP01 response shape; never live fixtures.
const usdQuote = {
  result: 1, cur_unit: "USD", cur_nm: "미국 달러", ttb: "1,317.2", tts: "1,343.8",
  deal_bas_r: "1,330.5", bkpr: "1,330", yy_efee_r: "0", ten_dd_efee_r: "0",
  kftc_deal_bas_r: "1,330.5", kftc_bkpr: "1,330",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T17:00:00.000Z"));
  vi.stubEnv("KEXIM_API_KEY", "synthetic-test-key");
  vi.stubEnv("KEXIM_FX_API_URL", undefined);
  vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("public FX official AP01 contract", () => {
  it("uses the current default endpoint and requested date for undated successful rows", async () => {
    const requests: Array<{ host: string; pathname: string; date: string | null }> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input);
      requests.push({ host: url.host, pathname: url.pathname, date: url.searchParams.get("searchdate") });
      return new Response(JSON.stringify([
        usdQuote,
        { ...usdQuote, cur_unit: "JPY(100)", cur_nm: "일본 엔", deal_bas_r: "912" },
        { ...usdQuote, cur_unit: "KRW", cur_nm: "한국 원", deal_bas_r: "1" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await getExchangeQuotes("20261008", ["USD", "JPY", "KRW"]);

    expect(requests).toEqual([{
      host: "oapi.koreaexim.go.kr", pathname: "/site/program/financial/exchangeJSON", date: "20261008",
    }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      { asOfDate: "2026-10-08", currency: "USD", base: "KRW", rate: 1330.5, source: "한국수출입은행", fetchedAt: "2026-10-10T17:00:00.000Z" },
      { asOfDate: "2026-10-08", currency: "JPY", base: "KRW", rate: 9.12, source: "한국수출입은행", fetchedAt: "2026-10-10T17:00:00.000Z" },
      { asOfDate: "2026-10-08", currency: "KRW", base: "KRW", rate: 1, source: "한국수출입은행", fetchedAt: "2026-10-10T17:00:00.000Z" },
    ]);
    expect(result.meta.provenance).toMatchObject({ mode: "live", degraded: false, asOf: "2026-10-08" });
  });

  it.each([{ body: null }, { body: [] }])("returns NO_DATA for an empty response instead of an empty live success: $body", async ({ body }) => {
    const dates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      dates.push(new URL(input).searchParams.get("searchdate"));
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await getExchangeQuotes("20261010", ["USD"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_DATA");
    expect(dates).toEqual(["20261010"]);
  });

  it.each([
    { body: [{ ...usdQuote, result: 3 }] },
    { body: [{ ...usdQuote, deal_bas_dt: "2026-10-07" }] },
    { body: [usdQuote, { ...usdQuote }] },
    { body: [{ ...usdQuote, deal_bas_r: "0" }] },
    { body: { unexpected: "response" } },
  ])("returns SCHEMA_MISMATCH for invalid AP01 data: $body", async ({ body }) => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const result = await getExchangeQuotes("20261008", ["USD"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_MISMATCH");
  });

  it.each(["20260229", "20261012", "2026-10-08"])("rejects invalid or future request dates: %s", async (date) => {
    const dates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      dates.push(new URL(input).searchParams.get("searchdate"));
      return new Response(JSON.stringify([usdQuote]), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await getExchangeQuotes(date, ["USD"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INPUT");
    expect(dates).toEqual([]);
  });

  it.each([{ body: null }, { body: [{ ...usdQuote, result: 4 }] }])("keeps explicit mock fallback degraded for unavailable live data: $body", async ({ body }) => {
    vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "1");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const result = await getExchangeQuotes("20261008", ["USD"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.meta.provenance).toMatchObject({
      mode: "mock", degraded: true, degradedReason: "upstream-failure",
    });
  });

  // An explicit date (today included) is never moved to a previous business day.
  // The no-date policy (bounded walk back over empty days) is covered by tests/fx-default-date.test.ts.
  it("uses today's KST date explicitly without inferring the previous business day", async () => {
    const dates: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: string) => {
      dates.push(new URL(input).searchParams.get("searchdate"));
      return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await getExchangeQuotes("20261011", ["USD"]);
    expect(dates).toEqual(["20261011"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_DATA");
  });
});
