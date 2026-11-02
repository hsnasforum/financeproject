import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSourceStatuses } from "../src/lib/dataSources/registry";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";

// Synthetic AP01 rows and test-only credentials; no live request is made.
const usdQuote = {
  result: 1, cur_unit: "USD", cur_nm: "미국 달러", ttb: "1,317.2", tts: "1,343.8",
  deal_bas_r: "1,330.5", bkpr: "1,330", yy_efee_r: "0", ten_dd_efee_r: "0",
  kftc_deal_bas_r: "1,330.5", kftc_bkpr: "1,330",
};
const KEXIM_KEY = "TEST_ONLY_KEXIM_KEY_1";
const EXIM_KEY = "TEST_ONLY_EXIM_KEY_2";
const EXIM_URL = "https://exim.example.test/site/program/financial/exchangeJSON";

type Captured = { host: string; pathname: string; params: Record<string, string> };

function captureFetch(status = 200): Captured[] {
  const requests: Captured[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    requests.push({ host: url.host, pathname: url.pathname, params: Object.fromEntries(url.searchParams) });
    return new Response(JSON.stringify(status === 200 ? [usdQuote] : { error: "test" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return requests;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T03:00:00.000Z"));
  for (const key of ["KEXIM_API_KEY", "KEXIM_FX_API_URL", "EXIM_EXCHANGE_API_KEY", "EXIM_EXCHANGE_API_URL", "EXIM_EXCHANGE_KEY_PARAM"]) {
    vi.stubEnv(key, undefined);
  }
  vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FX calculator credential pairs", () => {
  it("keeps an explicit KEXIM key first with its own endpoint", async () => {
    vi.stubEnv("KEXIM_API_KEY", KEXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_URL", EXIM_URL);
    const requests = captureFetch();

    const result = await getExchangeQuotes("20261008", ["USD"]);

    expect(result.ok).toBe(true);
    expect(requests).toEqual([{
      host: "oapi.koreaexim.go.kr",
      pathname: "/site/program/financial/exchangeJSON",
      params: { authkey: KEXIM_KEY, data: "AP01", searchdate: "20261008" },
    }]);
  });

  it("reads the same AP01 contract with the configured EXIM key and EXIM URL when no KEXIM key exists", async () => {
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_URL", `${EXIM_URL}?ignored=1`);
    vi.stubEnv("KEXIM_FX_API_URL", "https://kexim-only.example.test/fx");
    const requests = captureFetch();

    const result = await getExchangeQuotes("20261008", ["USD"]);

    expect(requests).toEqual([{
      host: "exim.example.test",
      pathname: "/site/program/financial/exchangeJSON",
      params: { authkey: EXIM_KEY, data: "AP01", searchdate: "20261008" },
    }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({ currency: "USD", rate: 1330.5, asOfDate: "2026-10-08" });
    expect(result.meta.provenance).toMatchObject({ mode: "live", degraded: false, asOf: "2026-10-08" });
    expect(JSON.stringify(result)).not.toContain(EXIM_KEY);
    expect(JSON.stringify(result)).not.toContain("exim.example.test");
  });

  it("uses the EXIM key parameter name that belongs to the EXIM pair", async () => {
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_URL", EXIM_URL);
    vi.stubEnv("EXIM_EXCHANGE_KEY_PARAM", "serviceKey");
    const requests = captureFetch();

    await getExchangeQuotes("20261008", ["USD"]);

    expect(requests[0]?.params).toEqual({ serviceKey: EXIM_KEY, data: "AP01", searchdate: "20261008" });
  });

  it.each([
    { name: "missing URL", url: undefined },
    { name: "non-https URL", url: "http://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON" },
    { name: "invalid URL", url: "https://" },
  ])("never sends the EXIM key with an unusable EXIM URL: $name", async ({ url }) => {
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    if (url !== undefined) vi.stubEnv("EXIM_EXCHANGE_API_URL", url);
    const requests = captureFetch();

    const strict = await getExchangeQuotes("20261008", ["USD"]);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.code).toBe("CONFIG");
    expect(JSON.stringify(strict)).not.toContain(EXIM_KEY);

    vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    const fallback = await getExchangeQuotes("20261008", ["USD"]);
    expect(fallback.ok).toBe(true);
    if (fallback.ok) expect(fallback.meta.provenance).toMatchObject({ mode: "mock", degraded: true, degradedReason: "env-missing" });
    expect(requests).toEqual([]);
  });

  it("keeps the existing no-key policy when neither key exists", async () => {
    const requests = captureFetch();
    const strict = await getExchangeQuotes("20261008", ["USD"]);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.code).toBe("CONFIG");

    vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    const fallback = await getExchangeQuotes("20261008", ["USD"]);
    expect(fallback.ok).toBe(true);
    if (fallback.ok) expect(fallback.meta.provenance).toMatchObject({ mode: "mock", degradedReason: "env-missing" });
    expect(requests).toEqual([]);
  });

  it("describes in data source settings which keys the calculator and the market rate use", () => {
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_URL", EXIM_URL);
    const exim = getDataSourceStatuses().find((source) => source.id === "EXIM_EXCHANGE");
    expect(exim?.status.state).toBe("configured");
    expect(exim?.env.map((entry) => [entry.key, Boolean(entry.optional)])).toEqual([
      ["EXIM_EXCHANGE_API_KEY", false],
      ["EXIM_EXCHANGE_API_URL", false],
      ["KEXIM_API_KEY", true],
    ]);
    expect(exim?.env[0]?.label).toContain("환율 계산");
    expect(JSON.stringify(exim)).not.toContain(EXIM_KEY);
  });

  it("does not silently retry a failed KEXIM request with the EXIM key", async () => {
    vi.stubEnv("KEXIM_API_KEY", KEXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_KEY", EXIM_KEY);
    vi.stubEnv("EXIM_EXCHANGE_API_URL", EXIM_URL);
    const requests = captureFetch(401);

    const result = await getExchangeQuotes("20261008", ["USD"]);

    expect(result.ok).toBe(false);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.params.authkey === KEXIM_KEY && request.host === "oapi.koreaexim.go.kr")).toBe(true);
  });
});
