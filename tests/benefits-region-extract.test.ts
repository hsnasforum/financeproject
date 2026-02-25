import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractRegionTagsFromTexts } from "../src/lib/regions/kr";
import { __test__ as benefitsTest } from "../src/lib/publicApis/providers/benefits";

function loadFixtureRows(): Record<string, unknown>[] {
  const file = join(process.cwd(), "tests", "fixtures", "benefits_serviceList.sample.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { data?: unknown[] };
  return Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>[]) : [];
}

describe("benefits region extraction", () => {
  it("extracts sido/sigungu tags from region text", () => {
    const region = extractRegionTagsFromTexts(["서울특별시 강남구 지원"]);
    expect(region.scope).toBe("REGIONAL");
    expect(region.tags).toContain("서울");
    expect(region.tags).toContain("서울 강남구");
  });

  it("detects nationwide scope", () => {
    const region = extractRegionTagsFromTexts(["전국 공통 신청 가능"]);
    expect(region.scope).toBe("NATIONWIDE");
    expect(region.tags).toContain("전국");
  });

  it("falls back to unknown when no region text exists", () => {
    const region = extractRegionTagsFromTexts(["소득 기준 충족 시 신청 가능"]);
    expect(region.scope).toBe("UNKNOWN");
    expect(region.tags).toContain("미상");
  });

  it("narrows results by sido using normalized fixture data", () => {
    const rows = loadFixtureRows();
    const normalized = benefitsTest.normalizeBenefits(rows).items;
    const allCount = normalized.length;
    const seoulOnly = normalized.filter((item) => item.region.scope === "REGIONAL" && item.region.tags.includes("서울"));
    expect(allCount).toBeGreaterThan(seoulOnly.length);
    expect(seoulOnly.length).toBe(1);
  });
});
