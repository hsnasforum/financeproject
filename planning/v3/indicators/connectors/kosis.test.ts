import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendSeriesObservations, readSeriesObservations } from "../store";
import { createKosisConnector, parseKosisExternalId } from "./kosis";
import type { SeriesSpec } from "../contracts";

const SPEC: SeriesSpec = {
  id: "kosis_kr_cpi",
  sourceId: "kosis_kr",
  externalId: "orgId=101;tblId=DT_1YL20631;itmId=T001;objL1=ALL;prdSe=M;startPrdDe=202001;endPrdDe=202612",
  name: "KOSIS Korea CPI",
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

describe("planning v3 indicators kosis connector", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses serialized externalId spec", () => {
    const parsed = parseKosisExternalId(SPEC.externalId);
    expect(parsed.orgId).toBe("101");
    expect(parsed.tblId).toBe("DT_1YL20631");
    expect(parsed.itmId).toBe("T001");
    expect(parsed.prdSe).toBe("M");
    expect(parsed.startPrdDe).toBe("202001");
  });

  it("returns INPUT when key is missing", async () => {
    const connector = createKosisConnector({
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(connector.fetchSeries(SPEC, makeOptions())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "INPUT",
    });
  });

  it("normalizes dates/numbers and keeps append idempotent", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { PRD_DE: "202601", DT: "100.5" },
      { PRD_DE: "202602", DT: "101.0" },
      { PRD_DE: "202602", DT: "101.2" },
      { PRD_DE: "202603", DT: "." },
    ]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const connector = createKosisConnector({
      env: { NODE_ENV: "test", KOSIS_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([
      { date: "2026-01", value: 100.5 },
      { date: "2026-02", value: 101.2 },
    ]);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-kosis-store-"));
    roots.push(root);
    const first = appendSeriesObservations(SPEC.id, result.observations, root);
    const second = appendSeriesObservations(SPEC.id, result.observations, root);
    expect(first.appended).toBe(2);
    expect(second.appended).toBe(0);
    expect(readSeriesObservations(SPEC.id, root).length).toBe(2);
  });

  it("retries on 429 and succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ PRD_DE: "202601", DT: "100.5" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const sleepMock = vi.fn(async () => {});
    const connector = createKosisConnector({
      env: { NODE_ENV: "test", KOSIS_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: sleepMock,
      limitRetries: 2,
      backoffMs: 100,
    });

    const result = await connector.fetchSeries(SPEC, makeOptions());
    expect(result.observations).toEqual([{ date: "2026-01", value: 100.5 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(100);
  });
});
