import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchFredSeries } from "../src/lib/indicators/connectors/fred";
import { appendSeriesObservations, readSeriesObservations } from "../src/lib/indicators/store";

function mockJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("indicators fred connector", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails safely when api key is missing", async () => {
    await expect(fetchFredSeries({
      externalId: "CPIAUCSL",
      apiKey: "",
    })).rejects.toThrow(/KEY_MISSING/);
  });

  it("sends bearer auth and supports start/end range", async () => {
    const observed = {
      auth: "",
      start: "",
      end: "",
    };

    const result = await fetchFredSeries({
      externalId: "CPIAUCSL",
      start: "2025-01-01",
      end: "2025-12-31",
      apiKey: "fred-test-key",
      fetchImpl: async (url, init) => {
        observed.auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
        const parsed = new URL(String(url));
        observed.start = parsed.searchParams.get("observation_start") ?? "";
        observed.end = parsed.searchParams.get("observation_end") ?? "";
        return mockJsonResponse({
          observations: [
            { date: "2025-01-01", value: "310.1" },
            { date: "2025-02-01", value: "311.5" },
          ],
        });
      },
    });

    expect(observed.auth).toBe("Bearer fred-test-key");
    expect(observed.start).toBe("2025-01-01");
    expect(observed.end).toBe("2025-12-31");
    expect(result.observations).toHaveLength(2);
  });

  it("keeps repeated appends idempotent", async () => {
    const result = await fetchFredSeries({
      externalId: "CPIAUCSL",
      apiKey: "fred-test-key",
      fetchImpl: async () => mockJsonResponse({
        observations: [
          { date: "2025-01-01", value: "310.1" },
          { date: "2025-02-01", value: "311.5" },
        ],
      }),
    });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-fred-"));
    roots.push(root);

    const first = appendSeriesObservations("fred_test", result.observations, root);
    const second = appendSeriesObservations("fred_test", result.observations, root);

    expect(first.appended).toBe(2);
    expect(second.appended).toBe(0);
    expect(readSeriesObservations("fred_test", root)).toHaveLength(2);
  });

  it("fails on non-200 response", async () => {
    await expect(fetchFredSeries({
      externalId: "CPIAUCSL",
      apiKey: "fred-test-key",
      fetchImpl: async () => mockJsonResponse({}, 401),
    })).rejects.toThrow(/HTTP_401/);
  });
});
