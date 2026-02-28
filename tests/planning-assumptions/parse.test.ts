import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBokInterestRates, parseBokMpcBaseRate, parseCpi } from "../../src/lib/planning/assumptions/fetchers/koreaParse";

function fixture(name: string): string {
  const filePath = path.join(process.cwd(), "tests", "fixtures", "planning-assumptions", name);
  return fs.readFileSync(filePath, "utf-8");
}

describe("planning assumptions parsers", () => {
  it("parses BOK MPC base rate", () => {
    const html = fixture("bok-mpc.html");
    expect(parseBokMpcBaseRate(html)).toBe(2.5);
  });

  it("parses BOK Interest Rates fields", () => {
    const html = fixture("bok-interest-rates-jan-2026.html");
    expect(parseBokInterestRates(html)).toEqual({
      newDepositAvgPct: 2.78,
      newLoanAvgPct: 4.24,
      depositOutstandingAvgPct: 2.86,
      loanOutstandingAvgPct: 4.74,
    });
  });

  it("parses CPI and core CPI", () => {
    const html = fixture("kostat-cpi-jan-2026.html");
    expect(parseCpi(html)).toEqual({
      cpiYoYPct: 2,
      coreCpiYoYPct: 2,
    });
  });

  it("returns empty values when pattern is missing", () => {
    const html = "<html><body><p>No matching macro values.</p></body></html>";
    expect(parseBokMpcBaseRate(html)).toBeNull();
    expect(parseBokInterestRates(html)).toEqual({});
    expect(parseCpi(html)).toEqual({});
  });
});
