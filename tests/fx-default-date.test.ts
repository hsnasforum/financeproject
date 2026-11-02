import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getFxRoute } from "../src/app/api/public/fx/route";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";

// Test-only fake clock (Sunday 2026-10-18 12:00 KST), synthetic AP01 rows and test-only credentials.
const EXIM_KEY = "TEST_ONLY_EXIM_DEFAULT_DATE_KEY";
const EXIM_URL = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
const usdQuote = {
  result: 1, cur_unit: "USD", cur_nm: "미국 달러", ttb: "1,334.9", tts: "1,362.1",
  deal_bas_r: "1,348.5", bkpr: "1,348", yy_efee_r: "0", ten_dd_efee_r: "0",
  kftc_deal_bas_r: "1,348.5", kftc_bkpr: "1,348",
};

type Reply = { status?: number; body?: unknown; throws?: boolean };

function stubAp01(byDate: Record<string, Reply>, fallback: Reply = { body: [] }): string[] {
  const dates: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const date = new URL(input).searchParams.get("searchdate") ?? "";
    dates.push(date);
    const reply = byDate[date] ?? fallback;
    if (reply.throws) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return dates;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T03:00:00.000Z"));
  vi.stubEnv("KEXIM_API_KEY", undefined);
  vi.stubEnv("KEXIM_FX_API_URL", undefined);
  vi.stubEnv("EXIM_EXCHANGE_KEY_PARAM", undefined);
  vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
  vi.stubEnv("EXIM_EXCHANGE_API_URL", EXIM_URL);
  vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
  vi.stubEnv("API_CACHE_STORE", "memory");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FX calculator date policy", () => {
  it("without a date, walks back from today only past NO_DATA days and returns the real disclosure date", async () => {
    const dates = stubAp01({ "20261016": { body: [usdQuote] } });

    const result = await getExchangeQuotes("", ["USD"]);

    expect(dates).toEqual(["20261018", "20261017", "20261016"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([expect.objectContaining({ currency: "USD", rate: 1348.5, asOfDate: "2026-10-16" })]);
    expect(result.meta.provenance).toMatchObject({ mode: "live", degraded: false, asOf: "2026-10-16" });
    expect(JSON.stringify(result)).not.toContain(EXIM_KEY);
  });

  it("an explicit Sunday date asks only for that date and keeps NO_DATA", async () => {
    const dates = stubAp01({ "20261016": { body: [usdQuote] } });

    const result = await getExchangeQuotes("20261018", ["USD"]);

    expect(dates).toEqual(["20261018"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_DATA");
  });

  it("an explicit Sunday date with the default mock policy stays a labelled mock after one request", async () => {
    vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    const dates = stubAp01({ "20261016": { body: [usdQuote] } });

    const result = await getExchangeQuotes("20261018", ["USD"]);

    expect(dates).toEqual(["20261018"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.provenance).toMatchObject({ mode: "mock", degraded: true, degradedReason: "upstream-failure" });
  });

  it("an explicit Friday date asks once and succeeds", async () => {
    const dates = stubAp01({ "20261016": { body: [usdQuote] } });
    const result = await getExchangeQuotes("20261016", ["USD"]);
    expect(dates).toEqual(["20261016"]);
    expect(result.ok).toBe(true);
  });

  it("stops after today and 7 previous days when every day is empty, keeping the existing error and mock policies", async () => {
    const dates = stubAp01({});
    const strict = await getExchangeQuotes("", ["USD"]);
    expect(dates).toEqual(["20261018", "20261017", "20261016", "20261015", "20261014", "20261013", "20261012", "20261011"]);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.code).toBe("NO_DATA");

    vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    dates.length = 0;
    const fallback = await getExchangeQuotes("", ["USD"]);
    expect(dates).toHaveLength(8);
    expect(fallback.ok).toBe(true);
    if (fallback.ok) expect(fallback.meta.provenance).toMatchObject({ mode: "mock", degradedReason: "upstream-failure" });
  });

  it.each([
    { name: "auth error", reply: { status: 401, body: { error: "unauthorized" } } },
    { name: "schema mismatch", reply: { body: [{ ...usdQuote, result: 3 }] } },
    { name: "network error", reply: { throws: true } },
  ])("does not try another date after a non-NO_DATA failure: $name", async ({ reply }) => {
    const dates = stubAp01({ "20261018": reply, "20261016": { body: [usdQuote] } });
    const result = await getExchangeQuotes("", ["USD"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe("NO_DATA");
    expect(new Set(dates)).toEqual(new Set(["20261018"]));
  });

  it("does not walk back when the day has rows but not the requested currency", async () => {
    const dates = stubAp01({ "20261018": { body: [{ ...usdQuote, cur_unit: "EUR", cur_nm: "유로" }] }, "20261016": { body: [usdQuote] } });
    const result = await getExchangeQuotes("", ["USD"]);
    expect(dates).toEqual(["20261018"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_DATA");
  });

  it("makes no request without any configured key", async () => {
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", undefined);
    const dates = stubAp01({});
    const result = await getExchangeQuotes("", ["USD"]);
    expect(dates).toEqual([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG");
  });

  it("the calculator route without a date returns the real disclosure date in items and provenance", async () => {
    const dates = stubAp01({ "20261016": { body: [usdQuote] } });
    const response = await getFxRoute(new Request("http://localhost/api/public/fx?pairs=USD:1000"));
    const json = await response.json() as { ok: boolean; data: { items: Array<{ asOfDate: string | null; rate: number | null }> }; meta: { provenance: { mode: string; asOf?: string } } };

    expect(dates).toEqual(["20261018", "20261017", "20261016"]);
    expect(json.ok).toBe(true);
    expect(json.data.items[0]).toMatchObject({ rate: 1348.5, asOfDate: "2026-10-16" });
    expect(json.meta.provenance).toMatchObject({ mode: "live", asOf: "2026-10-16" });
    expect(JSON.stringify(json)).not.toContain(EXIM_KEY);
  });
});
