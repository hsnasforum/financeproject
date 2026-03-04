import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchKosisSeries,
  normalizeKosisDate,
  parseKosisExternalId,
} from "../src/lib/indicators/connectors/kosis";
import { appendSeriesObservations, readSeriesObservations } from "../src/lib/indicators/store";

function mockJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("indicators kosis connector", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses externalId query DSL", () => {
    const parsed = parseKosisExternalId(
      "orgId=101&tblId=DT_1YL20631&itmId=T001&objL1=ALL&prdSe=M&startPrdDe=202001&endPrdDe=202612",
    );

    expect(parsed.orgId).toBe("101");
    expect(parsed.tblId).toBe("DT_1YL20631");
    expect(parsed.itmId).toBe("T001");
    expect(parsed.prdSe).toBe("M");
  });

  it("normalizes monthly and quarterly periods", () => {
    expect(normalizeKosisDate("202602", "M")).toBe("2026-02-01");
    expect(normalizeKosisDate("2026Q3", "Q")).toBe("2026-07-01");
  });

  it("fails safely when api key is missing", async () => {
    await expect(fetchKosisSeries({
      externalId: "orgId=101&tblId=DT_X&itmId=T001&prdSe=M",
      apiKey: "",
    })).rejects.toThrow(/KEY_MISSING/);
  });

  it("parses observations and keeps append idempotent", async () => {
    const result = await fetchKosisSeries({
      externalId: "orgId=101&tblId=DT_X&itmId=T001&prdSe=M&startPrdDe=202601&endPrdDe=202602",
      apiKey: "test-key",
      fetchImpl: async () => mockJsonResponse([
        { PRD_DE: "202601", DT: "100.5" },
        { PRD_DE: "202602", DT: "101.0" },
      ]),
    });

    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]?.date).toBe("2026-01-01");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-indicators-kosis-"));
    roots.push(root);

    const first = appendSeriesObservations("kosis_test", result.observations, root);
    const second = appendSeriesObservations("kosis_test", result.observations, root);

    expect(first.appended).toBe(2);
    expect(second.appended).toBe(0);
    expect(readSeriesObservations("kosis_test", root)).toHaveLength(2);
  });

  it("fails on non-200 response", async () => {
    await expect(fetchKosisSeries({
      externalId: "orgId=101&tblId=DT_X&itmId=T001&prdSe=M",
      apiKey: "test-key",
      fetchImpl: async () => mockJsonResponse({}, 503),
    })).rejects.toThrow(/HTTP_503/);
  });
});
