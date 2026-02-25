import { describe, expect, it } from "vitest";
import { buildIntegratedDepositMetaUrl } from "../src/lib/products/depositIntegratedQuery";
import { parseIncludeSources } from "../src/lib/sources/includeSources";

describe("deposit integrated query", () => {
  it("builds default integrated params with finlife only", () => {
    const url = buildIntegratedDepositMetaUrl({
      includeKdb: false,
      depositProtection: "any",
      includeKdbOnly: false,
    });

    const parsed = new URL(url, "http://localhost");
    expect(parsed.searchParams.get("mode")).toBe("integrated");
    expect(parsed.searchParams.get("includeSources")).toBe("finlife");
    expect(parsed.searchParams.get("depositProtection")).toBe("any");
    expect(parsed.searchParams.get("includeKdbOnly")).toBeNull();
  });

  it("adds kdb and includeKdbOnly when enabled", () => {
    const url = buildIntegratedDepositMetaUrl({
      includeKdb: true,
      depositProtection: "require",
      includeKdbOnly: true,
      limit: 500,
    });

    const parsed = new URL(url, "http://localhost");
    expect(parsed.searchParams.get("includeSources")).toBe("finlife,datago_kdb");
    expect(parsed.searchParams.get("depositProtection")).toBe("require");
    expect(parsed.searchParams.get("includeKdbOnly")).toBe("1");
    expect(parsed.searchParams.get("limit")).toBe("500");
  });
});

describe("parseIncludeSources", () => {
  it("parses comma-separated values", () => {
    expect(parseIncludeSources("finlife,datago_kdb")).toEqual(["finlife", "datago_kdb"]);
  });

  it("parses repeated query style values", () => {
    expect(parseIncludeSources(["finlife", "datago_kdb"]).sort()).toEqual(["datago_kdb", "finlife"]);
  });
});
