import { describe, expect, it } from "vitest";
import { normalizeName } from "../src/lib/sources/matching";
import { buildNormFilter } from "../src/lib/sources/search";

describe("search normalization", () => {
  it("normalizes Korean corporate markers deterministically", () => {
    expect(normalizeName("(주)BNK투자증권")).toBe("bnk투자증권");
    expect(normalizeName("  주식회사 BNK 투자증권  ")).toBe("bnk투자증권");
  });

  it("builds prefix mode filter with startsWith", () => {
    const where = buildNormFilter(["productNameNorm"], "bnk", "prefix") as {
      OR: Array<{ productNameNorm?: { startsWith?: string; contains?: string } }>;
    };
    expect(where.OR[0]?.productNameNorm?.startsWith).toBe("bnk");
    expect(where.OR[0]?.productNameNorm?.contains).toBeUndefined();
  });
});
