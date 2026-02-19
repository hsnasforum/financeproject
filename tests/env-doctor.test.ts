import { describe, expect, it } from "vitest";
import { computeMissingKeys, computeNotLoadedYet, parseEnvKeys, parseEnvTemplate, validateApiUrls } from "../src/lib/dev/envDoctor";

describe("envDoctor utils", () => {
  it("parses required/optional keys from env template", () => {
    const tpl = `
KEXIM_API_KEY=
MOLIT_SALES_API_URL=
API_CACHE_STORE= # optional
# COMMENT=1
`;
    const parsed = parseEnvTemplate(tpl);
    expect(parsed.requiredKeys).toEqual(["KEXIM_API_KEY", "MOLIT_SALES_API_URL"]);
    expect(parsed.optionalKeys).toEqual(["API_CACHE_STORE"]);
  });

  it("computes missing and not-loaded keys", () => {
    const required = ["A", "B", "C"];
    const envLocalKeys = parseEnvKeys("A=\nC=\n");
    expect(computeMissingKeys(required, envLocalKeys)).toEqual(["B"]);
    expect(computeNotLoadedYet(envLocalKeys, ["A"])).toEqual(["C"]);
  });

  it("validates url format and query warnings", () => {
    const checks = validateApiUrls(
      [{ apiName: "molit-sales", required: ["MOLIT_SALES_API_KEY", "MOLIT_SALES_API_URL"] }],
      { MOLIT_SALES_API_KEY: "x", MOLIT_SALES_API_URL: "api.example.com/path?serviceKey=ABC" },
    );
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.warnings.some((w) => w.includes("http:// or https://"))).toBe(true);
    expect(checks[0]?.warnings.some((w) => w.includes("query string"))).toBe(true);
    expect(checks[0]?.warnings.some((w) => w.includes("key/token-like"))).toBe(true);
  });
});
