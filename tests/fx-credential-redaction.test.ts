import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeQuotes } from "../src/lib/publicApis/providers/fx";
import { fetchEximExchange } from "../src/lib/publicApis/providers/exchange";

// Test-only value; fetch is replaced at the network boundary in every case.
const secret = "SYNTHETIC_EXIM +/%=雪";
const endpoint = "https://example.test/exchangeJSON";
const providers = [
  { name: "fx", call: () => getExchangeQuotes("20261016", ["USD"]) },
  { name: "exchange", call: () => fetchEximExchange({ dateYYYYMMDD: "20261016" }) },
] as const;
function expectNoSecret(value: unknown): void {
  const text = JSON.stringify(value).toLowerCase();
  expect([secret, encodeURIComponent(secret), new URLSearchParams({ v: secret }).toString().slice(2)]
    .some((variant) => text.includes(variant.toLowerCase()))).toBe(false);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T03:00:00.000Z"));
  vi.stubEnv("KEXIM_API_KEY", undefined);
  vi.stubEnv("KEXIM_FX_API_URL", undefined);
  vi.stubEnv("EXIM_EXCHANGE_API_KEY", secret);
  vi.stubEnv("EXIM_EXCHANGE_API_URL", endpoint + "?ignored=1");
  vi.stubEnv("EXIM_EXCHANGE_KEY_PARAM", "CrEdEnTiAl");
  vi.stubEnv("EXIM_EXCHANGE_DATA", "AP01");
  vi.stubEnv("PUBLIC_APIS_FALLBACK_TO_MOCK", "0");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(providers)("$name credential boundary", ({ call }) => {
  it.each(["401", "500", "network", "timeout"] as const)(
    "keeps the custom credential out of logs and returned JSON on %s",
    async (failure) => {
      const logs: unknown[][] = [];
      const requests: URL[] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args); });
      vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        requests.push(url);
        if (failure === "network") throw new TypeError("socket closed " + input);
        if (failure === "timeout") {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted " + input);
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
        return new Response("denied", { status: Number(failure), headers: { "retry-after": "0" } });
      });

      const pending = call();
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(requests).toHaveLength(failure === "500" ? 3 : 1);
      expect(requests.every((url) => url.origin + url.pathname === endpoint
        && url.searchParams.get("CrEdEnTiAl") === secret
        && url.searchParams.get("searchdate") === "20261016"
        && url.searchParams.get("data") === "AP01"
        && !url.searchParams.has("ignored"))).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expectNoSecret(logs);
      expectNoSecret(result);
    },
  );
});
