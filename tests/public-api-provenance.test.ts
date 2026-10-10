import { afterEach, describe, expect, it, vi } from "vitest";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";
import { getHousingSalesBenchmark } from "../src/lib/publicApis/providers/housing";
import { GET as getFxRoute } from "../src/app/api/public/fx/route";
import { createDataSourcePingSnapshot, formatDataSourcePingSummary } from "../src/lib/dataSources/pingState";

const originalEnv = {
  KEXIM_API_KEY: process.env.KEXIM_API_KEY,
  KEXIM_FX_API_URL: process.env.KEXIM_FX_API_URL,
  API_CACHE_STORE: process.env.API_CACHE_STORE,
  MOLIT_SALES_API_KEY: process.env.MOLIT_SALES_API_KEY,
  MOLIT_SALES_API_URL: process.env.MOLIT_SALES_API_URL,
  PUBLIC_APIS_FALLBACK_TO_MOCK: process.env.PUBLIC_APIS_FALLBACK_TO_MOCK,
};

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "string") env[name] = value;
  else delete env[name];
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnv)) {
    setEnv(key, value);
  }
});

describe("public API provenance contract", () => {
  it("marks FX mock fallback as degraded provenance when the API key is missing", async () => {
    setEnv("KEXIM_API_KEY", undefined);
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);

    const result = await getExchangeQuotes("", ["USD"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.provenance).toMatchObject({
      mode: "mock",
      degraded: true,
      degradedReason: "env-missing",
    });
    expect(result.data[0]?.source).not.toContain("(mock)");
  });

  it("returns CONFIG instead of silent mock when FX fallback is disabled and the key is missing", async () => {
    setEnv("KEXIM_API_KEY", undefined);
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");

    const result = await getExchangeQuotes("", ["USD"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG");
  });

  it("marks FX upstream failure fallback as degraded mock provenance", async () => {
    setEnv("KEXIM_API_KEY", "test-key");
    setEnv("KEXIM_FX_API_URL", "https://example.test/fx");
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));

    const result = await getExchangeQuotes("20260102", ["USD"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.provenance).toMatchObject({
      mode: "mock",
      degraded: true,
      degradedReason: "upstream-failure",
    });
    expect(result.meta.provenance.upstreamStatus).toBe(500);
  });

  it("marks FX timeout fallback with a distinct degraded reason", async () => {
    setEnv("KEXIM_API_KEY", "test-key");
    setEnv("KEXIM_FX_API_URL", "https://example.test/fx");
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }));

    const result = await getExchangeQuotes("20260102", ["USD"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.provenance).toMatchObject({
      mode: "mock",
      degraded: true,
      degradedReason: "timeout",
    });
  });

  it("keeps FX provenance visible on the public route response", async () => {
    setEnv("KEXIM_API_KEY", undefined);
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);

    const response = await getFxRoute(new Request("http://localhost/api/public/fx?date=20990101&pairs=USD:1234"));
    const json = await response.json() as { ok?: boolean; meta?: { provenance?: { mode?: string; degraded?: boolean } } };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.meta?.provenance).toMatchObject({
      mode: "mock",
      degraded: true,
    });
  });

  it("normalizes generic EXIM currency batch units before calculating KRW", async () => {
    setEnv("KEXIM_API_KEY", "test-key");
    setEnv("KEXIM_FX_API_URL", "https://example.test/fx");
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
    setEnv("API_CACHE_STORE", "memory");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { result: 1, cur_unit: "JPY(100)", deal_bas_r: "912.00", deal_bas_dt: "20260901" },
      { result: 1, cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "20260901" },
    ]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const response = await getFxRoute(new Request(
      "http://localhost/api/public/fx?date=20260901&pairs=JPY:50000,USD:2",
    ));
    const json = await response.json() as {
      data?: { items?: Array<{ currency?: string; rate?: number | null; krw?: number | null }> };
      meta?: { provenance?: { mode?: string; degraded?: boolean; asOf?: string } };
    };

    expect(response.status).toBe(200);
    expect(json.data?.items?.[0]).toMatchObject({
      currency: "JPY",
      rate: 9.12,
      asOfDate: "2026-09-01",
    });
    expect(json.data?.items?.[0]?.krw).toBeCloseTo(456_000, 8);
    expect(json.data?.items?.[1]).toEqual({
      currency: "USD",
      amount: 2,
      rate: 1_330.5,
      asOfDate: "2026-09-01",
      krw: 2_661,
    });
    expect(json.meta?.provenance).toMatchObject({ mode: "live", degraded: false, asOf: "2026-09-01" });
  });

  it.each([
    ["missing", undefined],
    ["invalid", "2026-02-30"],
  ] as const)("rejects a live FX row with %s date and no official success result", async (_label, dealBasDate) => {
    setEnv("KEXIM_API_KEY", "test-key");
    setEnv("KEXIM_FX_API_URL", "https://example.test/fx-kst-fallback");
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
    setEnv("API_CACHE_STORE", "memory");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { cur_unit: "USD", deal_bas_r: "1,330.50", ...(dealBasDate ? { deal_bas_dt: dealBasDate } : {}) },
    ]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await getExchangeQuotes("20260901", ["USD"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_MISMATCH");
  });

  it.each([
    "JPY(0)",
    "ABC(-100)",
    "ABC(1.5)",
    "JPY(9007199254740992)",
    "JPY(foo)",
  ])("rejects an invalid live FX multiplier instead of dividing with scale one: %s", async (currencyUnit) => {
    setEnv("KEXIM_API_KEY", "test-key");
    setEnv("KEXIM_FX_API_URL", "https://example.test/fx-invalid-unit");
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { result: 1, cur_unit: currencyUnit, deal_bas_r: "912.00", deal_bas_dt: "20260901" },
    ]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await getExchangeQuotes("20260901", ["JPY"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_MISMATCH");
  });

  it("marks housing mock fallback as degraded provenance when the sales API key is missing", async () => {
    setEnv("MOLIT_SALES_API_KEY", undefined);
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", undefined);

    const result = await getHousingSalesBenchmark("11680", "202401", "84");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.provenance).toMatchObject({
      mode: "mock",
      degraded: true,
      degradedReason: "env-missing",
    });
    expect(result.data.source).not.toContain("(mock)");
  });

  it("returns CONFIG instead of silent mock when housing fallback is disabled and the key is missing", async () => {
    setEnv("MOLIT_SALES_API_KEY", undefined);
    setEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");

    const result = await getHousingSalesBenchmark("11680", "202401", "84");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG");
  });

  it("keeps degraded provenance visible in data source ping summaries", () => {
    const summary = {
      month: "202401",
      count: 4,
      provenance: {
        mode: "mock",
        degraded: true,
        degradedReason: "env-missing",
      },
    };

    expect(formatDataSourcePingSummary(summary)).toContain("출처 mock");
    expect(formatDataSourcePingSummary(summary)).toContain("주의 env-missing");

    const snapshot = createDataSourcePingSnapshot({
      source: "molit_sales",
      success: false,
      fetchedAt: "2026-06-28T00:00:00.000Z",
      summary,
    });

    expect(snapshot?.statusLabel).toBe("주의");
    expect(snapshot?.details).toContainEqual({ label: "출처", value: "mock" });
    expect(snapshot?.details).toContainEqual({ label: "주의", value: "env-missing" });
  });
});
