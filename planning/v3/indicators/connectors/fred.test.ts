import { describe, expect, it, vi } from "vitest";
import { ConnectorError } from "./errors";
import { createFredConnector } from "./fred";
import type { SeriesSpec } from "../contracts";

const SPEC: SeriesSpec = {
  id: "us_cpi",
  sourceId: "fred_main",
  externalId: "CPIAUCSL",
  name: "US CPI",
  frequency: "M",
  units: "Index",
  transform: "none",
  enabled: true,
};

function makeOptions() {
  return {
    asOf: new Date("2026-03-05T00:00:00.000Z"),
    attempt: 1,
    maxAttempts: 2,
  } as const;
}

describe("planning v3 indicators fred connector", () => {
  it("returns normalized observations sorted by date", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      observations: [
        { date: "2026-02-01", value: "120.3" },
        { date: "2026-01-01", value: "119.1" },
        { date: "2026-02-01", value: "120.4" },
        { date: "2026-03-01", value: "." },
      ],
    }), { status: 200 }));
    const connector = createFredConnector({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { NODE_ENV: "test", FRED_API_KEY: "test-key" } as NodeJS.ProcessEnv,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([
      { date: "2026-01-01", value: 119.1 },
      { date: "2026-02-01", value: 120.4 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws INPUT when key is missing", async () => {
    const connector = createFredConnector({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });

    await expect(connector.fetchSeries(SPEC, makeOptions())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "INPUT",
    });
  });

  it("retries once on 429 with deterministic backoff", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        observations: [{ date: "2026-02-01", value: "120.3" }],
      }), { status: 200 }));
    const sleepMock = vi.fn(async () => {});
    const connector = createFredConnector({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { NODE_ENV: "test", FRED_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      sleep: sleepMock,
      rateLimitRetries: 2,
      rateLimitBackoffMs: 100,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([{ date: "2026-02-01", value: 120.3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(100);
  });

  it("throws LIMIT when 429 persists", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    const connector = createFredConnector({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { NODE_ENV: "test", FRED_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      sleep: async () => {},
      rateLimitRetries: 1,
      rateLimitBackoffMs: 1,
    });

    await expect(connector.fetchSeries(SPEC, makeOptions())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "LIMIT",
    } satisfies Partial<ConnectorError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
