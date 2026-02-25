import { describe, expect, it } from "vitest";
import { csvEscape } from "../src/lib/publicApis/benefitsCsv";

describe("benefits export csv", () => {
  it("escapes comma, quote and newline for csv", () => {
    const escaped = csvEscape('A,"B"\nC');
    expect(escaped).toBe('"A,""B""\nC"');
  });
});
