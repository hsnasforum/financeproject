import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildExchangeSchemaReport, buildFinlifeRawSchemaReport, buildGov24SchemaReport } from "../src/lib/publicApis/schemaReport";

function loadFixture(name: string): unknown {
  const file = join(process.cwd(), "tests", "fixtures", name);
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("schema drift report snapshot", () => {
  it("matches gov24 sample schema baseline", () => {
    const raw = loadFixture("benefits_serviceList.sample.json");
    const report = buildGov24SchemaReport(raw, 20);
    const expected = loadFixture("schema_report.gov24.sample.json");
    expect(report).toEqual(expected);
  });

  it("matches exchange sample schema baseline", () => {
    const raw = loadFixture("exim_exchange.sample.json");
    const report = buildExchangeSchemaReport(raw, 20);
    const expected = loadFixture("schema_report.exchange.sample.json");
    expect(report).toEqual(expected);
  });

  it("matches finlife sample schema baseline", () => {
    const raw = loadFixture("finlife_deposit.raw.sample.json");
    const report = buildFinlifeRawSchemaReport(raw, 20);
    const expected = loadFixture("schema_report.finlife.sample.json");
    expect(report).toEqual(expected);
  });
});
