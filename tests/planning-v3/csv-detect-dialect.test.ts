import { describe, expect, it } from "vitest";
import { detectDelimiter } from "../../src/lib/planning/v3/providers/csv/detectDialect";

describe("detectDelimiter", () => {
  it("detects comma delimiter", () => {
    const csv = [
      "date,amount,desc",
      "2026-01-01,1000000,salary",
      "2026-01-02,-300000,rent",
    ].join("\n");

    expect(detectDelimiter(csv)).toBe(",");
  });

  it("detects tab delimiter", () => {
    const csv = [
      "date\tamount\tdesc",
      "2026-01-01\t1000000\tsalary",
      "2026-01-02\t-300000\trent",
    ].join("\n");

    expect(detectDelimiter(csv)).toBe("\t");
  });

  it("detects semicolon delimiter", () => {
    const csv = [
      "date;amount;desc",
      "2026-01-01;1000000;salary",
      "2026-01-02;-300000;rent",
    ].join("\n");

    expect(detectDelimiter(csv)).toBe(";");
  });
});
