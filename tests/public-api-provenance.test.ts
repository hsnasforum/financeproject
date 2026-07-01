import { afterEach, describe, expect, it, vi } from "vitest";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";
import { getHousingSalesBenchmark } from "../src/lib/publicApis/providers/housing";
import { GET as getFxRoute } from "../src/app/api/public/fx/route";
import { createDataSourcePingSnapshot, formatDataSourcePingSummary } from "../src/lib/dataSources/pingState";

const originalEnv = {
  KEXIM_API_KEY: process.env.KEXIM_API_KEY,
  KEXIM_FX_API_URL: process.env.KEXIM_FX_API_URL,
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
