import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { __test__ as benefitsTest } from "../src/lib/publicApis/providers/benefits";

describe("benefits conditions normalization", () => {
  it("extracts condition/hint texts from fixture rows", () => {
    const file = join(process.cwd(), "tests", "fixtures", "benefits_serviceList.sample.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { data?: unknown[] };
    const rows = Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>[]) : [];
    const normalized = benefitsTest.normalizeBenefits(rows);
    expect(normalized.items.length).toBeGreaterThan(0);
    expect(normalized.items.some((item) => Array.isArray(item.eligibilityHints) && item.eligibilityHints.length > 0)).toBe(true);
  });
});
