import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchKoreaAssumptions } from "../../src/lib/planning/assumptions/fetchers/korea";

function fixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "planning-assumptions", name),
    "utf-8",
  );
}

function ecosResponse(): Response {
  const rows = JSON.parse(fixture("ecos-key-stats.json")) as unknown[];
  return new Response(JSON.stringify({ KeyStatisticList: { row: rows } }), { status: 200 });
}

describe("fetchKoreaAssumptions", () => {
  const originalFetch = globalThis.fetch;
  const originalEcosEnabled = process.env.ECOS_ENABLED;
  const originalEcosApiKey = process.env.BOK_ECOS_API_KEY;

  beforeEach(() => {
    process.env.ECOS_ENABLED = "true";
    process.env.BOK_ECOS_API_KEY = "test-ecos-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (typeof originalEcosEnabled === "string") process.env.ECOS_ENABLED = originalEcosEnabled;
    else delete process.env.ECOS_ENABLED;
    if (typeof originalEcosApiKey === "string") process.env.BOK_ECOS_API_KEY = originalEcosApiKey;
    else delete process.env.BOK_ECOS_API_KEY;
  });

  it("supplements a successful ECOS rate response with CPI and deposit-rate sources", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/KeyStatisticList/")) return ecosResponse();
      if (url.includes("nttId=10096672")) return new Response(fixture("bok-mpc.html"), { status: 200 });
      if (url.includes("nttId=10096927")) return new Response(fixture("bok-interest-rates-jan-2026.html"), { status: 200 });
      if (url.includes("kostat.go.kr")) return new Response(fixture("kostat-cpi-jan-2026.html"), { status: 200 });
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await fetchKoreaAssumptions();
    expect(result.partial.policyRatePct).toBe(2.5);
    expect(result.partial.newDepositAvgPct).toBe(2.78);
    expect(result.partial.cpiYoYPct).toBe(2);
    expect(result.asOfCandidate).toBe("2026-02-27");
    expect(result.warnings).toContain("ECOS_SUPPLEMENT_USED");
    expect(result.sources.map((source) => source.name)).toEqual(expect.arrayContaining([
      "ECOS KeyStatisticList",
      expect.stringContaining("BOK Interest Rates English"),
      expect.stringContaining("KOSTAT CPI English"),
    ]));
  });

  it("keeps other supplements when one HTML source fails", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/KeyStatisticList/")) return ecosResponse();
      if (url.includes("nttId=10096672")) return new Response(fixture("bok-mpc.html"), { status: 200 });
      if (url.includes("nttId=10096927")) return new Response("unavailable", { status: 503 });
      if (url.includes("kostat.go.kr")) return new Response(fixture("kostat-cpi-jan-2026.html"), { status: 200 });
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await fetchKoreaAssumptions();

    expect(result.partial.cpiYoYPct).toBe(2);
    expect(result.partial.newDepositAvgPct).toBeUndefined();
    expect(result.warnings).toContain("ECOS_SUPPLEMENT_USED");
    expect(result.warnings).toContain("BOK Interest Rates fetch failed: HTTP 503");
  });
});
