import { describe, expect, it } from "vitest";
import { __test__ } from "../src/lib/publicApis/providers/subscription";

describe("subscription region normalization", () => {
  it("maps area code prefix to region name", () => {
    expect(__test__.regionFromCode("100")).toBe("서울");
    expect(__test__.regionFromCode("600")).toBe("부산");
    expect(__test__.regionFromCode("11000")).toBe("서울");
    expect(__test__.regionFromCode("26000")).toBe("부산");
  });

  it("maps region name to code and normalizes text", () => {
    expect(__test__.normalizeRegionToken("서울특별시")).toBe("서울");
    expect(__test__.regionCodeFromName("서울특별시")).toBe("100");
  });
});
