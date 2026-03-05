import { describe, expect, it } from "vitest";
import { fetchEcosSeries, parseEcosExternalId } from "../src/lib/indicators/connectors/ecos";

function mockJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("indicators ecos connector", () => {
  it("parses externalId with 7 fields", () => {
    const parsed = parseEcosExternalId("722Y001|0101000|||M|202001|202612");
    expect(parsed.statCode).toBe("722Y001");
    expect(parsed.itemCode1).toBe("0101000");
    expect(parsed.cycle).toBe("M");
  });

  it("fails safely when api key is missing", async () => {
    await expect(fetchEcosSeries({
      externalId: "722Y001|0101000|||M|202001|202612",
      apiKey: "",
    })).rejects.toThrow(/KEY_MISSING/);
  });

  it("parses observations from ECOS response", async () => {
    const result = await fetchEcosSeries({
      externalId: "722Y001|0101000|||M|202001|202612",
      apiKey: "test-key",
      fetchImpl: async () => mockJsonResponse({
        StatisticSearch: {
          RESULT: { CODE: "INFO-000", MESSAGE: "OK" },
          row: [
            { TIME: "202601", DATA_VALUE: "3.25" },
            { TIME: "202602", DATA_VALUE: "3.50" },
          ],
        },
      }),
    });

    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]?.date).toBe("2026-01-01");
    expect(result.observations[1]?.value).toBe(3.5);
  });

  it("fails on non-200 response", async () => {
    await expect(fetchEcosSeries({
      externalId: "722Y001|0101000|||M|202001|202612",
      apiKey: "test-key",
      fetchImpl: async () => mockJsonResponse({}, 500),
    })).rejects.toThrow(/HTTP_500/);
  });
});
