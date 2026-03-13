import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createEcosConnector, parseEcosExternalId } from "./ecos";
import type { SeriesSpec } from "../contracts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(THIS_DIR, "..", "fixtures", "ecos");

const SPEC: SeriesSpec = {
  id: "ecos_kr_base_rate",
  sourceId: "ecos_bok",
  externalId: "722Y001|0101000|||M|202001|202612",
  name: "ECOS Korea Base Rate",
  frequency: "M",
  units: "%",
  transform: "none",
  enabled: true,
};

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
}

function makeOptions() {
  return {
    asOf: new Date("2026-03-05T00:00:00.000Z"),
    attempt: 1,
    maxAttempts: 2,
  } as const;
}

describe("planning v3 indicators ecos connector", () => {
  it("parses SSOT externalId format", () => {
    const parsed = parseEcosExternalId("722Y001|0101000|||M|202001|202612");
    expect(parsed).toEqual({
      statCode: "722Y001",
      itemCode1: "0101000",
      itemCode2: "?",
      itemCode3: "?",
      cycle: "M",
      start: "202001",
      end: "202612",
    });
  });

  it("returns INPUT when api key is missing", async () => {
    const connector = createEcosConnector({
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(connector.fetchSeries(SPEC, makeOptions())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "INPUT",
    });
  });

  it("normalizes JSON response to numeric observations only", async () => {
    const fetchMock = vi.fn(async () => new Response(readFixture("sample-response.json"), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const connector = createEcosConnector({
      env: { NODE_ENV: "test", BOK_ECOS_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([
      { date: "2024-01", value: 3.5 },
      { date: "2024-02", value: 3.5 },
      { date: "2024-03", value: 3.5 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports CSV response normalization", async () => {
    const fetchMock = vi.fn(async () => new Response(readFixture("sample-response.csv"), {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
    }));
    const connector = createEcosConnector({
      env: { NODE_ENV: "test", ECOS_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([
      { date: "2024-01", value: 3.5 },
      { date: "2024-02", value: 3.5 },
      { date: "2024-03", value: 3.5 },
    ]);
  });

  it("retries on 429 and then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(readFixture("sample-response.json"), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const sleepMock = vi.fn(async () => {});
    const connector = createEcosConnector({
      env: { NODE_ENV: "test", BOK_ECOS_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: sleepMock,
      limitRetries: 2,
      backoffMs: 100,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations.length).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(100);
  });
});
